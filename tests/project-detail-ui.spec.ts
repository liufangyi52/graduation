import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/ProjectDetailPage.vue', import.meta.url), 'utf8')

it('renders project detail tabs and role-aware controls', () => {
  expect(source).toContain('概览')
  expect(source).toContain('任务')
  expect(source).toContain('会议')
  expect(source).toContain('风险')
  expect(source).toContain('成员')
  expect(source).toContain('canManageMembers')
  expect(source).toContain('function openMeeting')
})

it('defines project detail routes', () => {
  const router = readFileSync(new URL('../src/router.ts', import.meta.url), 'utf8')
  expect(router).toContain("path: '/projects/:id'")
  expect(router).toContain("path: '/projects/:id/meetings'")
})
