export type Status = 'todo' | 'committed' | 'in_progress' | 'done'
export type EntityType = 'pbi' | 'task' | 'feature' | 'cost'

export interface Project {
  id: number
  name: string
  created_at: string
}

export interface Room {
  id: number
  name: string
  project_id: number
}

export interface Feature {
  id: number
  name: string
  description: string
  project_id: number
}

export interface User {
  id: number
  name: string
  is_admin: boolean
}

export interface Task {
  id: number
  title: string
  description: string
  status: Status
  pbi_id: number
  assignee_id: number | null
}

export interface Cost {
  id: number
  title: string
  reason: string
  estimated_cost: number | null
  actual_cost: number | null
  purchased: boolean
  pbi_id: number
}

export interface PBI {
  id: number
  title: string
  description: string
  status: Status
  priority: number
  room_id: number
  feature_id: number | null
  assignee_id: number | null
  project_id: number
  tasks: Task[]
  costs: Cost[]
}

export interface Comment {
  id: number
  entity_type: EntityType
  entity_id: number
  body: string
  author_id: number | null
  created_at: string
}

const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // keep statusText
    }
    throw new Error(detail)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  listProjects: () => request<Project[]>('/projects'),
  createProject: (name: string) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  updateProject: (id: number, payload: Partial<{ name: string }>) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteProject: (id: number) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  listProjectUsers: (projectId: number) => request<User[]>(`/projects/${projectId}/users`),
  addProjectUser: (projectId: number, userId: number) =>
    request<void>(`/projects/${projectId}/users/${userId}`, { method: 'PUT' }),
  removeProjectUser: (projectId: number, userId: number) =>
    request<void>(`/projects/${projectId}/users/${userId}`, { method: 'DELETE' }),

  listRooms: (projectId: number) => request<Room[]>(`/rooms?project_id=${projectId}`),
  createRoom: (name: string, projectId: number) =>
    request<Room>('/rooms', { method: 'POST', body: JSON.stringify({ name, project_id: projectId }) }),
  updateRoom: (id: number, payload: Partial<{ name: string }>) =>
    request<Room>(`/rooms/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteRoom: (id: number) => request<void>(`/rooms/${id}`, { method: 'DELETE' }),

  listFeatures: (projectId: number) => request<Feature[]>(`/features?project_id=${projectId}`),
  createFeature: (name: string, projectId: number, description = '') =>
    request<Feature>('/features', {
      method: 'POST',
      body: JSON.stringify({ name, project_id: projectId, description }),
    }),
  updateFeature: (id: number, payload: Partial<{ name: string; description: string }>) =>
    request<Feature>(`/features/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteFeature: (id: number) => request<void>(`/features/${id}`, { method: 'DELETE' }),

  listUsers: () => request<User[]>('/users'),
  createUser: (name: string, isAdmin = false) =>
    request<User>('/users', { method: 'POST', body: JSON.stringify({ name, is_admin: isAdmin }) }),
  updateUser: (id: number, payload: Partial<{ name: string; is_admin: boolean }>) =>
    request<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteUser: (id: number) => request<void>(`/users/${id}`, { method: 'DELETE' }),

  listPbis: (projectId: number) => request<PBI[]>(`/pbis?project_id=${projectId}`),
  createPbi: (payload: {
    title: string
    room_id: number
    description?: string
    status?: Status
    feature_id?: number | null
    assignee_id?: number | null
  }) => request<PBI>('/pbis', { method: 'POST', body: JSON.stringify(payload) }),
  updatePbi: (
    id: number,
    payload: Partial<{
      title: string
      description: string
      status: Status
      priority: number
      room_id: number
      feature_id: number | null
      assignee_id: number | null
    }>,
  ) => request<PBI>(`/pbis/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePbi: (id: number) => request<void>(`/pbis/${id}`, { method: 'DELETE' }),

  createTask: (payload: {
    title: string
    pbi_id: number
    description?: string
    status?: Status
    assignee_id?: number | null
  }) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (
    id: number,
    payload: Partial<{
      title: string
      description: string
      status: Status
      assignee_id: number | null
    }>,
  ) => request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  createCost: (payload: {
    title: string
    pbi_id: number
    reason?: string
    estimated_cost?: number | null
    actual_cost?: number | null
    purchased?: boolean
  }) => request<Cost>('/costs', { method: 'POST', body: JSON.stringify(payload) }),
  updateCost: (
    id: number,
    payload: Partial<{
      title: string
      reason: string
      estimated_cost: number | null
      actual_cost: number | null
      purchased: boolean
    }>,
  ) => request<Cost>(`/costs/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteCost: (id: number) => request<void>(`/costs/${id}`, { method: 'DELETE' }),

  listComments: (entityType: EntityType, entityId: number) =>
    request<Comment[]>(`/comments?entity_type=${entityType}&entity_id=${entityId}`),
  createComment: (payload: {
    entity_type: EntityType
    entity_id: number
    body: string
    author_id: number | null
  }) => request<Comment>('/comments', { method: 'POST', body: JSON.stringify(payload) }),
  deleteComment: (id: number) => request<void>(`/comments/${id}`, { method: 'DELETE' }),

  uploadImage: async (file: File): Promise<string> => {
    const form = new FormData()
    form.append('file', file)
    const response = await fetch(`${API_BASE}/uploads`, { method: 'POST', body: form })
    if (!response.ok) {
      let detail = response.statusText
      try {
        const body = (await response.json()) as { detail?: string }
        if (body.detail) detail = body.detail
      } catch {
        // keep statusText
      }
      throw new Error(detail)
    }
    const data = (await response.json()) as { url: string }
    return `${API_BASE}${data.url}`
  },
}

// Board lanes, in display order. To add or reorder a lane, update the Status
// type above, this list, STATUS_LABELS, and the matching Literal in
// backend/app/schemas.py — the board, dashboard, and modals all derive from it.
export const STATUSES: Status[] = ['todo', 'committed', 'in_progress', 'done']

// Global board order: lower priority value first, id as tie-breaker.
export const comparePriority = (a: PBI, b: PBI): number => a.priority - b.priority || a.id - b.id

// The amount a cost item counts for: the actual price once known, the estimate before that.
export const costAmount = (cost: Cost): number => cost.actual_cost ?? cost.estimated_cost ?? 0

// Whole euros show without decimals (€ 35), anything else with cents (€ 35,50).
const euroWhole = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const euroCents = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

export const formatEuro = (amount: number): string =>
  (Number.isInteger(amount) ? euroWhole : euroCents).format(amount)

export const STATUS_LABELS: Record<Status, string> = {
  todo: 'Backlog',
  committed: 'Committed',
  in_progress: 'In Progress',
  done: 'Done',
}
