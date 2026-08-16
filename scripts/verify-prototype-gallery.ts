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
  '01-dashboard.png',
  '02-project-detail.png',
  '03-meeting-import.png',
  '04-ai-review.png',
  '05-task-board.png',
  '06-risk-center.png',
  '07-my-tasks.png',
  '08-task-feedback.png',
  '09-settings.png',
  '10-audit-log.png',
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
