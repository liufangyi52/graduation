import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('offers task-only export on the task board', () => {
  const source = readFileSync('src/components/TaskBoardPage.vue', 'utf8')
  expect(source).toContain('导出我的任务')
  expect(source).toContain("'tasks'")
})
