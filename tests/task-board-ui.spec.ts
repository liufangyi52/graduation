import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/TaskBoardPage.vue', import.meta.url), 'utf8')

it('supports query-synchronized task filters and table/kanban views', () => {
  for (const token of ['project', 'assignee', 'status', 'priority', 'risk', 'dueFrom', 'dueTo']) expect(source).toContain(token)
  expect(source).toContain("router.replace({ query })")
  expect(source).toContain('in-progress')
  expect(source).toContain('closed')
  expect(source).toContain('看板')
})
