import { expect, it } from 'vitest'
import { auditLogDetailsLabel, auditLogEntityLabel } from '../src/utils/auditLogPresentation'

it('renders audit object types in Chinese while retaining their identifiers', () => {
  expect(auditLogEntityLabel('user', 'u-1')).toBe('账号 / u-1')
  expect(auditLogEntityLabel('project', 'p-1')).toBe('项目 / p-1')
  expect(auditLogEntityLabel('task', 't-1')).toBe('任务 / t-1')
  expect(auditLogEntityLabel('risk', 'r-1')).toBe('风险 / r-1')
  expect(auditLogEntityLabel('future', 'x-1')).toBe('future / x-1')
})

it('renders known audit detail fields and values in Chinese', () => {
  expect(auditLogDetailsLabel('{"role":"manager","status":"in_progress","progress":60}'))
    .toBe('角色：项目经理；状态：进行中；进度：60%')
  expect(auditLogDetailsLabel('{"projectId":"p-1","indexedChunks":0}'))
    .toBe('项目 ID：p-1；索引分块数：0')
})

it('keeps unknown and malformed audit details inspectable', () => {
  expect(auditLogDetailsLabel('{"newField":"value"}')).toBe('newField：value')
  expect(auditLogDetailsLabel('not-json')).toBe('not-json')
  expect(auditLogDetailsLabel('{}')).toBe('无变更详情')
})
