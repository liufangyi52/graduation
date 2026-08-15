import { expect, it, vi } from 'vitest'
import { exportFilename, meetingRows, taskRows, downloadProjectExport } from '../src/utils/projectExport'

const toFile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const writeXlsxFile = vi.hoisted(() => vi.fn().mockReturnValue({ toFile }))
vi.mock('write-excel-file/browser', () => ({ default: writeXlsxFile }))

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

it('exports xlsx rows through write-excel-file with a schema and existing filename', async () => {
  writeXlsxFile.mockClear()
  toFile.mockClear()
  await downloadProjectExport({ project: { name: 'Alpha' }, tasks: [{ title: 'Release', progress: 50 }] }, 'tasks', 'xlsx', '2026-08-16')

  expect(writeXlsxFile).toHaveBeenCalledWith(
    expect.any(Array),
    expect.objectContaining({ sheet: '任务清单', columns: expect.any(Array) }),
  )
  const [rows, options] = writeXlsxFile.mock.calls[0]
  expect(rows[0]).toMatchObject({ '任务标题': 'Release', '进度': '50%' })
  expect(options.columns[0]).toEqual(expect.objectContaining({ header: expect.any(String), cell: expect.any(Function) }))
  expect(toFile).toHaveBeenCalledWith('Alpha-任务清单-2026-08-16.xlsx')
})
