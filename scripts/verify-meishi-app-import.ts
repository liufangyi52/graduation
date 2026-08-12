import 'dotenv/config'
import { pool } from '../src/server/database'

const expectedAssignments = new Map([
  ['确认最终需求并输出上线验收文档', ['美食记产品经理', '2026-08-13']],
  ['完成最终 UI 定稿、切图与设计规范', ['美食记UI设计师', '2026-08-16']],
  ['完成前端视觉适配修改收尾', ['美食记UI设计师', '2026-08-18']],
  ['完成后端接口开发与自测', ['美食记后端开发', '2026-08-20']],
  ['完成前端页面、交互及接口联调', ['美食记前端开发', '2026-08-22']],
  ['完成后端联调问题收尾', ['美食记后端开发', '2026-08-24']],
  ['完成前端缺陷修复', ['美食记前端开发', '2026-08-25']],
  ['完成全量测试与缺陷闭环', ['美食记测试人员', '2026-08-28']],
  ['出具正式测试验收报告', ['美食记测试人员', '2026-08-29']],
  ['完成应用商店资料与初始内容筹备', ['美食记运营人员', '2026-08-30']],
  ['完成上线审批与正式发布', ['嘻嘻项目经理1', '2026-08-31']],
])

function chinaDate(value: Date | string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

async function main() {
  const [projects] = await pool.query<any[]>('SELECT id,start_date,end_date,status FROM projects WHERE code=?', ['MEISHI-2026'])
  const project = projects[0]
  if (!project || chinaDate(project.start_date) !== '2026-08-11' || chinaDate(project.end_date) !== '2026-08-31' || project.status !== 'active') throw new Error('Project metadata does not match the meeting schedule')
  const [tasks] = await pool.query<any[]>('SELECT t.title,t.due_date,t.status,u.name assignee_name FROM tasks t JOIN users u ON u.id=t.assignee_id WHERE t.project_id=?', [project.id])
  if (tasks.length !== expectedAssignments.size) throw new Error(`Expected ${expectedAssignments.size} tasks, found ${tasks.length}`)
  for (const task of tasks) {
    const expected = expectedAssignments.get(task.title)
    if (!expected || task.assignee_name !== expected[0] || chinaDate(task.due_date) !== expected[1] || task.status !== 'todo') throw new Error(`Unexpected task assignment: ${task.title}`)
  }
  const [analyses] = await pool.query<any[]>('SELECT a.status FROM ai_analyses a JOIN meetings m ON m.id=a.meeting_id WHERE m.project_id=? AND m.title=?', [project.id, '美食记 APP 制作项目推进会议纪要'])
  if (analyses.length !== 1 || analyses[0].status !== 'approved') throw new Error('Meeting analysis is not approved')
  const [risks] = await pool.query<any[]>('SELECT id FROM risks WHERE project_id=? AND status="open"', [project.id])
  const [notifications] = await pool.query<any[]>('SELECT n.id FROM notifications n JOIN tasks t ON n.link=CONCAT("/tasks/",t.id) WHERE t.project_id=?', [project.id])
  if (!risks.length || notifications.length !== expectedAssignments.size) throw new Error('Risk or task notification records are incomplete')
  console.log(JSON.stringify({ project: 'MEISHI-2026', analysis: 'approved', tasks: tasks.length, assigned: tasks.length, openRisks: risks.length, notifications: notifications.length }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(async () => {
  await pool.end()
})
