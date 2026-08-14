import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('does not expose an unusable task export action on the task board', () => {
  const source = readFileSync('src/components/TaskBoardPage.vue', 'utf8')
  expect(source).not.toContain('导出我的任务')
  expect(source).not.toContain('exportMyTasks')
})
