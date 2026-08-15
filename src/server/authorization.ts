export type AuthorizationRole = 'manager' | 'member' | 'admin' | 'auditor'

export function canRegisterRole(role: AuthorizationRole): boolean {
  return role === 'member'
}

export function canUpdateTask(user: { role: AuthorizationRole; id: string }, assigneeId: string): boolean {
  if (user.role === 'member') return user.id === assigneeId
  return user.role === 'manager'
}

export function canManageProject(user: { role: AuthorizationRole; id: string }, ownerId: string): boolean {
  return user.role === 'manager' && user.id === ownerId
}

export const taskStatuses = ['todo', 'in_progress', 'completed', 'closed'] as const
export type TaskStatus = typeof taskStatuses[number]

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (taskStatuses as readonly string[]).includes(value)
}

export function isValidProgress(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100
}

export function normalizeTaskState(current: { status: TaskStatus; progress: number }, requested: { status?: TaskStatus; progress?: number }): { status: TaskStatus; progress: number } {
  let status = requested.status ?? current.status
  let progress = requested.progress ?? current.progress
  if (status === 'closed') return { status, progress }
  if (status === 'todo' && current.progress === 100 && requested.progress === undefined) progress = 0
  if (status === 'in_progress' && current.progress === 100 && requested.progress === undefined) progress = 99
  if (status === 'completed' || progress === 100) return { status: 'completed', progress: 100 }
  return { status, progress: Math.min(progress, 99) }
}

export function assertTaskUpdateInput(input: { status?: unknown; progress?: unknown }): void {
  if (input.status !== undefined && !isTaskStatus(input.status)) throw new Error('Invalid task status')
  if (input.progress !== undefined && !isValidProgress(input.progress)) throw new Error('Invalid task progress')
}

export function assertFeedbackInput(input: { content?: unknown; progress?: unknown }): void {
  if (typeof input.content !== 'string' || !input.content.trim()) throw new Error('Feedback content is required')
  if (!isValidProgress(input.progress)) throw new Error('Invalid feedback progress')
}

export function assertManagedTaskInput(input: { title?: unknown; assigneeId?: unknown; priority?: unknown; status?: unknown; progress?: unknown }): void {
  if (typeof input.title !== 'string' || !input.title.trim()) throw new Error('Task title is required')
  if (typeof input.assigneeId !== 'string' || !input.assigneeId.trim()) throw new Error('Task assignee is required')
  if (!['low', 'medium', 'high', 'urgent'].includes(String(input.priority))) throw new Error('Invalid task priority')
  if (input.status !== undefined && !isTaskStatus(input.status)) throw new Error('Invalid task status')
  if (input.progress !== undefined && !isValidProgress(input.progress)) throw new Error('Invalid task progress')
}

export function assertTaskStatusTransition(previous: TaskStatus, next: TaskStatus, manager: boolean): void {
  if ((previous === 'closed' || next === 'closed') && !manager) throw new Error('Only managers can close or reopen tasks')
}
