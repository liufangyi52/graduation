import 'dotenv/config'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'
import { migrate } from '../src/server/migrate'

const runId = randomUUID()
const prefix = `smoke-${runId}`
const managerId = randomUUID()
const memberId = randomUUID()
let projectId = ''
let meetingId = ''

const manager = { id: managerId, role: 'manager' as const, name: `${prefix}-manager`, email: `${prefix}-manager@example.com` }

async function cleanup() {
  if (projectId) {
    await pool.execute('DELETE FROM task_feedbacks WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)', [projectId])
    await pool.execute('DELETE FROM notifications WHERE user_id IN (?,?)', [managerId, memberId])
    await pool.execute('DELETE FROM tasks WHERE project_id=?', [projectId])
    await pool.execute('DELETE FROM risks WHERE project_id=?', [projectId])
    await pool.execute('DELETE FROM ai_analyses WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id=?)', [projectId])
    await pool.execute('DELETE FROM meeting_versions WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id=?)', [projectId])
    await pool.execute('DELETE FROM meetings WHERE project_id=?', [projectId])
    await pool.execute('DELETE FROM project_members WHERE project_id=?', [projectId])
    await pool.execute('DELETE FROM projects WHERE id=?', [projectId])
  }
  await pool.execute('DELETE FROM audit_logs WHERE actor_id IN (?,?)', [managerId, memberId])
  await pool.execute('DELETE FROM users WHERE id IN (?,?)', [managerId, memberId])
}

async function run() {
  await migrate()
  await pool.execute('INSERT INTO users (id,role,name,email,password_hash) VALUES (?,?,?,?,?)', [managerId, 'manager', manager.name, manager.email, await bcrypt.hash('smoke-password', 4)])
  await pool.execute('INSERT INTO users (id,role,name,email,password_hash) VALUES (?,?,?,?,?)', [memberId, 'member', `${prefix}-member`, `${prefix}-member@example.com`, await bcrypt.hash('smoke-password', 4)])

  const service = new AppService({ analyze: async () => ({ summary: 'unused', decisions: [], tasks: [], risks: [] }) } as any)
  const project = await service.createProject(manager, { name: `${prefix}-project`, code: `SMK-${runId.slice(0, 8)}` })
  projectId = project.id
  await service.addProjectMember(manager, projectId, memberId, 'member')

  const rawMeetingContent = '联系 smoke@example.com，电话 13800138000，证件 11010519491231002X。'
  const meeting = await service.createMeeting(manager, { projectId, title: `${prefix}-meeting`, content: rawMeetingContent })
  meetingId = meeting.id
  const versions = await service.listMeetingVersions(manager, meetingId)
  await service.restoreMeetingVersion(manager, meetingId, versions[0].id)
  const [versionRows] = await pool.query<any[]>('SELECT version_number,desensitized_content FROM meeting_versions WHERE meeting_id=? ORDER BY version_number', [meetingId])
  assert.equal(versionRows.length, 2)
  assert.match(versionRows[0].desensitized_content, /\[EMAIL\].*\[PHONE\].*\[IDENTITY\]/)

  const taskId = randomUUID()
  await pool.execute('INSERT INTO tasks (id,title,project_id,assignee_id,priority,status,progress,due_date) VALUES (?,?,?,?,?,?,?,?)', [taskId, `${prefix}-task`, projectId, memberId, 'high', 'in_progress', 0, '2020-01-01'])
  await service.updateTask(manager, taskId, { progress: 50 })
  const projects = await service.projects(manager)
  assert.equal(Number(projects[0].progress), 50)
  const [warnings] = await pool.query<any[]>('SELECT title FROM risks WHERE project_id=? AND status="open"', [projectId])
  assert.equal(warnings.length, 1)
  const [auditRows] = await pool.query<any[]>('SELECT details FROM audit_logs WHERE actor_id=?', [managerId])
  assert.equal(JSON.stringify(auditRows).includes(rawMeetingContent), false)

  console.log('Core workflow smoke test passed')
}

try {
  await run()
} finally {
  await cleanup()
  await pool.end()
}
