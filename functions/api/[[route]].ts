import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { getCookie } from 'hono/cookie'
import { createRemoteJWKSet, jwtVerify } from 'jose'

type Env = {
  Bindings: {
    DB: D1Database
    // Cloudflare Access 連携(未設定なら検証をスキップ = ローカル開発用)
    CF_ACCESS_TEAM_DOMAIN?: string // 例: "myteam.cloudflareaccess.com"
    CF_ACCESS_AUD?: string // Access アプリケーションの AUD タグ
  }
}

const app = new Hono<Env>().basePath('/api')

// ---- Cloudflare Access の JWT 検証 ----
// Access を有効化しても、設定ミスで API が素通しにならないための二重防御。
// エッジで Access が挟まっていれば Cf-Access-Jwt-Assertion ヘッダが必ず付く。

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
let jwksTeam = ''

app.use('*', async (c, next) => {
  const team = c.env.CF_ACCESS_TEAM_DOMAIN
  const aud = c.env.CF_ACCESS_AUD
  if (!team || !aud) return next()

  const token =
    c.req.header('Cf-Access-Jwt-Assertion') ?? getCookie(c, 'CF_Authorization')
  if (!token) return c.json({ error: 'unauthorized' }, 401)

  if (!jwks || jwksTeam !== team) {
    jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`))
    jwksTeam = team
  }
  try {
    await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud })
  } catch {
    return c.json({ error: 'unauthorized' }, 401)
  }
  return next()
})

// ---- プロジェクト ----

app.get('/projects', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, position FROM projects ORDER BY position, id'
  ).all()
  return c.json(results)
})

app.post('/projects', async (c) => {
  const body = await c.req.json<{ name?: string }>()
  const name = body.name?.trim()
  if (!name) return c.json({ error: 'name is required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO projects (name, position) VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM projects)) RETURNING id, name, position'
  )
    .bind(name)
    .first()
  return c.json(result, 201)
})

app.patch('/projects/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400)
  const body = await c.req.json<{ position?: number }>()
  if (typeof body.position !== 'number' || !Number.isFinite(body.position)) {
    return c.json({ error: 'position is required' }, 400)
  }
  const result = await c.env.DB.prepare(
    'UPDATE projects SET position = ? WHERE id = ? RETURNING id, name, position'
  )
    .bind(body.position, id)
    .first()
  if (!result) return c.json({ error: 'not found' }, 404)
  return c.json(result)
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
    'SELECT id, title, description, project_id, due_date, completed, position FROM tasks ORDER BY completed, position, id'
  ).all()
  return c.json(results)
})

app.post('/tasks', async (c) => {
  const body = await c.req.json<{
    title?: string
    description?: string | null
    project_id?: number | null
    due_date?: string | null
  }>()
  const title = body.title?.trim()
  if (!title) return c.json({ error: 'title is required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO tasks (title, description, project_id, due_date, position) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks)) RETURNING id, title, description, project_id, due_date, completed, position'
  )
    .bind(title, body.description?.trim() || null, body.project_id ?? null, body.due_date ?? null)
    .first()
  return c.json(result, 201)
})

app.patch('/tasks/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400)
  const body = await c.req.json<{
    title?: string
    description?: string | null
    project_id?: number | null
    due_date?: string | null
    completed?: boolean
    position?: number
  }>()

  const sets: string[] = []
  const binds: unknown[] = []
  if (body.title !== undefined) {
    const title = body.title.trim()
    if (!title) return c.json({ error: 'title must not be empty' }, 400)
    sets.push('title = ?')
    binds.push(title)
  }
  if (body.description !== undefined) {
    sets.push('description = ?')
    binds.push(body.description?.trim() || null)
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
  if (body.position !== undefined) {
    if (typeof body.position !== 'number' || !Number.isFinite(body.position)) {
      return c.json({ error: 'invalid position' }, 400)
    }
    sets.push('position = ?')
    binds.push(body.position)
  }
  if (sets.length === 0) return c.json({ error: 'no fields to update' }, 400)

  const result = await c.env.DB.prepare(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = ? RETURNING id, title, description, project_id, due_date, completed, position`
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
