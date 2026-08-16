import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const meetingImportSource = readFileSync(new URL('../src/components/MeetingImportPage.vue', import.meta.url), 'utf8')
const styleSource = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

it('uses a three-column meeting import workspace', () => {
  expect(appSource).toContain('MeetingImportPage')
  expect(meetingImportSource).toContain('class="meeting-import-grid"')
  expect(meetingImportSource).toContain('会议信息')
  expect(meetingImportSource).toContain('纪要文件')
  expect(meetingImportSource).toContain('原文预览')
  expect(styleSource).toMatch(/\.meeting-import-grid\s*\{[^}]*grid-template-columns:/)
  expect(styleSource).toMatch(/\.meeting-content-field textarea\s*\{[^}]*min-height:/)
})

it('provides text or file minute intake and a version history action', () => {
  expect(meetingImportSource).toContain('type="file"')
  expect(meetingImportSource).toContain('accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"')
  expect(meetingImportSource).toContain('版本记录')
})

it('provides a usable drop zone and file status treatment', () => {
  expect(meetingImportSource).toContain('@drop.prevent="onDrop"')
  expect(meetingImportSource).toContain('meeting-file-row')
  expect(styleSource).toMatch(/\.meeting-drop-zone\s*\{[^}]*border:/)
  expect(styleSource).toMatch(/\.meeting-file-row\s*\{[^}]*grid-template-columns:/)
})

it('provides a manager-only project member management action', () => {
  expect(appSource).toContain('项目成员')
  expect(appSource).toContain('showProjectMembers')
})
