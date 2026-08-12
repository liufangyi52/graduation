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

export function assertTaskUpdateInput(input: { status?: unknown; progress?: unknown }): void {
  if (input.status !== undefined && !isTaskStatus(input.status)) throw new Error('Invalid task status')
  if (input.progress !== undefined && !isValidProgress(input.progress)) throw new Error('Invalid task progress')
}

export function assertFeedbackInput(input: { content?: unknown; progress?: unknown }): void {
  if (typeof input.content !== 'string' || !input.content.trim()) throw new Error('Feedback content is required')
  if (!isValidProgress(input.progress)) throw new Error('Invalid feedback progress')
}
