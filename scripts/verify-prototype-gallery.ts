import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const screenIds = [
  'dashboard',
  'project-detail',
  'meeting-import',
  'ai-review',
  'task-board',
  'risk-center',
  'my-tasks',
  'task-feedback',
  'settings',
  'audit-log',
]
const requiredSelectors = ['.app-shell', '.sidebar', '.topbar', '.prototype-screen']
const managerLandmarks = ['待审核会议', '项目甘特图', '提交 AI 分析', '候选任务', '待处理', '风险详情']
const roleLandmarks = ['我的任务', '提交反馈', 'AI 服务配置', '操作前快照', '暂无通知', '重新加载']
const outputFiles = [
  '登录界面.png',
  '注册界面.png',
  '系统架构图.png',
  '项目经理1.png',
  '项目经理2.png',
  '项目经理3.png',
  '项目经理4.png',
  '项目经理5.png',
  '项目经理6.png',
  '项目经理7.png',
  '项目经理8.png',
  '项目经理9.png',
  '项目经理10.png',
  '项目成员1.png',
  '项目成员2.png',
  '项目成员3.png',
  '项目成员4.png',
  '项目成员5.png',
  '项目成员6.png',
  '项目成员8.png',
  '项目成员9.png',
  '项目成员10.png',
  '项目成员11.png',
  '系统管理员1.png',
  '系统管理员2.png',
  '系统管理员3.png',
  '系统管理员4.png',
  '系统管理员5.png',
  '审计人员1.png',
  '审计人员2.png',
  '审计人员3.png',
  'meeting-task-system-high-fidelity-prototype.pdf',
]

function readRequired(relativePath: string) {
  const filePath = path.join(root, relativePath)
  if (!existsSync(filePath)) throw new Error(`Prototype gallery contract failed: missing ${relativePath}`)
  return readFileSync(filePath, 'utf8')
}

const html = readRequired('prototype/index.html')
const css = readRequired('prototype/prototype.css')
const missing = [
  ...screenIds.filter((screenId) => !html.includes(`data-screen="${screenId}"`)),
  ...requiredSelectors.filter((selector) => !css.includes(selector)),
  ...managerLandmarks.filter((landmark) => !html.includes(landmark)),
  ...roleLandmarks.filter((landmark) => !html.includes(landmark)),
]

if (missing.length) throw new Error(`Prototype gallery contract failed: ${missing.join(', ')}`)

if (process.argv.includes('--outputs')) {
  const missingOutputs = outputFiles.filter((fileName) => !existsSync(path.join(root, 'docs', 'prototypes', fileName)))
  if (missingOutputs.length) throw new Error(`Prototype output contract failed: ${missingOutputs.join(', ')}`)
}

console.log(`Prototype gallery contract passed for ${screenIds.length} screens.`)
