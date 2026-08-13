import 'dotenv/config'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'
import { migrate } from '../src/server/migrate'

const runId = randomUUID()
const prefix = `project-core-smoke-${runId}`
const managerId = randomUUID()
const memberId = randomUUID()
let projectId = ''
let meetingId = ''

const manager = { id: managerId, role: 'manager' as const, name: `${prefix}-manager`, email: `${prefix}-manager@example.com` }
const member = { id: memberId, role: 'member' as const, name: `${prefix}-member`, email: `${prefix}-member@example.com` }

async function cleanup() {
  if (projectId) {
    await pool.execute('DELETE FROM desensitization_logs WHERE meeting_version_id IN (SELECT id FROM meeting_versions WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id=?))', [projectId])
    await pool.execute('DELETE FROM task_notes WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)', [projectId])
    await pool.execute('DELETE FROM task_feedbacks WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)', [projectId])
    await pool.execute('DELETE FROM notifications WHERE user_id IN (?,?)', [managerId, memberId])
    await pool.execute('DELETE FROM risks WHERE project_id=?', [projectId])
    await pool.execute('DELETE FROM ai_analyses WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id=?)', [projectId])
    await pool.execute('DELETE FROM meeting_versions WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id=?)', [projectId])
    await pool.execute('DELETE FROM meetings WHERE project_id=?', [projectId])
    await pool.execute('DELETE FROM tasks WHERE project_id=?', [projectId])
    await pool.execute('DELETE FROM project_tag_links WHERE project_id=?', [projectId])
    await pool.execute('DELETE FROM project_tags WHERE project_id=?', [projectId])
    await pool.execute('DELETE FROM desensitization_rules WHERE project_id=?', [projectId])
    await pool.execute('DELETE FROM project_members WHERE project_id=?', [projectId])
    await pool.execute('DELETE FROM projects WHERE id=?', [projectId])
  }
  await pool.execute('DELETE FROM audit_logs WHERE actor_id IN (?,?)', [managerId, memberId])
  await pool.execute('DELETE FROM users WHERE id IN (?,?)', [managerId, memberId])
}

async function run() {
  await migrate()
  const passwordHash = await bcrypt.hash('smoke-password', 4)
  await pool.execute('INSERT INTO users (id,role,name,email,password_hash) VALUES (?,?,?,?,?)', [managerId, 'manager', manager.name, manager.email, passwordHash])
  await pool.execute('INSERT INTO users (id,role,name,email,password_hash) VALUES (?,?,?,?,?)', [memberId, 'member', member.name, member.email, passwordHash])

  const service = new AppService({
    analyze: async () => ({ summary: 'Smoke analysis', decisions: [], tasks: [], risks: [] }),
  } as any)
  const project = await service.createProject(manager, { name: `${prefix}-project`, code: `SMK-${runId.slice(0, 8)}`, description: 'Smoke project' })
  projectId = project.id
  await service.addProjectMember(manager, projectId, memberId, 'member')

  await service.createDesensitizationRule(manager, projectId, { name: 'Ticket', pattern: 'TICKET-\\d+', replacement: '[TICKET]', enabled: true })
  const phone = '13800138000'
  const meeting = await service.createMeeting(manager, { projectId, title: `${prefix}-meeting`, content: `Call ${phone}; TICKET-19` })
  meetingId = meeting.id
  const [versions] = await pool.query<any[]>('SELECT id,desensitized_content FROM meeting_versions WHERE meeting_id=?', [meetingId])
  assert.match(versions[0].desensitized_content, /\[PHONE\].*\[TICKET\]/)
  const logs = await service.listMeetingDesensitizationLogs(manager, meetingId)
  assert.ok(logs.some((log) => log.rule_kind === 'custom'))
  assert.equal(JSON.stringify(logs).includes(phone), false)

  const task = await service.createTask(manager, { projectId, title: `${prefix}-task`, assigneeId: memberId, priority: 'high', dueDate: '2020-01-01' }) as { id: string }
  const notes = await service.addTaskNote(member, task.id, 'Smoke note')
  assert.equal(notes.content, 'Smoke note')
  const overdue = await service.overdueTasks(manager)
  assert.ok(overdue.some((item) => item.id === task.id))

  const source = await service.analyzeMeeting(manager, meetingId)
  await service.reviewAnalysis(manager, source.id, false, 'Needs another pass')
  const reanalysis = await service.reanalyzeRejectedAnalysis(manager, source.id)
  const [reanalysisRows] = await pool.query<any[]>('SELECT reanalysis_of_id,status FROM ai_analyses WHERE id=?', [reanalysis.id])
  assert.equal(reanalysisRows[0].reanalysis_of_id, source.id)
  assert.equal(reanalysisRows[0].status, 'pending')

  await service.softDeleteProject(manager, projectId)
  assert.equal((await service.projects(manager)).some((item) => item.id === projectId), false)
  await service.restoreProject(manager, projectId)
  assert.ok((await service.projects(manager)).some((item) => item.id === projectId))
  console.log('Project core closure smoke test passed')
}

try {
  await run()
} finally {
  await cleanup()
  await pool.end()
}
