import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from './api'
import type { Project, Task, View } from './types'

function Sortable({
  id,
  as = 'li',
  className,
  children,
}: {
  id: number
  as?: 'li' | 'div'
  className: string
  children: ReactNode
}) {
  const { setNodeRef, transform, transition, listeners, isDragging } = useSortable({ id })
  const Tag = as
  return (
    <Tag
      ref={setNodeRef}
      className={isDragging ? `${className} dragging` : className}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...listeners}
    >
      {children}
    </Tag>
  )
}

// 前後の要素の position の中間値を計算する(端なら ±1)
function positionBetween(prev: { position: number } | undefined, next: { position: number } | undefined, fallback: number): number {
  if (prev && next) return (prev.position + next.position) / 2
  if (prev) return prev.position + 1
  if (next) return next.position - 1
  return fallback
}

type Theme = 'system' | 'light' | 'dark'

function loadTheme(): Theme {
  const t = localStorage.getItem('theme')
  return t === 'light' || t === 'dark' ? t : 'system'
}

const THEME_LABEL: Record<Theme, string> = {
  system: 'テーマ: システム',
  light: 'テーマ: ライト',
  dark: 'テーマ: ダーク',
}

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDue(due: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const d = new Date(`${due}T00:00:00`)
  if (d.getTime() === today.getTime()) return '今日'
  if (d.getTime() === tomorrow.getTime()) return '明日'
  const label = `${d.getMonth() + 1}月${d.getDate()}日`
  if (d < today) return `期限切れ · ${label}`
  return label
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [view, setView] = useState<View>({ kind: 'inbox' })
  const [showCompleted, setShowCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(loadTheme)

  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [addingProject, setAddingProject] = useState(false)
  const [editing, setEditing] = useState<{
    id: number
    title: string
    description: string
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  )
  // ドラッグ直後のクリックイベントを無視するためのフラグ
  const justDragged = useRef(false)
  const suppressClickAfterDrag = (e: React.SyntheticEvent) => {
    if (justDragged.current) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  useEffect(() => {
    if (theme === 'system') {
      delete document.documentElement.dataset.theme
      localStorage.removeItem('theme')
    } else {
      document.documentElement.dataset.theme = theme
      localStorage.setItem('theme', theme)
    }

    // ブラウザUI(ステータスバー等)の色を実際の配色に合わせる
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const applyMetaColor = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#1d1c1a' : '#faf9f7')
    }
    applyMetaColor()
    mq.addEventListener('change', applyMetaColor)
    return () => mq.removeEventListener('change', applyMetaColor)
  }, [theme])

  const cycleTheme = () =>
    setTheme((t) => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system'))

  useEffect(() => {
    Promise.all([api.listProjects(), api.listTasks()])
      .then(([p, t]) => {
        setProjects(p)
        setTasks(t)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.position - b.position || a.id - b.id),
    [projects]
  )

  const visibleTasks = useMemo(() => {
    const today = todayStr()
    return tasks
      .filter((t) => {
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
      .sort((a, b) => a.completed - b.completed || a.position - b.position || a.id - b.id)
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

  const selectView = (v: View) => {
    setView(v)
    setSidebarOpen(false)
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

  const afterDrag = () => {
    justDragged.current = true
    setTimeout(() => {
      justDragged.current = false
    }, 120)
  }

  const handleTaskDragEnd = (e: DragEndEvent) => {
    afterDrag()
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = visibleTasks.findIndex((t) => t.id === active.id)
    const newIndex = visibleTasks.findIndex((t) => t.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(visibleTasks, oldIndex, newIndex)
    const moved = reordered[newIndex]
    const position = positionBetween(reordered[newIndex - 1], reordered[newIndex + 1], moved.position)
    setTasks((ts) => ts.map((t) => (t.id === moved.id ? { ...t, position } : t)))
    run(async () => {
      await api.updateTask(moved.id, { position })
    })
  }

  const handleProjectDragEnd = (e: DragEndEvent) => {
    afterDrag()
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = sortedProjects.findIndex((p) => p.id === active.id)
    const newIndex = sortedProjects.findIndex((p) => p.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(sortedProjects, oldIndex, newIndex)
    const moved = reordered[newIndex]
    const position = positionBetween(reordered[newIndex - 1], reordered[newIndex + 1], moved.position)
    setProjects((ps) => ps.map((p) => (p.id === moved.id ? { ...p, position } : p)))
    run(async () => {
      await api.updateProject(moved.id, { position })
    })
  }

  const startEdit = (t: Task) =>
    setEditing({ id: t.id, title: t.title, description: t.description ?? '' })

  const saveEdit = () =>
    run(async () => {
      if (!editing) return
      const title = editing.title.trim()
      if (!title) return
      const updated = await api.updateTask(editing.id, {
        title,
        description: editing.description.trim() || null,
      })
      setTasks((ts) => ts.map((t) => (t.id === editing.id ? updated : t)))
      setEditing(null)
    })

  const addProject = () =>
    run(async () => {
      const name = newProjectName.trim()
      if (!name) return
      const created = await api.createProject(name)
      setProjects((ps) => [...ps, created])
      setNewProjectName('')
      setAddingProject(false)
      selectView({ kind: 'project', id: created.id })
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
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
        <div className="logo">
          <svg viewBox="0 0 512 512" width="28" height="28" aria-hidden="true">
            <defs>
              <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f26c5a" />
                <stop offset="1" stopColor="#d1453b" />
              </linearGradient>
            </defs>
            <rect width="512" height="512" rx="115" fill="url(#logo-g)" />
            <path
              d="M148 268l78 78 138-158"
              stroke="#fff"
              strokeWidth="48"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span>MyTodo</span>
        </div>

        <nav>
          <button
            className={view.kind === 'inbox' ? 'nav-item active' : 'nav-item'}
            onClick={() => selectView({ kind: 'inbox' })}
          >
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" />
              </svg>
            </span>
            インボックス
            {countFor({ kind: 'inbox' }) > 0 && (
              <span className="count">{countFor({ kind: 'inbox' })}</span>
            )}
          </button>
          <button
            className={view.kind === 'today' ? 'nav-item active' : 'nav-item'}
            onClick={() => selectView({ kind: 'today' })}
          >
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </span>
            今日
            {countFor({ kind: 'today' }) > 0 && (
              <span className="count">{countFor({ kind: 'today' })}</span>
            )}
          </button>
        </nav>

        <div className="projects-header">
          <span>プロジェクト</span>
          <button
            className="icon-btn"
            title="プロジェクトを追加"
            onClick={() => setAddingProject((v) => !v)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
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
              onBlur={() => {
                if (!newProjectName.trim()) setAddingProject(false)
              }}
            />
          </form>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleProjectDragEnd}
        >
          <SortableContext
            items={sortedProjects.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <nav className="project-list" onClickCapture={suppressClickAfterDrag}>
              {sortedProjects.map((p) => (
                <Sortable key={p.id} id={p.id} as="div" className="project-row">
                  <button
                    className={
                      view.kind === 'project' && view.id === p.id ? 'nav-item active' : 'nav-item'
                    }
                    onClick={() => selectView({ kind: 'project', id: p.id })}
                  >
                    <span className="nav-icon hash">#</span>
                    <span className="nav-label">{p.name}</span>
                    {countFor({ kind: 'project', id: p.id }) > 0 && (
                      <span className="count">{countFor({ kind: 'project', id: p.id })}</span>
                    )}
                  </button>
                  <button
                    className="icon-btn delete"
                    title="削除"
                    onClick={() => removeProject(p.id)}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </Sortable>
              ))}
            </nav>
          </SortableContext>
        </DndContext>
      </aside>

      <main className="main">
        <header className="main-header">
          <button className="hamburger" aria-label="メニュー" onClick={() => setSidebarOpen(true)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h2>{viewTitle}</h2>
          <button
            className="icon-btn theme-btn"
            title={THEME_LABEL[theme]}
            aria-label={THEME_LABEL[theme]}
            onClick={cycleTheme}
          >
            {theme === 'light' ? (
              // 太陽
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
              </svg>
            ) : theme === 'dark' ? (
              // 月
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            ) : (
              // モニター(システム)
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            )}
          </button>
          <label className="show-completed">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            完了済み
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
            placeholder="タスクを追加"
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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleTaskDragEnd}
        >
          <SortableContext
            items={visibleTasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="task-list" onClickCapture={suppressClickAfterDrag}>
              {visibleTasks.map((t) =>
            editing?.id === t.id ? (
              <li key={t.id} className="task editing">
                <form
                  className="task-edit"
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveEdit()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditing(null)
                  }}
                >
                  <input
                    autoFocus
                    className="edit-title"
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    placeholder="タスク名"
                  />
                  <textarea
                    className="edit-desc"
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="説明"
                    rows={3}
                  />
                  <div className="edit-actions">
                    <button type="button" className="ghost-btn" onClick={() => setEditing(null)}>
                      キャンセル
                    </button>
                    <button type="submit" className="add-btn" disabled={!editing.title.trim()}>
                      保存
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <Sortable key={t.id} id={t.id} className={t.completed ? 'task done' : 'task'}>
                <input
                  type="checkbox"
                  className="task-check"
                  checked={!!t.completed}
                  onChange={() => toggleTask(t)}
                  aria-label={t.completed ? '未完了に戻す' : '完了にする'}
                />
                <div
                  className="task-body"
                  role="button"
                  tabIndex={0}
                  title="クリックして編集"
                  onClick={() => startEdit(t)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') startEdit(t)
                  }}
                >
                  <span className="task-title">{t.title}</span>
                  {t.description && <span className="task-desc">{t.description}</span>}
                  <span className="task-meta">
                    {t.due_date && (
                      <span
                        className={t.due_date < todayStr() && !t.completed ? 'due overdue' : 'due'}
                      >
                        {formatDue(t.due_date)}
                      </span>
                    )}
                    {view.kind !== 'project' && t.project_id !== null && (
                      <span className="task-project">
                        # {projects.find((p) => p.id === t.project_id)?.name}
                      </span>
                    )}
                  </span>
                </div>
                <button className="icon-btn delete" title="削除" onClick={() => removeTask(t.id)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              </Sortable>
            )
          )}
              {!loading && visibleTasks.length === 0 && (
                <li className="empty">
                  <span className="empty-icon">🎉</span>
                  タスクはありません
                </li>
              )}
            </ul>
          </SortableContext>
        </DndContext>
      </main>
    </div>
  )
}
