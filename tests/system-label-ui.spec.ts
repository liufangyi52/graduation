import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

it('renders application classifications through the shared Chinese label dictionary', () => {
  const app = source('../src/App.vue')
  const detail = source('../src/components/ProjectDetailPage.vue')
  const board = source('../src/components/TaskBoardPage.vue')
  const review = source('../src/components/MeetingReviewPage.vue')

  for (const name of ['taskStatusLabel', 'priorityLabel', 'riskLevelLabel', 'riskStatusLabel', 'analysisStatusLabel', 'systemRoleLabel', 'projectRoleLabel']) expect(app).toContain(name)
  for (const name of ['projectStatusLabel', 'taskStatusLabel', 'priorityLabel', 'riskLevelLabel', 'riskStatusLabel', 'analysisStatusLabel', 'systemRoleLabel', 'projectRoleLabel']) expect(detail).toContain(name)
  for (const name of ['taskStatusLabel', 'priorityLabel']) expect(board).toContain(name)
  expect(review).toContain('analysisStatusLabel')
})

it('defines a dedicated purple tag tone for administrative roles', () => {
  const styles = source('../src/style.css')
  expect(styles).toContain('.tag.purple')
})
