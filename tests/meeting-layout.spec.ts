import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const styleSource = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

it('uses a scoped full-width layout for the meeting submission form', () => {
  expect(appSource).toContain('class="meeting-form"')
  expect(appSource).toContain('class="meeting-field"')
  expect(styleSource).toMatch(/\.meeting-form\s*\{[^}]*padding:/)
  expect(styleSource).toMatch(/\.meeting-field\s*>\s*input,\s*\.meeting-field\s*>\s*textarea\s*\{[^}]*width:\s*100%/)
  expect(styleSource).toMatch(/\.meeting-field\s*>\s*textarea\s*\{[^}]*min-height:/)
})

it('provides text or file minute intake and a version history action', () => {
  expect(appSource).toContain('type="file"')
  expect(appSource).toContain('accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"')
  expect(appSource).toContain('版本记录')
})

it('provides a manager-only project member management action', () => {
  expect(appSource).toContain('项目成员')
  expect(appSource).toContain('showProjectMembers')
})
