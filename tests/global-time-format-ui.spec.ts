import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const meetingImportSource = readFileSync(new URL('../src/components/MeetingImportPage.vue', import.meta.url), 'utf8')
const workspaceSource = readFileSync(new URL('../src/services/workspaceService.ts', import.meta.url), 'utf8')
const taskBoardSource = readFileSync(new URL('../src/components/TaskBoardPage.vue', import.meta.url), 'utf8')
const projectDetailSource = readFileSync(new URL('../src/components/ProjectDetailPage.vue', import.meta.url), 'utf8')

it('formats every App read-only timestamp with formatBeijingMinute', () => {
  for (const binding of [
    'formatBeijingMinute(review.time)',
    'formatBeijingMinute(task.due)',
    'formatBeijingMinute(log.created_at)',
    'formatBeijingMinute(item.time)',
    'formatBeijingMinute(project.deadline)',
    'formatBeijingMinute(task.createdAt)',
    'formatBeijingMinute(item.createdAt)',
    'formatBeijingMinute(selectedNotification.time)',
    'formatBeijingMinute(selectedTask.due)',
    'formatBeijingMinute(note.created_at)',
    'formatBeijingMinute(project.deleted_at)',
  ]) expect(appSource).toContain(binding)

  for (const rawBinding of [
    '{{ review.time }}', '{{ task.due }}', '{{ log.created_at }}', '{{ item.time }}',
    '{{ project.deadline }}', '{{ item.createdAt }}',
    '{{ selectedNotification.time }}', '{{ selectedTask.due }}', '{{ note.created_at }}',
    '{{ project.deleted_at }}',
  ]) expect(appSource).not.toContain(rawBinding)

  expect(meetingImportSource).toContain("import { formatBeijingMinute } from '../utils/date'")
  expect(meetingImportSource).toContain('{{ formatBeijingMinute(version.createdAt) }}')
  expect(meetingImportSource).not.toContain("new Date(version.createdAt).toLocaleString('zh-CN')")

  expect(appSource).not.toContain('formatBeijingDateTime(task.createdAt)')
})

it('stores a real timestamp for newly submitted feedback', () => {
  expect(workspaceSource).toContain('createdAt: new Date().toISOString()')
  expect(workspaceSource).not.toContain("createdAt: '刚刚'")
})

it('formats task board and project detail timestamps', () => {
  expect(taskBoardSource).toContain("import { formatBeijingMinute } from '../utils/date'")
  expect(taskBoardSource).toContain('{{ formatBeijingMinute(task.due) }}')
  expect(taskBoardSource).not.toContain('{{ task.due }}')

  for (const binding of [
    'formatBeijingMinute(task.dueDate)',
    'formatBeijingMinute(meeting.createdAt)',
    'formatBeijingMinute(risk.createdAt)',
  ]) expect(projectDetailSource).toContain(binding)

  expect(projectDetailSource).not.toContain("{{ task.dueDate || '未设置' }}")
  expect(projectDetailSource).not.toContain('{{ meeting.createdAt }}')
  expect(projectDetailSource).not.toContain('{{ risk.createdAt }}')
})
