import { expect, it } from 'vitest'
import type { Task } from '../src/services/workspaceService'
import { selectDeadlineWatchTasks } from '../src/utils/tasks'

const task = (id: string, due: string): Task => ({
  id,
  title: `Task ${id}`,
  project: 'Project',
  owner: 'Owner',
  due,
  priority: '中',
  rawPriority: 'medium',
  state: 'todo',
  progress: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
})

it('keeps only the first two deadline-watch tasks in due-date order', () => {
  const tasks = [task('first', '2026-08-14'), task('second', '2026-08-15'), task('third', '2026-08-16')]

  expect(selectDeadlineWatchTasks(tasks).map((item) => item.id)).toEqual(['first', 'second'])
})
