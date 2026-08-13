import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('contains manager project, review, and task workflow handlers', () => {
  const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  for (const name of ['openProjectEditor', 'manageProjectTags', 'manageDesensitizationRules', 'submitReviewBatch', 'reanalyze', 'openTaskEditor', 'saveTask', 'submitTaskNote']) {
    expect(source).toContain(name)
  }
})
