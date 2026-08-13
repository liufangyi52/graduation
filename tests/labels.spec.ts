import { expect, it } from 'vitest'
import { analysisStatusLabel, priorityLabel, projectRoleLabel, projectStatusLabel, riskLevelLabel, riskStatusLabel, systemRoleLabel, taskStatusLabel } from '../src/utils/labels'

it('maps project and task classifications to Chinese semantic tags', () => {
  expect(projectStatusLabel('active')).toEqual({ label: '进行中', tone: 'blue' })
  expect(projectStatusLabel('paused')).toEqual({ label: '已暂停', tone: 'amber' })
  expect(projectStatusLabel('暂停')).toEqual({ label: '已暂停', tone: 'amber' })
  expect(projectStatusLabel('archived')).toEqual({ label: '已归档', tone: 'gray' })
  expect(taskStatusLabel('todo')).toEqual({ label: '待开始', tone: 'gray' })
  expect(taskStatusLabel('in_progress')).toEqual({ label: '进行中', tone: 'blue' })
  expect(taskStatusLabel('in-progress')).toEqual({ label: '进行中', tone: 'blue' })
  expect(taskStatusLabel('completed')).toEqual({ label: '已完成', tone: 'green' })
  expect(taskStatusLabel('closed')).toEqual({ label: '已关闭', tone: 'gray' })
  expect(priorityLabel('low')).toEqual({ label: '低', tone: 'gray' })
  expect(priorityLabel('medium')).toEqual({ label: '中', tone: 'blue' })
  expect(priorityLabel('high')).toEqual({ label: '高', tone: 'amber' })
  expect(priorityLabel('urgent')).toEqual({ label: '紧急', tone: 'red' })
})

it('maps risks, analyses, and roles to Chinese semantic tags', () => {
  expect(riskLevelLabel('low')).toEqual({ label: '低风险', tone: 'green' })
  expect(riskLevelLabel('medium')).toEqual({ label: '中风险', tone: 'amber' })
  expect(riskLevelLabel('high')).toEqual({ label: '高风险', tone: 'red' })
  expect(riskStatusLabel('open')).toEqual({ label: '待处理', tone: 'amber' })
  expect(riskStatusLabel('跟进中')).toEqual({ label: '跟进中', tone: 'blue' })
  expect(riskStatusLabel('resolved')).toEqual({ label: '已处理', tone: 'green' })
  expect(analysisStatusLabel('pending')).toEqual({ label: '待审核', tone: 'amber' })
  expect(analysisStatusLabel('approved')).toEqual({ label: '已通过', tone: 'green' })
  expect(analysisStatusLabel('rejected')).toEqual({ label: '已驳回', tone: 'red' })
  expect(analysisStatusLabel('未分析')).toEqual({ label: '未分析', tone: 'gray' })
  expect(systemRoleLabel('admin')).toEqual({ label: '系统管理员', tone: 'purple' })
  expect(systemRoleLabel('auditor')).toEqual({ label: '审计人员', tone: 'purple' })
  expect(systemRoleLabel('审计员')).toEqual({ label: '审计人员', tone: 'purple' })
  expect(projectRoleLabel('manager')).toEqual({ label: '项目经理', tone: 'blue' })
  expect(projectRoleLabel('member')).toEqual({ label: '项目成员', tone: 'gray' })
})

it('uses a neutral tag for unknown values', () => {
  expect(projectStatusLabel('future_state')).toEqual({ label: 'future_state', tone: 'gray' })
  expect(riskStatusLabel(null)).toEqual({ label: '未设置', tone: 'gray' })
})
