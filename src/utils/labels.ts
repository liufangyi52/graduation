export type TagTone = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple'
export interface DisplayLabel { label: string; tone: TagTone }

function labelFor(value: unknown, labels: Record<string, DisplayLabel>): DisplayLabel {
  const key = String(value ?? '').trim()
  return labels[key] ?? { label: key || '未设置', tone: 'gray' }
}

export function projectStatusLabel(value: unknown): DisplayLabel {
  return labelFor(value, {
    active: { label: '进行中', tone: 'blue' },
    paused: { label: '已暂停', tone: 'amber' },
    archived: { label: '已归档', tone: 'gray' },
    进行中: { label: '进行中', tone: 'blue' },
    暂停: { label: '已暂停', tone: 'amber' },
    已暂停: { label: '已暂停', tone: 'amber' },
    已归档: { label: '已归档', tone: 'gray' },
  })
}

export function taskStatusLabel(value: unknown): DisplayLabel {
  return labelFor(value, {
    todo: { label: '待开始', tone: 'gray' },
    in_progress: { label: '进行中', tone: 'blue' },
    'in-progress': { label: '进行中', tone: 'blue' },
    completed: { label: '已完成', tone: 'green' },
    closed: { label: '已关闭', tone: 'gray' },
    待开始: { label: '待开始', tone: 'gray' },
    进行中: { label: '进行中', tone: 'blue' },
    已完成: { label: '已完成', tone: 'green' },
    已关闭: { label: '已关闭', tone: 'gray' },
  })
}

export function priorityLabel(value: unknown): DisplayLabel {
  return labelFor(value, {
    low: { label: '低', tone: 'gray' },
    medium: { label: '中', tone: 'blue' },
    high: { label: '高', tone: 'amber' },
    urgent: { label: '紧急', tone: 'red' },
    低: { label: '低', tone: 'gray' },
    中: { label: '中', tone: 'blue' },
    高: { label: '高', tone: 'amber' },
    紧急: { label: '紧急', tone: 'red' },
  })
}

export function riskLevelLabel(value: unknown): DisplayLabel {
  return labelFor(value, {
    low: { label: '低风险', tone: 'green' },
    medium: { label: '中风险', tone: 'amber' },
    high: { label: '高风险', tone: 'red' },
    低风险: { label: '低风险', tone: 'green' },
    中风险: { label: '中风险', tone: 'amber' },
    高风险: { label: '高风险', tone: 'red' },
  })
}

export function riskStatusLabel(value: unknown): DisplayLabel {
  return labelFor(value, {
    open: { label: '待处理', tone: 'amber' },
    pending: { label: '待处理', tone: 'amber' },
    in_progress: { label: '跟进中', tone: 'blue' },
    'in-progress': { label: '跟进中', tone: 'blue' },
    resolved: { label: '已处理', tone: 'green' },
    待处理: { label: '待处理', tone: 'amber' },
    跟进中: { label: '跟进中', tone: 'blue' },
    已处理: { label: '已处理', tone: 'green' },
  })
}

export function analysisStatusLabel(value: unknown): DisplayLabel {
  return labelFor(value, {
    pending: { label: '待审核', tone: 'amber' },
    approved: { label: '已通过', tone: 'green' },
    rejected: { label: '已驳回', tone: 'red' },
    待审核: { label: '待审核', tone: 'amber' },
    已通过: { label: '已通过', tone: 'green' },
    已驳回: { label: '已驳回', tone: 'red' },
    未分析: { label: '未分析', tone: 'gray' },
  })
}

export function systemRoleLabel(value: unknown): DisplayLabel {
  return labelFor(value, {
    manager: { label: '项目经理', tone: 'blue' },
    member: { label: '项目成员', tone: 'gray' },
    admin: { label: '系统管理员', tone: 'purple' },
    auditor: { label: '审计人员', tone: 'purple' },
    项目经理: { label: '项目经理', tone: 'blue' },
    项目成员: { label: '项目成员', tone: 'gray' },
    系统管理员: { label: '系统管理员', tone: 'purple' },
    审计人员: { label: '审计人员', tone: 'purple' },
    审计员: { label: '审计人员', tone: 'purple' },
  })
}

export function projectRoleLabel(value: unknown): DisplayLabel {
  return labelFor(value, {
    manager: { label: '项目经理', tone: 'blue' },
    member: { label: '项目成员', tone: 'gray' },
    项目经理: { label: '项目经理', tone: 'blue' },
    项目成员: { label: '项目成员', tone: 'gray' },
  })
}
