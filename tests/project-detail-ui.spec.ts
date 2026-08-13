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

it('defines a scannable and responsive project detail layout', () => {
  const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

  expect(source).toContain('class="project-summary-main"')
  expect(source).toContain('class="project-summary-facts"')
  expect(source).toContain('class="project-overview-body"')
  expect(source).toContain('class="metric-grid project-metrics"')
  expect(styles).toContain('.project-detail-header {')
  expect(styles).toContain('.project-summary-main {')
  expect(styles).toContain('.project-detail-page .detail-tabs {')
  expect(styles).toContain('@media (max-width: 900px)')
})

it('gives the active project detail tab a distinct visual state', () => {
  const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

  expect(source).toContain(':class="{ selected: activeTab === tab.id }"')
  expect(styles).toContain('.detail-tabs button.selected {')
  expect(styles).toContain('color: var(--secondary)')
  expect(styles).toContain('font-weight: 700')
  expect(styles).toContain('border-bottom: 2px solid var(--secondary)')
})
