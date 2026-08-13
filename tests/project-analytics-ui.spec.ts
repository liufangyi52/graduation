import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('declares analytics and project export controls', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')
  expect(source).toContain("{ id: 'analytics', label: '分析' }")
  expect(source).toContain('导出项目数据')
  expect(source).toContain('getProjectExportData')
  expect(source).toContain('暂无可追溯的任务完成记录')
})

it('renders semantic gantt and burndown chart regions from completion timestamps', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')
  expect(source).toContain('project-gantt')
  expect(source).toContain('burndown-chart')
  expect(source).toContain('completedAt: task.completedAt')
  expect(source).toContain('gantt-bar')
})
