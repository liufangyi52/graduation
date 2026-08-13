import { expect, it } from 'vitest'
import { averageTaskProgress } from '../src/utils/progress'

it('calculates the dashboard completion rate from current task progress', () => {
  expect(averageTaskProgress([
    { progress: 0 },
    { progress: 65 },
    { progress: 100 },
  ])).toBe(55)
})

it('returns no completion rate when there are no visible tasks', () => {
  expect(averageTaskProgress([])).toBeNull()
})
