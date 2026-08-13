import { expect, it } from 'vitest'
import { exportFilename, taskRows } from '../src/utils/projectExport'

it('creates localized task export filenames and structured task rows', () => {
  expect(exportFilename('会议系统', 'tasks', 'xlsx', '2026-08-13')).toBe('会议系统-任务清单-2026-08-13.xlsx')
  expect(taskRows([{ projectName: 'Alpha', title: '完善导出', description: '', assigneeName: '张三', priority: 'high', status: 'todo', progress: 0, createdAt: '2026-08-01', dueDate: null }])[0]).toMatchObject({ '任务标题': '完善导出', '负责人': '张三' })
})
