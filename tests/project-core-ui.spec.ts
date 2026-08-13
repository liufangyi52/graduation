import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('contains manager project, review, and task workflow handlers', () => {
  const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  for (const name of ['openProjectEditor', 'manageProjectTags', 'manageDesensitizationRules', 'submitReviewBatch', 'reanalyze', 'openTaskEditor', 'saveTask', 'closeOrReopenTask', 'submitTaskNote', 'loadDeletedProjects', 'restoreDeletedProject', 'toggleDesensitizationRule']) {
    expect(source).toContain(name)
  }
})

it('exposes project recovery, rule management, and task detail workflows to managers', () => {
  const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  for (const fragment of [
    'v-model="projectDraft.description"',
    '已删除项目',
    '恢复项目',
    'v-model="ruleDraft.enabled"',
    '更新规则',
    '编辑任务',
    '关闭任务',
    '任务备注',
    'v-if="canManageBusiness"',
  ]) {
    expect(source).toContain(fragment)
  }
})
