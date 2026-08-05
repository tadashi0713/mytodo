export type Project = {
  id: number
  name: string
  position: number
}

export type Task = {
  id: number
  title: string
  description: string | null
  project_id: number | null
  due_date: string | null
  completed: 0 | 1
  position: number
}

export type View = { kind: 'inbox' } | { kind: 'today' } | { kind: 'project'; id: number }
