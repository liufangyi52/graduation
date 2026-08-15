import { expect, it } from 'vitest'
import { exportFilename, meetingRows, taskRows } from '../src/utils/projectExport'

it('creates localized task export filenames and structured task rows', () => {
  expect(exportFilename('会议系统', 'tasks', 'xlsx', '2026-08-13')).toBe('会议系统-任务清单-2026-08-13.xlsx')
  expect(taskRows([{ projectName: 'Alpha', title: '完善导出', description: '', assigneeName: '张三', priority: 'high', status: 'todo', progress: 0, createdAt: '2026-08-01', dueDate: null }])[0]).toMatchObject({ '任务标题': '完善导出', '负责人': '张三' })
})

it('formats exported task timestamps as Beijing time to the minute', () => {
  const row = taskRows([{
    title: 'Ship',
    createdAt: '2026-08-15T08:00:00.000Z',
    dueDate: '2026-08-30T16:00:00.000Z',
  }])[0]

  expect(row).toMatchObject({ 创建时间: '2026-08-15 16:00', 截止日期: '2026-08-31 00:00' })
})

it('formats exported meeting timestamps as Beijing time to the minute', () => {
  const row = meetingRows([{ title: 'Kickoff', createdAt: '2026-08-15T08:00:00.000Z' }])[0]
  expect(row).toMatchObject({ 创建时间: '2026-08-15 16:00' })
})
