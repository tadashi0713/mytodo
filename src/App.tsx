import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import type { Project, Task, View } from './types'

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDue(due: string): string {
  const today = todayStr()
  if (due === today) return '今日'
  if (due < today) return `期限切れ ${due.slice(5).replace('-', '/')}`
  return due.slice(5).replace('-', '/')
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [view, setView] = useState<View>({ kind: 'inbox' })
  const [showCompleted, setShowCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [addingProject, setAddingProject] = useState(false)

  useEffect(() => {
    Promise.all([api.listProjects(), api.listTasks()])
      .then(([p, t]) => {
        setProjects(p)
        setTasks(t)
      })
      .catch((e) => setError(String(e)))
  }, [])

  const visibleTasks = useMemo(() => {
    const today = todayStr()
    return tasks.filter((t) => {
      if (!showCompleted && t.completed) return false
      switch (view.kind) {
        case 'inbox':
          return t.project_id === null
        case 'today':
          return t.due_date !== null && t.due_date <= today
        case 'project':
          return t.project_id === view.id
      }
    })
  }, [tasks, view, showCompleted])

  const viewTitle =
    view.kind === 'inbox'
      ? 'インボックス'
      : view.kind === 'today'
        ? '今日'
        : (projects.find((p) => p.id === view.id)?.name ?? '')

  const countFor = (v: View) => {
    const today = todayStr()
    return tasks.filter((t) => {
      if (t.completed) return false
      if (v.kind === 'inbox') return t.project_id === null
      if (v.kind === 'today') return t.due_date !== null && t.due_date <= today
      return t.project_id === v.id
    }).length
  }

  async function run(fn: () => Promise<void>) {
    try {
      setError(null)
      await fn()
    } catch (e) {
      setError(String(e))
    }
  }

  const addTask = () =>
    run(async () => {
      const title = newTitle.trim()
      if (!title) return
      const project_id = view.kind === 'project' ? view.id : null
      const due_date = newDue || (view.kind === 'today' ? todayStr() : null)
      const created = await api.createTask({ title, project_id, due_date })
      setTasks((ts) => [...ts, created])
      setNewTitle('')
      setNewDue('')
    })

  const toggleTask = (task: Task) =>
    run(async () => {
      const updated = await api.updateTask(task.id, { completed: !task.completed })
      setTasks((ts) => ts.map((t) => (t.id === task.id ? updated : t)))
    })

  const removeTask = (id: number) =>
    run(async () => {
      await api.deleteTask(id)
      setTasks((ts) => ts.filter((t) => t.id !== id))
    })

  const addProject = () =>
    run(async () => {
      const name = newProjectName.trim()
      if (!name) return
      const created = await api.createProject(name)
      setProjects((ps) => [...ps, created])
      setNewProjectName('')
      setAddingProject(false)
      setView({ kind: 'project', id: created.id })
    })

  const removeProject = (id: number) =>
    run(async () => {
      if (!confirm('このプロジェクトと中のタスクをすべて削除しますか?')) return
      await api.deleteProject(id)
      setProjects((ps) => ps.filter((p) => p.id !== id))
      setTasks((ts) => ts.filter((t) => t.project_id !== id))
      if (view.kind === 'project' && view.id === id) setView({ kind: 'inbox' })
    })

  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="logo">MyTodo</h1>
        <nav>
          <button
            className={view.kind === 'inbox' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView({ kind: 'inbox' })}
          >
            📥 インボックス <span className="count">{countFor({ kind: 'inbox' })}</span>
          </button>
          <button
            className={view.kind === 'today' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView({ kind: 'today' })}
          >
            📅 今日 <span className="count">{countFor({ kind: 'today' })}</span>
          </button>
        </nav>
        <div className="projects-header">
          <span>プロジェクト</span>
          <button className="icon-btn" title="プロジェクトを追加" onClick={() => setAddingProject((v) => !v)}>
            ＋
          </button>
        </div>
        {addingProject && (
          <form
            className="project-form"
            onSubmit={(e) => {
              e.preventDefault()
              addProject()
            }}
          >
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="プロジェクト名"
            />
          </form>
        )}
        <nav>
          {projects.map((p) => (
            <div key={p.id} className="project-row">
              <button
                className={view.kind === 'project' && view.id === p.id ? 'nav-item active' : 'nav-item'}
                onClick={() => setView({ kind: 'project', id: p.id })}
              >
                # {p.name} <span className="count">{countFor({ kind: 'project', id: p.id })}</span>
              </button>
              <button className="icon-btn delete" title="削除" onClick={() => removeProject(p.id)}>
                ×
              </button>
            </div>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="main-header">
          <h2>{viewTitle}</h2>
          <label className="show-completed">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            完了済みを表示
          </label>
        </header>

        {error && <div className="error">{error}</div>}

        <form
          className="task-form"
          onSubmit={(e) => {
            e.preventDefault()
            addTask()
          }}
        >
          <input
            className="task-input"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="タスクを追加..."
          />
          <input
            className="due-input"
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            title="期限(任意)"
          />
          <button type="submit" className="add-btn" disabled={!newTitle.trim()}>
            追加
          </button>
        </form>

        <ul className="task-list">
          {visibleTasks.map((t) => (
            <li key={t.id} className={t.completed ? 'task done' : 'task'}>
              <input type="checkbox" checked={!!t.completed} onChange={() => toggleTask(t)} />
              <span className="task-title">{t.title}</span>
              {view.kind === 'today' && t.project_id !== null && (
                <span className="task-project">
                  # {projects.find((p) => p.id === t.project_id)?.name}
                </span>
              )}
              {t.due_date && (
                <span className={t.due_date < todayStr() && !t.completed ? 'due overdue' : 'due'}>
                  {formatDue(t.due_date)}
                </span>
              )}
              <button className="icon-btn delete" title="削除" onClick={() => removeTask(t.id)}>
                ×
              </button>
            </li>
          ))}
          {visibleTasks.length === 0 && <li className="empty">タスクはありません 🎉</li>}
        </ul>
      </main>
    </div>
  )
}
