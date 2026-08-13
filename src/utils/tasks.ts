import type { Task } from '../services/workspaceService'

export function selectDeadlineWatchTasks(tasks: Task[]) {
  return tasks.slice(0, 2)
}
