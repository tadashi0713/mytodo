import type { Project, Task } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (name: string) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteProject: (id: number) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),

  listTasks: () => request<Task[]>('/api/tasks'),
  createTask: (input: { title: string; project_id: number | null; due_date: string | null }) =>
    request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(input) }),
  updateTask: (
    id: number,
    patch: Partial<Pick<Task, 'title' | 'description' | 'project_id' | 'due_date'>> & {
      completed?: boolean
    }
  ) => request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTask: (id: number) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
}
