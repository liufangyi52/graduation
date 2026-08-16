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
]

if (missing.length) throw new Error(`Prototype gallery contract failed: ${missing.join(', ')}`)

console.log(`Prototype gallery contract passed for ${screenIds.length} screens.`)
