import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatBeijingMinute } from './date'

export type ExportKind = 'meetings' | 'tasks' | 'summary'
export type ExportFormat = 'xlsx' | 'pdf'
export interface ExportTask { projectName?: string; title: string; description?: string | null; assigneeName?: string; priority?: string; status?: string; progress?: number; createdAt?: string; dueDate?: string | null }
export interface ExportMeeting { title: string; createdAt?: string; latestAnalysisStatus?: string | null; summary?: string | null; decisions?: string[]; versionCount?: number }
export interface ExportPayload { project: { name: string; [key: string]: unknown }; tasks?: ExportTask[]; meetings?: ExportMeeting[]; risks?: Array<Record<string, unknown>>; metrics?: Record<string, unknown> }

const labels: Record<ExportKind, string> = { meetings: '会议纪要', tasks: '任务清单', summary: '项目统计' }
const text = (value: unknown) => String(value ?? '')
export function exportFilename(projectName: string, kind: ExportKind, format: ExportFormat, date: string) { return `${projectName.replace(/[\\/:*?"<>|]/g, '_')}-${labels[kind]}-${date}.${format}` }
export function taskRows(tasks: ExportTask[]) { return tasks.map((task) => ({ 项目: task.projectName ?? '', 任务标题: task.title, 描述: task.description ?? '', 负责人: task.assigneeName ?? '', 优先级: task.priority ?? '', 状态: task.status ?? '', 进度: `${task.progress ?? 0}%`, 创建时间: task.createdAt ? formatBeijingMinute(task.createdAt) : '-', 截止日期: task.dueDate ? formatBeijingMinute(task.dueDate) : '-' })) }
export function meetingRows(meetings: ExportMeeting[]) { return meetings.map((meeting) => ({ 会议标题: meeting.title, 创建时间: meeting.createdAt ? formatBeijingMinute(meeting.createdAt) : '-', 审核状态: meeting.latestAnalysisStatus ?? '未分析', 摘要: meeting.summary ?? '', 决议: (meeting.decisions ?? []).join('；'), 版本数: meeting.versionCount ?? 0 })) }
function rows(payload: ExportPayload, kind: ExportKind): Array<Record<string, unknown>> { if (kind === 'tasks') return taskRows(payload.tasks ?? []); if (kind === 'meetings') return meetingRows(payload.meetings ?? []); return Object.entries(payload.metrics ?? {}).map(([key, value]) => ({ 指标: key, 数值: value })) }
export async function downloadProjectExport(payload: ExportPayload, kind: ExportKind, format: ExportFormat, date = new Date().toISOString().slice(0, 10)) {
  const filename = exportFilename(payload.project.name, kind, format, date); const data = rows(payload, kind)
  if (format === 'xlsx') { const sheet = XLSX.utils.json_to_sheet(data); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, labels[kind]); XLSX.writeFile(book, filename); return }
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); pdf.setFontSize(16); pdf.text(`${payload.project.name} - ${labels[kind]}`, 14, 16)
  autoTable(pdf, { head: [data.length ? Object.keys(data[0]) : ['说明']], body: data.length ? data.map((row) => Object.values(row).map(text)) : [['暂无数据']], startY: 24, styles: { fontSize: 8 } }); pdf.save(filename)
}
