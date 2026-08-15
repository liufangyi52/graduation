import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { auditActionLabel } from '../src/utils/auditActionLabels'

it('maps known audit events to Chinese operation labels', () => {
  expect(auditActionLabel('project.rag_index_synced')).toBe('项目知识库索引已同步')
  expect(auditActionLabel('risk.resolved')).toBe('风险已解决')
  expect(auditActionLabel('task.updated')).toBe('任务已更新')
  expect(auditActionLabel('user.password_reset')).toBe('账号密码已重置')
  expect(auditActionLabel('analysis.assignment_enriched')).toBe('分析任务分配已补充')
})

it('preserves an unknown audit event code for traceability', () => {
  expect(auditActionLabel('future.action')).toBe('future.action')
  expect(auditActionLabel(null)).toBe('')
})

it('uses Chinese labels in every audit operation table', () => {
  const appPath = fileURLToPath(new URL('../src/App.vue', import.meta.url))
  const appSource = readFileSync(appPath, 'utf8')

  expect(appSource.match(/auditActionLabel\(log\.action\)/g)).toHaveLength(3)
})

it('uses localized labels for audit objects and details', () => {
  const appPath = fileURLToPath(new URL('../src/App.vue', import.meta.url))
  const appSource = readFileSync(appPath, 'utf8')

  expect(appSource.match(/auditLogEntityLabel\(log\.entity_type, log\.entity_id\)/g)).toHaveLength(3)
  expect(appSource).toContain('auditLogDetailsLabel(log.details)')
})
