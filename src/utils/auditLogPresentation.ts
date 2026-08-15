const entityLabels: Record<string, string> = {
  analysis: '分析记录',
  desensitization_rule: '脱敏规则',
  meeting: '会议',
  notification: '通知',
  notification_demo: '演示通知',
  project: '项目',
  project_member: '项目成员',
  project_tag: '项目标签',
  risk: '风险',
  system_settings: '系统设置',
  task: '任务',
  task_feedback: '任务反馈',
  task_note: '任务备注',
  user: '账号',
}

const fieldLabels: Record<string, string> = {
  assigneeId: '负责人 ID',
  audienceType: '通知对象',
  code: '项目编码',
  created: '创建数量',
  decisionCount: '决策数量',
  desensitize: '自动脱敏',
  durationMs: '耗时',
  enabled: '启用',
  fields: '更新字段',
  indexedChunks: '索引分块数',
  kind: '导出类型',
  missingRoles: '缺少角色',
  mode: '运行模式',
  model: '模型',
  modelCallCount: '模型调用次数',
  name: '名称',
  priority: '优先级',
  progress: '进度',
  projectId: '项目 ID',
  projectRole: '项目角色',
  retrievalStatus: '检索状态',
  riskCount: '风险数量',
  role: '角色',
  scope: '导出范围',
  sourceVersionId: '来源版本 ID',
  status: '状态',
  taskCount: '任务数量',
  taskId: '任务 ID',
  title: '标题',
  userId: '账号 ID',
  versionNumber: '版本号',
}

const valueLabels: Record<string, string> = {
  active: '进行中',
  admin: '系统管理员',
  agent: '智能体',
  all: '全部',
  archived: '已归档',
  auditor: '审计员',
  closed: '已关闭',
  completed: '已完成',
  csv: 'CSV',
  high: '高',
  in_progress: '进行中',
  low: '低',
  manager: '项目经理',
  manual: '人工审核',
  member: '项目成员',
  medium: '中',
  notification: '通知',
  paused: '已暂停',
  pending: '待处理',
  project: '项目',
  rag: 'RAG',
  success: '成功',
  task: '任务',
  todo: '待开始',
  urgent: '紧急',
}

function localizeValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(localizeValue).join('、')
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (value === null) return '无'
  const text = String(value)
  return valueLabels[text] ?? text
}

function formatDetailEntry([field, value]: [string, unknown]): string {
  const label = fieldLabels[field] ?? field
  const localized = localizeValue(value)
  return `${label}：${field === 'progress' && value !== null ? `${localized}%` : localized}`
}

export function auditLogEntityLabel(entityType: unknown, entityId: unknown): string {
  const type = String(entityType ?? '')
  const id = entityId == null ? '-' : String(entityId)
  return `${entityLabels[type] ?? type} / ${id}`
}

export function auditLogDetailsLabel(details: unknown): string {
  if (details == null || details === '') return '无变更详情'

  let parsed = details
  if (typeof details === 'string') {
    try {
      parsed = JSON.parse(details)
    } catch {
      return details
    }
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return String(parsed)

  const entries = Object.entries(parsed as Record<string, unknown>)
  return entries.length ? entries.map(formatDetailEntry).join('；') : '无变更详情'
}
