import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { pool } from './database'
import { assertFeedbackInput, assertTaskUpdateInput, canRegisterRole, canUpdateTask } from './authorization'
import { DeepSeekService, normalizeAnalysis, type MeetingAnalysis } from './deepseek.service'
import { desensitizeMeetingContent } from './desensitization'

type Role = 'manager' | 'member' | 'admin' | 'auditor'
type SessionUser = { id: string; role: Role; name: string; email: string; authVersion?: number }
type MeetingVersion = { id: string; meetingId: string; versionNumber: number; sourceType: string; originalContent: string; desensitizedContent: string; createdAt?: string }

export function normalizeStoredAnalysis(value: unknown): MeetingAnalysis {
  return normalizeAnalysis(typeof value === 'string' ? JSON.parse(value) : value)
}

@Injectable()
export class AppService {
  constructor(private readonly deepseek: DeepSeekService) {}
  async register(input: { role: Role; name: string; email: string; password: string }) {
    if (!canRegisterRole(input.role)) throw new ForbiddenException('Only member accounts can self-register')
    if (!['manager', 'member', 'admin', 'auditor'].includes(input.role)) throw new BadRequestException('无效角色')
    if (!input.name?.trim() || !/^\S+@\S+\.\S+$/.test(input.email) || input.password.length < 8) throw new BadRequestException('注册字段不符合要求')
    const email = input.email.trim().toLowerCase()
    const [existing] = await pool.query<any[]>('SELECT id FROM users WHERE email = ?', [email])
    if (existing.length) throw new BadRequestException('该邮箱已注册')
    const user: SessionUser = { id: randomUUID(), role: input.role, name: input.name.trim(), email }
    await pool.execute('INSERT INTO users (id, role, name, email, password_hash) VALUES (?, ?, ?, ?, ?)', [user.id, user.role, user.name, user.email, await bcrypt.hash(input.password, 12)])
    return user
  }

  async login(email: string, password: string) {
    const [rows] = await pool.query<any[]>('SELECT id, role, name, email, password_hash, auth_version FROM users WHERE email = ?', [email.trim().toLowerCase()])
    const record = rows[0]
    if (!record || !(await bcrypt.compare(password, record.password_hash))) throw new UnauthorizedException('邮箱或密码不正确')
    const user: SessionUser = { id: record.id, role: record.role, name: record.name, email: record.email, authVersion: Number(record.auth_version ?? 0) }
    return { user, token: jwt.sign(user, process.env.JWT_SECRET as string, { expiresIn: '8h' }) }
  }

  async currentUser(token?: string): Promise<SessionUser> {
    if (!token) throw new UnauthorizedException('缺少登录令牌')
    try { return jwt.verify(token, process.env.JWT_SECRET as string) as SessionUser } catch { throw new UnauthorizedException('登录已失效') }
  }

  async databaseUser(token?: string): Promise<SessionUser> {
    const tokenUser = await this.currentUser(token)
    const [rows] = await pool.query<any[]>('SELECT id, role, name, email, is_active, auth_version FROM users WHERE id = ?', [tokenUser.id])
    const record = rows[0]
    if (!record || !record.is_active || Number(record.auth_version ?? 0) !== Number(tokenUser.authVersion ?? -1)) throw new UnauthorizedException('Login token is no longer valid')
    return { id: record.id, role: record.role, name: record.name, email: record.email, authVersion: Number(record.auth_version ?? 0) }
  }

  async profile(token?: string): Promise<SessionUser> {
    return this.databaseUser(token)
  }

  async projects(user: SessionUser) {
    const sql = user.role === 'admin' || user.role === 'auditor'
      ? `SELECT p.id,p.name,p.code,p.status,p.start_date,p.end_date,u.name owner_name,COALESCE(mc.members,0) members,COALESCE(tc.progress,0) progress FROM projects p JOIN users u ON u.id=p.owner_id LEFT JOIN (SELECT project_id,COUNT(*) members FROM project_members GROUP BY project_id) mc ON mc.project_id=p.id LEFT JOIN (SELECT project_id,ROUND(AVG(progress)) progress FROM tasks GROUP BY project_id) tc ON tc.project_id=p.id ORDER BY p.created_at DESC`
      : user.role === 'manager'
        ? `SELECT p.id,p.name,p.code,p.status,p.start_date,p.end_date,u.name owner_name,COALESCE(mc.members,0) members,COALESCE(tc.progress,0) progress FROM projects p JOIN users u ON u.id=p.owner_id LEFT JOIN (SELECT project_id,COUNT(*) members FROM project_members GROUP BY project_id) mc ON mc.project_id=p.id LEFT JOIN (SELECT project_id,ROUND(AVG(progress)) progress FROM tasks GROUP BY project_id) tc ON tc.project_id=p.id WHERE p.owner_id=? ORDER BY p.created_at DESC`
        : `SELECT p.id,p.name,p.code,p.status,p.start_date,p.end_date,u.name owner_name,COALESCE(mc.members,0) members,COALESCE(tc.progress,0) progress FROM project_members pm JOIN projects p ON p.id=pm.project_id JOIN users u ON u.id=p.owner_id LEFT JOIN (SELECT project_id,COUNT(*) members FROM project_members GROUP BY project_id) mc ON mc.project_id=p.id LEFT JOIN (SELECT project_id,ROUND(AVG(progress)) progress FROM tasks GROUP BY project_id) tc ON tc.project_id=p.id WHERE pm.user_id=? ORDER BY p.created_at DESC`
    const [rows] = await pool.query<any[]>(sql, user.role === 'manager' || user.role === 'member' ? [user.id] : [])
    return rows
  }

  async createProject(user: SessionUser, input: { name: string; code: string; description?: string; endDate?: string }) {
    if (user.role !== 'manager') throw new ForbiddenException('Only managers can perform this action')
    if (!input.name?.trim() || !input.code?.trim()) throw new BadRequestException('项目名称和编码不能为空')
    const id = randomUUID()
    await pool.execute('INSERT INTO projects (id,name,code,description,owner_id,end_date) VALUES (?,?,?,?,?,?)', [id, input.name.trim(), input.code.trim(), input.description ?? null, user.id, input.endDate ?? null])
    await pool.execute('INSERT INTO project_members (project_id,user_id,project_role) VALUES (?,?,?)', [id, user.id, 'manager'])
    await this.audit(user.id, 'project.created', 'project', id, { code: input.code.trim() })
    return { id, ...input, ownerId: user.id, status: 'active' }
  }

  async listProjectMembers(user: SessionUser, projectId: string) {
    if (user.role === 'manager') await this.assertProjectManager(user, projectId)
    else if (user.role === 'member') {
      const [memberships] = await pool.query<any[]>('SELECT project_id FROM project_members WHERE project_id=? AND user_id=?', [projectId, user.id])
      if (!memberships[0]) throw new ForbiddenException('You cannot view this project')
    }
    const [rows] = await pool.query<any[]>('SELECT u.id,u.name,u.email,u.role,u.is_active,pm.project_role FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? ORDER BY pm.project_role DESC,u.name ASC', [projectId])
    return rows
  }

  async projectMemberCandidates(user: SessionUser, projectId: string) {
    await this.assertProjectManager(user, projectId)
    const [rows] = await pool.query<any[]>('SELECT id,name,email,role FROM users WHERE is_active=TRUE AND role IN ("manager","member") ORDER BY name ASC', [])
    return rows
  }

  async addProjectMember(user: SessionUser, projectId: string, userId: string, projectRole: 'manager' | 'member') {
    await this.assertProjectManager(user, projectId)
    const [users] = await pool.query<any[]>('SELECT id,is_active FROM users WHERE id=?', [userId])
    if (!users[0] || !users[0].is_active) throw new BadRequestException('Project member must be an active account')
    await pool.execute('INSERT INTO project_members (project_id,user_id,project_role) VALUES (?,?,?) ON DUPLICATE KEY UPDATE project_role=VALUES(project_role)', [projectId, userId, projectRole])
    await this.audit(user.id, 'project.member_added', 'project_member', userId, { projectId, projectRole })
    return { projectId, userId, projectRole }
  }

  async updateProjectMemberRole(user: SessionUser, projectId: string, userId: string, projectRole: 'manager' | 'member') {
    await this.assertProjectManager(user, projectId)
    const [projectRows] = await pool.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [projectId])
    if (projectRows[0]?.owner_id === userId && projectRole !== 'manager') throw new BadRequestException('Project owner must retain manager role')
    const [result] = await pool.execute<any>('UPDATE project_members SET project_role=? WHERE project_id=? AND user_id=?', [projectRole, projectId, userId])
    if (!result.affectedRows) throw new BadRequestException('Project member does not exist')
    await this.audit(user.id, 'project.member_role_updated', 'project_member', userId, { projectId, projectRole })
    return { projectId, userId, projectRole }
  }

  async removeProjectMember(user: SessionUser, projectId: string, userId: string) {
    await this.assertProjectManager(user, projectId)
    const [projects] = await pool.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [projectId])
    if (projects[0]?.owner_id === userId) throw new BadRequestException('Project owner cannot be removed')
    const [result] = await pool.execute<any>('DELETE FROM project_members WHERE project_id=? AND user_id=?', [projectId, userId])
    if (!result.affectedRows) throw new BadRequestException('Project member does not exist')
    await this.audit(user.id, 'project.member_removed', 'project_member', userId, { projectId })
    return { projectId, userId, removed: true }
  }

  async tasks(user: SessionUser) {
    const filter = user.role === 'member' ? 'WHERE t.assignee_id=?' : user.role === 'manager' ? 'WHERE p.owner_id=?' : ''
    const [rows] = await pool.query<any[]>(`SELECT t.id,t.title,t.description,t.priority,t.status,t.progress,t.due_date,p.id project_id,p.name project_name,u.id assignee_id,u.name assignee_name FROM tasks t JOIN projects p ON p.id=t.project_id JOIN users u ON u.id=t.assignee_id ${filter} ORDER BY t.updated_at DESC`, filter ? [user.id] : [])
    return rows
  }

  async calendarEvents(user: SessionUser) {
    const projectFilter = user.role === 'manager' ? 'p.owner_id=?' : user.role === 'member' ? 'pm.user_id=?' : '1=1'
    const membershipJoin = user.role === 'member' ? 'JOIN project_members pm ON pm.project_id=p.id' : ''
    const values = user.role === 'admin' || user.role === 'auditor' ? [] : [user.id, user.id]
    const [rows] = await pool.query<any[]>(`
      SELECT t.id,'task' type,t.title,p.id project_id,p.name project_name,DATE_FORMAT(t.due_date, '%Y-%m-%d') date,u.name assignee_name,t.priority,t.status
      FROM tasks t
      JOIN projects p ON p.id=t.project_id
      ${membershipJoin}
      JOIN users u ON u.id=t.assignee_id
      WHERE t.due_date IS NOT NULL AND ${projectFilter}
      UNION ALL
      SELECT m.id,'meeting' type,m.title,p.id project_id,p.name project_name,DATE_FORMAT(m.created_at, '%Y-%m-%d') date,NULL assignee_name,NULL priority,NULL status
      FROM meetings m
      JOIN projects p ON p.id=m.project_id
      ${membershipJoin}
      WHERE ${projectFilter}
      ORDER BY date ASC, type ASC, title ASC
    `, values)
    return rows
  }

  async updateTask(user: SessionUser, id: string, input: { status?: string; progress?: number }) {
    try { assertTaskUpdateInput(input) } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid task update') }
    const [rows] = await pool.query<any[]>('SELECT id,title,assignee_id, project_id,due_date,status FROM tasks WHERE id=?', [id])
    if (rows[0] && !canUpdateTask(user, rows[0].assignee_id)) throw new ForbiddenException('You cannot update this task')
    if (!rows[0]) throw new BadRequestException('任务不存在')
    if (user.role === 'member' && rows[0].assignee_id !== user.id) throw new ForbiddenException('只能更新本人任务')
    if (user.role === 'manager') await this.assertProjectManager(user, rows[0].project_id)
    const progress = input.progress
    const status = progress === 100 ? 'completed' : input.status
    await pool.execute('UPDATE tasks SET status=COALESCE(?,status), progress=COALESCE(?,progress) WHERE id=?', [status ?? null, progress ?? null, id])
    await this.ensureTaskDeadlineWarnings({ ...rows[0], status: status ?? rows[0].status })
    await this.audit(user.id, 'task.updated', 'task', id, { projectId: rows[0].project_id, status: status ?? null, progress: progress ?? null })
    return { id, status, progress }
  }

  async feedback(user: SessionUser, taskId: string, input: { content: string; progress: number }) {
    try { assertFeedbackInput(input) } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid feedback') }
    const id = randomUUID()
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const [tasks] = await connection.query<any[]>('SELECT assignee_id, project_id FROM tasks WHERE id=? FOR UPDATE', [taskId])
      const task = tasks[0]
      if (!task) throw new BadRequestException('Task does not exist')
      if (!canUpdateTask(user, task.assignee_id)) throw new ForbiddenException('You cannot update this task')
      if (user.role === 'manager') {
        const [projects] = await connection.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [task.project_id])
        if (!projects[0] || projects[0].owner_id !== user.id) throw new ForbiddenException('You do not manage this project')
      }
      await connection.execute('UPDATE tasks SET status=CASE WHEN ?=100 THEN "completed" ELSE status END, progress=? WHERE id=?', [input.progress, input.progress, taskId])
      await connection.execute('INSERT INTO task_feedbacks (id,task_id,author_id,content,progress) VALUES (?,?,?,?,?)', [id, taskId, user.id, input.content.trim(), input.progress])
      await connection.commit()
    } catch (reason) {
      await connection.rollback()
      throw reason
    } finally {
      connection.release()
    }
    await this.audit(user.id, 'task.feedback_created', 'task_feedback', id, { taskId, progress: input.progress })
    const [tasks] = await pool.query<any[]>('SELECT id,title,assignee_id,project_id,due_date,status FROM tasks WHERE id=?', [taskId])
    if (tasks[0]) await this.ensureTaskDeadlineWarnings(tasks[0])
    return { id, taskId, authorId: user.id, ...input }
  }

  private async ensureTaskDeadlineWarnings(task: { id: string; title: string; assignee_id: string; project_id: string; due_date?: string | Date | null; status: string }) {
    if (!task.due_date || task.status === 'completed' || task.status === 'closed') return
    const dueDate = task.due_date instanceof Date
      ? `${task.due_date.getFullYear()}-${String(task.due_date.getMonth() + 1).padStart(2, '0')}-${String(task.due_date.getDate()).padStart(2, '0')}`
      : String(task.due_date).slice(0, 10)
    const due = new Date(`${dueDate}T23:59:59`)
    const now = new Date()
    const isOverdue = due.getTime() < now.getTime()
    const isNearDue = !isOverdue && due.getTime() <= now.getTime() + 3 * 24 * 60 * 60 * 1000
    if (!isOverdue && !isNearDue) return
    const riskTitle = `${isOverdue ? '任务逾期' : '任务临近截止'}：${task.id}`
    const notificationTitle = `${isOverdue ? '任务逾期' : '任务临近截止'}：${task.title}`
    const [risks] = await pool.query<any[]>('SELECT id FROM risks WHERE project_id=? AND title=? AND status="open" LIMIT 1', [task.project_id, riskTitle])
    if (!risks[0]) await pool.execute('INSERT INTO risks (id,project_id,title,description,level) VALUES (?,?,?,?,?)', [randomUUID(), task.project_id, riskTitle, `任务“${task.title}”的截止日期为 ${dueDate}`, isOverdue ? 'high' : 'medium'])
    const [notifications] = await pool.query<any[]>('SELECT id FROM notifications WHERE user_id=? AND title=? AND link=? AND is_read=FALSE LIMIT 1', [task.assignee_id, notificationTitle, '/my-tasks'])
    if (!notifications[0]) await pool.execute('INSERT INTO notifications (id,user_id,title,body,link) VALUES (?,?,?,?,?)', [randomUUID(), task.assignee_id, notificationTitle, `请处理任务“${task.title}”。`, '/my-tasks'])
  }

  private assertAdmin(user: SessionUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Administrator access required')
  }

  async listUsers(user: SessionUser) {
    this.assertAdmin(user)
    const [rows] = await pool.query<any[]>('SELECT id,role,name,email,is_active,created_at FROM users ORDER BY created_at ASC')
    return rows
  }

  async createManagedUser(user: SessionUser, input: { role: Role; name: string; email: string; password: string }) {
    this.assertAdmin(user)
    if (!['manager', 'member', 'admin', 'auditor'].includes(input.role) || !input.name?.trim() || !/^\S+@\S+\.\S+$/.test(input.email) || input.password.length < 8) throw new BadRequestException('Invalid account fields')
    const email = input.email.trim().toLowerCase()
    const [existing] = await pool.query<any[]>('SELECT id FROM users WHERE email=?', [email])
    if (existing.length) throw new BadRequestException('Email is already registered')
    const id = randomUUID()
    await pool.execute('INSERT INTO users (id,role,name,email,password_hash) VALUES (?,?,?,?,?)', [id, input.role, input.name.trim(), email, await bcrypt.hash(input.password, 12)])
    await this.audit(user.id, 'user.created', 'user', id, { role: input.role })
    return { id, role: input.role, name: input.name.trim(), email, is_active: true }
  }

  async updateManagedUser(user: SessionUser, id: string, input: { role?: Role; isActive?: boolean; name?: string }) {
    this.assertAdmin(user)
    if (input.role && !['manager', 'member', 'admin', 'auditor'].includes(input.role)) throw new BadRequestException('Invalid role')
    if (id === user.id && input.isActive === false) throw new BadRequestException('You cannot disable your own account')
    const fields: string[] = []
    const values: any[] = []
    if (input.role) { fields.push('role=?'); values.push(input.role) }
    if (input.name?.trim()) { fields.push('name=?'); values.push(input.name.trim()) }
    if (input.isActive !== undefined) { fields.push('is_active=?'); values.push(input.isActive ? 1 : 0) }
    if (!fields.length) throw new BadRequestException('No account changes supplied')
    values.push(id)
    await pool.execute(`UPDATE users SET ${fields.join(',')} WHERE id=?`, values)
    await this.audit(user.id, 'user.updated', 'user', id, input)
    return { id, ...input }
  }

  async resetManagedPassword(user: SessionUser, id: string, password: string) {
    this.assertAdmin(user)
    if (!password || password.length < 8) throw new BadRequestException('Password must be at least 8 characters')
    await pool.execute('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=?', [await bcrypt.hash(password, 12), id])
    await this.audit(user.id, 'user.password_reset', 'user', id)
    return { id, reset: true }
  }

  async getSystemSettings(user: SessionUser) {
    this.assertAdmin(user)
    const [rows] = await pool.query<any[]>('SELECT model,mode,desensitize FROM system_settings WHERE id=1')
    const settings = rows[0] ?? { model: 'DeepSeek V3', mode: 'RAG', desensitize: true }
    return { model: settings.model, mode: settings.mode, desensitize: Boolean(settings.desensitize) }
  }

  async updateSystemSettings(user: SessionUser, input: { model: string; mode: string; desensitize: boolean }) {
    this.assertAdmin(user)
    await pool.execute('UPDATE system_settings SET model=?,mode=?,desensitize=? WHERE id=1', [input.model, input.mode, input.desensitize])
    await this.audit(user.id, 'system_settings.updated', 'system_settings', 'default', { model: input.model, mode: input.mode, desensitize: input.desensitize })
    return input
  }

  private async audit(actorId: string | null, action: string, entityType: string, entityId: string | null, details: any = {}) {
    await pool.execute('INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?,?)', [randomUUID(), actorId, action, entityType, entityId, JSON.stringify(details)])
  }

  private async assertProjectManager(user: SessionUser, projectId: string) {
    if (user.role !== 'manager') throw new ForbiddenException('Only managers can perform this action')
    const [rows] = await pool.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [projectId])
    if (!rows[0] || rows[0].owner_id !== user.id) throw new ForbiddenException('You do not manage this project')
  }

  private async desensitizedMeetingContent(content: string) {
    const [rows] = await pool.query<any[]>('SELECT desensitize FROM system_settings WHERE id=1')
    return rows[0]?.desensitize === false || Number(rows[0]?.desensitize) === 0 ? content : desensitizeMeetingContent(content).content
  }

  private versionResult(row: any): MeetingVersion {
    return {
      id: row.id,
      meetingId: row.meeting_id,
      versionNumber: Number(row.version_number),
      sourceType: row.source_type,
      originalContent: row.original_content,
      desensitizedContent: row.desensitized_content,
      createdAt: row.created_at,
    }
  }

  async listMeetingVersions(user: SessionUser, meetingId: string) {
    const [meetings] = await pool.query<any[]>('SELECT project_id FROM meetings WHERE id=?', [meetingId])
    if (!meetings[0]) throw new BadRequestException('Meeting does not exist')
    await this.assertProjectManager(user, meetings[0].project_id)
    const [rows] = await pool.query<any[]>('SELECT id,meeting_id,version_number,source_type,created_at FROM meeting_versions WHERE meeting_id=? ORDER BY version_number DESC', [meetingId])
    return rows.map((row) => ({ id: row.id, meetingId: row.meeting_id, versionNumber: Number(row.version_number), sourceType: row.source_type, createdAt: row.created_at }))
  }

  async getMeetingVersion(user: SessionUser, meetingId: string, versionId: string) {
    const [meetings] = await pool.query<any[]>('SELECT project_id FROM meetings WHERE id=?', [meetingId])
    if (!meetings[0]) throw new BadRequestException('Meeting does not exist')
    await this.assertProjectManager(user, meetings[0].project_id)
    const [rows] = await pool.query<any[]>('SELECT * FROM meeting_versions WHERE id=? AND meeting_id=?', [versionId, meetingId])
    if (!rows[0]) throw new BadRequestException('Meeting version does not exist')
    return this.versionResult(rows[0])
  }

  async restoreMeetingVersion(user: SessionUser, meetingId: string, versionId: string) {
    await this.assertProjectManager(user, await this.meetingProjectId(meetingId))
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const [versions] = await connection.query<any[]>('SELECT * FROM meeting_versions WHERE id=? AND meeting_id=? FOR UPDATE', [versionId, meetingId])
      if (!versions[0]) throw new BadRequestException('Meeting version does not exist')
      const [numbers] = await connection.query<any[]>('SELECT COALESCE(MAX(version_number), 0) + 1 next_version FROM meeting_versions WHERE meeting_id=? FOR UPDATE', [meetingId])
      const id = randomUUID()
      const versionNumber = Number(numbers[0]?.next_version ?? 1)
      await connection.execute('INSERT INTO meeting_versions (id,meeting_id,version_number,source_type,original_content,desensitized_content,created_by) VALUES (?,?,?,?,?,?,?)', [id, meetingId, versionNumber, 'restore', versions[0].original_content, versions[0].desensitized_content, user.id])
      await connection.execute('UPDATE meetings SET current_version_id=? WHERE id=?', [id, meetingId])
      await connection.commit()
      await this.audit(user.id, 'meeting.version_restored', 'meeting', meetingId, { versionNumber, sourceVersionId: versionId })
      return { id, meetingId, versionNumber, sourceType: 'restore', originalContent: versions[0].original_content, desensitizedContent: versions[0].desensitized_content }
    } catch (reason) {
      await connection.rollback()
      throw reason
    } finally {
      connection.release()
    }
  }

  private async meetingProjectId(meetingId: string) {
    const [rows] = await pool.query<any[]>('SELECT project_id FROM meetings WHERE id=?', [meetingId])
    if (!rows[0]) throw new BadRequestException('Meeting does not exist')
    return rows[0].project_id as string
  }

  async createMeeting(user: SessionUser, input: { projectId: string; title: string; content: string; sourceType?: 'text' | 'txt' | 'docx' }) {
    await this.assertProjectManager(user, input.projectId)
    if (!input.title?.trim() || !input.content?.trim()) throw new BadRequestException('Meeting title and content are required')
    const id = randomUUID()
    const versionId = randomUUID()
    const originalContent = input.content.trim()
    const maskedContent = await this.desensitizedMeetingContent(originalContent)
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('INSERT INTO meetings (id,project_id,created_by,title,content,current_version_id) VALUES (?,?,?,?,?,?)', [id, input.projectId, user.id, input.title.trim(), originalContent, versionId])
      await connection.execute('INSERT INTO meeting_versions (id,meeting_id,version_number,source_type,original_content,desensitized_content,created_by) VALUES (?,?,?,?,?,?,?)', [versionId, id, 1, input.sourceType ?? 'text', originalContent, maskedContent, user.id])
      await connection.commit()
    } catch (reason) {
      await connection.rollback()
      throw reason
    } finally {
      connection.release()
    }
    await this.audit(user.id, 'meeting.created', 'meeting', id, { projectId: input.projectId, versionNumber: 1 })
    return { id, ...input, versionId, status: 'created' }
  }

  async analyzeMeeting(user: SessionUser, meetingId: string) {
    const [rows] = await pool.query<any[]>('SELECT m.id,m.title,m.content,m.project_id,v.desensitized_content FROM meetings m LEFT JOIN meeting_versions v ON v.id=m.current_version_id WHERE m.id=?', [meetingId])
    if (!rows[0]) throw new BadRequestException('Meeting does not exist')
    await this.assertProjectManager(user, rows[0].project_id)
    const analysisId = randomUUID()
    await pool.execute('INSERT INTO ai_analyses (id,meeting_id,requested_by,status,model) VALUES (?,?,?,?,?)', [analysisId, meetingId, user.id, 'pending', process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'])
    try {
      const result = await this.deepseek.analyze(rows[0].title, rows[0].desensitized_content ?? await this.desensitizedMeetingContent(rows[0].content))
      await pool.execute('UPDATE ai_analyses SET result_json=? WHERE id=?', [JSON.stringify(result), analysisId])
      await this.audit(user.id, 'meeting.analyzed', 'analysis', analysisId, { model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat' })
      return { id: analysisId, meetingId, status: 'pending', result }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'DeepSeek analysis failed'
      await pool.execute('UPDATE ai_analyses SET status="failed",error_message=? WHERE id=?', [message, analysisId])
      await this.audit(user.id, 'meeting.analysis_failed', 'analysis', analysisId, { message })
      throw reason
    }
  }

  async listAnalyses(user: SessionUser) {
    const managerFilter = user.role === 'admin' ? '' : ' WHERE p.owner_id=?'
    const [rows] = await pool.query<any[]>(`SELECT a.id,a.meeting_id,a.status,a.model,a.result_json,a.created_at,m.title,m.project_id FROM ai_analyses a JOIN meetings m ON m.id=a.meeting_id JOIN projects p ON p.id=m.project_id${managerFilter} ORDER BY a.created_at DESC`, managerFilter ? [user.id] : [])
    return rows.map((row) => ({ ...row, result: row.result_json ? normalizeStoredAnalysis(row.result_json) : null }))
  }

  async reviewAnalysis(user: SessionUser, analysisId: string, approved: boolean, reason?: string) {
    const [rows] = await pool.query<any[]>('SELECT a.*,m.project_id FROM ai_analyses a JOIN meetings m ON m.id=a.meeting_id WHERE a.id=?', [analysisId])
    if (!rows[0]) throw new BadRequestException('Analysis does not exist')
    await this.assertProjectManager(user, rows[0].project_id)
    if (rows[0].status !== 'pending') throw new BadRequestException('Analysis has already been reviewed')
    if (reason !== undefined && (!reason.trim() || reason.trim().length > 500)) throw new BadRequestException('Review reason must contain 1 to 500 characters')
    const result = normalizeStoredAnalysis(rows[0].result_json)
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('UPDATE ai_analyses SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,rejection_reason=? WHERE id=?', [approved ? 'approved' : 'rejected', user.id, approved ? null : reason?.trim() ?? null, analysisId])
      if (approved) {
        const [projectManagers] = await connection.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [rows[0].project_id])
        const fallbackAssignee = projectManagers[0]?.owner_id ?? user.id
        for (const task of result.tasks) {
          const [assignees] = task.owner_email ? await connection.query<any[]>('SELECT u.id FROM users u JOIN project_members pm ON pm.user_id=u.id WHERE pm.project_id=? AND u.email=?', [rows[0].project_id, task.owner_email]) : [[]]
          const assigneeId = assignees[0]?.id ?? fallbackAssignee
          const taskId = randomUUID()
          await connection.execute('INSERT INTO tasks (id,title,description,project_id,assignee_id,priority,status,progress,due_date) VALUES (?,?,?,?,?,?,?,?,?)', [taskId, task.title, task.description ?? null, rows[0].project_id, assigneeId, task.priority, 'todo', 0, task.due_date ?? null])
          await connection.execute('INSERT INTO notifications (id,user_id,title,body,link) VALUES (?,?,?,?,?)', [randomUUID(), assigneeId, `已分配任务：${task.title}`, task.description ?? '请查看任务详情并更新进度。', '/my-tasks'])
        }
        for (const risk of result.risks) await connection.execute('INSERT INTO risks (id,project_id,analysis_id,title,description,level) VALUES (?,?,?,?,?,?)', [randomUUID(), rows[0].project_id, analysisId, risk.title, risk.description ?? null, risk.level])
      }
      await connection.commit()
    } catch (reason) { await connection.rollback(); throw reason } finally { connection.release() }
    await this.audit(user.id, approved ? 'analysis.approved' : 'analysis.rejected', 'analysis', analysisId)
    return { id: analysisId, status: approved ? 'approved' : 'rejected' }
  }

  async risks(user: SessionUser) {
    const [rows] = user.role === 'member'
      ? await pool.query<any[]>('SELECT r.* FROM risks r JOIN project_members pm ON pm.project_id=r.project_id WHERE pm.user_id=? ORDER BY r.created_at DESC', [user.id])
      : user.role === 'manager'
        ? await pool.query<any[]>('SELECT r.* FROM risks r JOIN projects p ON p.id=r.project_id WHERE p.owner_id=? ORDER BY r.created_at DESC', [user.id])
        : await pool.query<any[]>('SELECT r.* FROM risks r ORDER BY r.created_at DESC')
    return rows
  }

  async resolveRisk(user: SessionUser, id: string) {
    if (user.role === 'auditor' || user.role === 'member') throw new ForbiddenException('Read-only role')
    const [rows] = await pool.query<any[]>('SELECT project_id FROM risks WHERE id=?', [id])
    if (!rows[0]) throw new BadRequestException('Risk does not exist')
    await this.assertProjectManager(user, rows[0].project_id)
    await pool.execute('UPDATE risks SET status="resolved",resolved_by=?,resolved_at=CURRENT_TIMESTAMP WHERE id=? AND status="open"', [user.id, id])
    await this.audit(user.id, 'risk.resolved', 'risk', id)
    return { id, status: 'resolved' }
  }

  async auditLogs(user: SessionUser) {
    if (user.role !== 'admin' && user.role !== 'auditor') throw new ForbiddenException('Audit logs are restricted')
    const [rows] = await pool.query<any[]>('SELECT l.id,l.action,l.entity_type,l.entity_id,l.details,l.created_at,u.name actor_name FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.created_at DESC LIMIT 500')
    return rows
  }

  async notifications(user: SessionUser) {
    const [rows] = await pool.query<any[]>('SELECT id,title,body,link,is_read,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC', [user.id])
    return rows
  }

  async markNotificationRead(user: SessionUser, id: string) {
    const [result] = await pool.execute<any>('UPDATE notifications SET is_read=TRUE WHERE id=? AND user_id=?', [id, user.id])
    if (!result.affectedRows) throw new BadRequestException('Notification does not exist')
    return { id, is_read: true }
  }

  async archiveProject(user: SessionUser, projectId: string) {
    await this.assertProjectManager(user, projectId)
    const [result] = await pool.execute<any>('UPDATE projects SET status="archived" WHERE id=? AND status<>"archived"', [projectId])
    if (!result.affectedRows) throw new BadRequestException('Project does not exist or is already archived')
    await this.audit(user.id, 'project.archived', 'project', projectId)
    return { id: projectId, status: 'archived' }
  }
}
