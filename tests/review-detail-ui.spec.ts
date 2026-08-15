import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/MeetingReviewPage.vue', import.meta.url), 'utf8')

it('renders evidence and editable review draft fields', () => {
  expect(source).toContain('证据')
  expect(source).toContain('v-model="draft.summary"')
  expect(source).toContain('v-model="task.title"')
  expect(source).toContain('saveReviewDraft')
  expect(source).toContain('addTask')
  expect(source).toContain('removeTask')
  expect(source).toContain('addDecision')
  expect(source).toContain('removeDecision')
  expect(source).toContain('addRisk')
  expect(source).toContain('removeRisk')
  expect(source).toContain('v-model="draft.decisions[index]"')
  expect(source).toContain('v-model="risk.title"')
})

it('lets managers link a review risk to a candidate task or keep it project-level', () => {
  expect(source).toContain('v-model.number="risk.task_index"')
  expect(source).toContain('项目级风险')
  expect(source).toContain('关联任务：')
  expect(source).toContain('risk.task_index === index')
})

it('validates rejection reason and confirms destructive actions', () => {
  expect(source).toContain('reason.value.trim().length')
  expect(source).toContain('confirm')
  expect(source).toContain('reanalyze')
})
