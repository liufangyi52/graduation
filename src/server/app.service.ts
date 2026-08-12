import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { pool } from './database'
import { assertFeedbackInput, assertTaskUpdateInput, canRegisterRole, canUpdateTask } from './authorization'
import { DeepSeekService, normalizeAnalysis, type MeetingAnalysis } from './deepseek.service'

type Role = 'manager' | 'member' | 'admin' | 'auditor'
type SessionUser = { id: string; role: Role; name: string; email: string; authVersion?: number }

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
      ? `SELECT p.id,p.name,p.code,p.status,p.start_date,p.end_date,u.name owner_name,COUNT(pm.user_id) members FROM projects p JOIN users u ON u.id=p.owner_id LEFT JOIN project_members pm ON pm.project_id=p.id GROUP BY p.id ORDER BY p.created_at DESC`
      : user.role === 'manager'
        ? `SELECT p.id,p.name,p.code,p.status,p.start_date,p.end_date,u.name owner_name,COUNT(pm.user_id) members FROM projects p JOIN users u ON u.id=p.owner_id LEFT JOIN project_members pm ON pm.project_id=p.id WHERE p.owner_id=? GROUP BY p.id ORDER BY p.created_at DESC`
        : `SELECT p.id,p.name,p.code,p.status,p.start_date,p.end_date,u.name owner_name,COUNT(pm2.user_id) members FROM project_members pm JOIN projects p ON p.id=pm.project_id JOIN users u ON u.id=p.owner_id LEFT JOIN project_members pm2 ON pm2.project_id=p.id WHERE pm.user_id=? GROUP BY p.id ORDER BY p.created_at DESC`
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
      SELECT t.id,'task' type,t.title,p.id project_id,p.name project_name,DATE(t.due_date) date,u.name assignee_name,t.priority,t.status
      FROM tasks t
      JOIN projects p ON p.id=t.project_id
      ${membershipJoin}
      JOIN users u ON u.id=t.assignee_id
      WHERE t.due_date IS NOT NULL AND ${projectFilter}
      UNION ALL
      SELECT m.id,'meeting' type,m.title,p.id project_id,p.name project_name,DATE(m.created_at) date,NULL assignee_name,NULL priority,NULL status
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
    const [rows] = await pool.query<any[]>('SELECT assignee_id, project_id FROM tasks WHERE id=?', [id])
    if (rows[0] && !canUpdateTask(user, rows[0].assignee_id)) throw new ForbiddenException('You cannot update this task')
    if (!rows[0]) throw new BadRequestException('任务不存在')
    if (user.role === 'member' && rows[0].assignee_id !== user.id) throw new ForbiddenException('只能更新本人任务')
    if (user.role === 'manager') await this.assertProjectManager(user, rows[0].project_id)
    const progress = input.progress
    const status = progress === 100 ? 'completed' : input.status
    await pool.execute('UPDATE tasks SET status=COALESCE(?,status), progress=COALESCE(?,progress) WHERE id=?', [status ?? null, progress ?? null, id])
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
    return { id, taskId, authorId: user.id, ...input }
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

  private async audit(actorId: string | null, action: string, entityType: string, entityId: string | null, details: any = {}) {
    await pool.execute('INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?,?)', [randomUUID(), actorId, action, entityType, entityId, JSON.stringify(details)])
  }

  private async assertProjectManager(user: SessionUser, projectId: string) {
    if (user.role !== 'manager') throw new ForbiddenException('Only managers can perform this action')
    const [rows] = await pool.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [projectId])
    if (!rows[0] || rows[0].owner_id !== user.id) throw new ForbiddenException('You do not manage this project')
  }

  async createMeeting(user: SessionUser, input: { projectId: string; title: string; content: string }) {
    await this.assertProjectManager(user, input.projectId)
    if (!input.title?.trim() || !input.content?.trim()) throw new BadRequestException('Meeting title and content are required')
    const id = randomUUID()
    await pool.execute('INSERT INTO meetings (id,project_id,created_by,title,content) VALUES (?,?,?,?,?)', [id, input.projectId, user.id, input.title.trim(), input.content.trim()])
    await this.audit(user.id, 'meeting.created', 'meeting', id, { projectId: input.projectId })
    return { id, ...input, status: 'created' }
  }

  async analyzeMeeting(user: SessionUser, meetingId: string) {
    const [rows] = await pool.query<any[]>('SELECT m.id,m.title,m.content,m.project_id FROM meetings m WHERE m.id=?', [meetingId])
    if (!rows[0]) throw new BadRequestException('Meeting does not exist')
    await this.assertProjectManager(user, rows[0].project_id)
    const analysisId = randomUUID()
    await pool.execute('INSERT INTO ai_analyses (id,meeting_id,requested_by,status,model) VALUES (?,?,?,?,?)', [analysisId, meetingId, user.id, 'pending', process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'])
    try {
      const result = await this.deepseek.analyze(rows[0].title, rows[0].content)
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

  async reviewAnalysis(user: SessionUser, analysisId: string, approved: boolean) {
    const [rows] = await pool.query<any[]>('SELECT a.*,m.project_id FROM ai_analyses a JOIN meetings m ON m.id=a.meeting_id WHERE a.id=?', [analysisId])
    if (!rows[0]) throw new BadRequestException('Analysis does not exist')
    await this.assertProjectManager(user, rows[0].project_id)
    if (rows[0].status !== 'pending') throw new BadRequestException('Analysis has already been reviewed')
    const result = normalizeStoredAnalysis(rows[0].result_json)
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('UPDATE ai_analyses SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?', [approved ? 'approved' : 'rejected', user.id, analysisId])
      if (approved) {
        const [projectManagers] = await connection.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [rows[0].project_id])
        const fallbackAssignee = projectManagers[0]?.owner_id ?? user.id
        for (const task of result.tasks) {
          const [assignees] = task.owner_email ? await connection.query<any[]>('SELECT u.id FROM users u JOIN project_members pm ON pm.user_id=u.id WHERE pm.project_id=? AND u.email=?', [rows[0].project_id, task.owner_email]) : [[]]
          const assigneeId = assignees[0]?.id ?? fallbackAssignee
          await connection.execute('INSERT INTO tasks (id,title,description,project_id,assignee_id,priority,status,progress,due_date) VALUES (?,?,?,?,?,?,?,?,?)', [randomUUID(), task.title, task.description ?? null, rows[0].project_id, assigneeId, task.priority, 'todo', 0, task.due_date ?? null])
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
