export type ProjectProgressEvent = {
  id: string
  projectId: string
  taskId: string
  taskTitle: string
  actorId: string
  actorName: string
  eventType: 'task_updated' | 'feedback_created'
  beforeProgress: number
  afterProgress: number
  beforeStatus: string
  afterStatus: string
  feedbackContent?: string
  createdAt: string
}
