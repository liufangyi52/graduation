import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/TaskBoardPage.vue', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')

it('supports query-synchronized task filters in the default table view', () => {
  for (const token of ['project', 'assignee', 'status', 'priority', 'risk', 'dueFrom', 'dueTo']) expect(source).toContain(token)
  expect(source).toContain("router.replace({ query })")
  expect(source).toContain('in-progress')
  expect(source).toContain('closed')
  expect(source).toContain('任务列表')
  expect(source).not.toContain('看板')
})

it('does not expose internal task identifiers on member task cards', () => {
  expect(appSource).toContain('class="member-task-card"')
  expect(appSource).not.toContain('<span class="mono">{{ task.id }}</span>')
})
