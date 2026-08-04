import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

type Env = {
  Bindings: {
    DB: D1Database
  }
}

const app = new Hono<Env>().basePath('/api')

// ---- プロジェクト ----

app.get('/projects', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name FROM projects ORDER BY id'
  ).all()
  return c.json(results)
})

app.post('/projects', async (c) => {
  const body = await c.req.json<{ name?: string }>()
  const name = body.name?.trim()
  if (!name) return c.json({ error: 'name is required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO projects (name) VALUES (?) RETURNING id, name'
  )
    .bind(name)
    .first()
  return c.json(result, 201)
})

app.delete('/projects/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400)
  // D1 では外部キーの CASCADE が既定で有効だが、明示的に消して確実にする
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM tasks WHERE project_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id),
  ])
  return c.body(null, 204)
})

// ---- タスク ----

app.get('/tasks', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, title, project_id, due_date, completed FROM tasks ORDER BY completed, due_date IS NULL, due_date, id'
  ).all()
  return c.json(results)
})

app.post('/tasks', async (c) => {
  const body = await c.req.json<{
    title?: string
    project_id?: number | null
    due_date?: string | null
  }>()
  const title = body.title?.trim()
  if (!title) return c.json({ error: 'title is required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO tasks (title, project_id, due_date) VALUES (?, ?, ?) RETURNING id, title, project_id, due_date, completed'
  )
    .bind(title, body.project_id ?? null, body.due_date ?? null)
    .first()
  return c.json(result, 201)
})

app.patch('/tasks/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400)
  const body = await c.req.json<{
    title?: string
    project_id?: number | null
    due_date?: string | null
    completed?: boolean
  }>()

  const sets: string[] = []
  const binds: unknown[] = []
  if (body.title !== undefined) {
    const title = body.title.trim()
    if (!title) return c.json({ error: 'title must not be empty' }, 400)
    sets.push('title = ?')
    binds.push(title)
  }
  if (body.project_id !== undefined) {
    sets.push('project_id = ?')
    binds.push(body.project_id)
  }
  if (body.due_date !== undefined) {
    sets.push('due_date = ?')
    binds.push(body.due_date)
  }
  if (body.completed !== undefined) {
    sets.push('completed = ?')
    binds.push(body.completed ? 1 : 0)
  }
  if (sets.length === 0) return c.json({ error: 'no fields to update' }, 400)

  const result = await c.env.DB.prepare(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = ? RETURNING id, title, project_id, due_date, completed`
  )
    .bind(...binds, id)
    .first()
  if (!result) return c.json({ error: 'not found' }, 404)
  return c.json(result)
})

app.delete('/tasks/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400)
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run()
  return c.body(null, 204)
})

export const onRequest = handle(app)
