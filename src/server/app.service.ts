import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, Inject, Optional } from '@nestjs/common'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { pool } from './database'
import { assertFeedbackInput, assertManagedTaskInput, assertTaskStatusTransition, assertTaskUpdateInput, canRegisterRole, canUpdateTask } from './authorization'
import { DeepSeekService, normalizeAnalysis, type MeetingAnalysis } from './deepseek.service'
import { applyDesensitization, type DesensitizationEntry } from './desensitization'
import { buildProjectAnalytics } from '../utils/projectAnalytics'
import { RedisCacheService } from './redis-cache.service'
import { AnalysisExecutionError, AnalysisRunner, type AnalysisExecutionMetadata, type AnalysisMode } from './analysis-runner'
import { RagIndexService } from './rag-index.service'
import { ProjectProgressEventsService } from './project-progress-events.service'
import type { ProjectProgressEvent } from './project-progress.types'
import { normalizeSystemAnalysisMode, normalizeSystemModel } from './ai-settings'

type Role = 'manager' | 'member' | 'admin' | 'auditor'
type SessionUser = { id: string; role: Role; name: string; email: string; authVersion?: number }
type MeetingVersion = { id: string; meetingId: string; versionNumber: number; sourceType: string; originalContent: string; desensitizedContent: string; createdAt?: string }
type ReviewDraft = MeetingAnalysis
type ExportKind = 'meetings' | 'tasks' | 'summary'

export function normalizeStoredAnalysis(value: unknown): MeetingAnalysis {
  return normalizeAnalysis(typeof value === 'string' ? JSON.parse(value) : value)
}

@Injectable()
export class AppService {
  constructor(
    @Inject(DeepSeekService) deepseek: DeepSeekService,
    @Inject(RedisCacheService) private readonly cache: RedisCacheService = new RedisCacheService(),
    @Inject(AnalysisRunner) private readonly analysisRunner: AnalysisRunner = new AnalysisRunner(deepseek),
    @Optional() @Inject(RagIndexService) private readonly ragIndex?: RagIndexService,
    @Optional() @Inject(ProjectProgressEventsService) private readonly progressEvents?: ProjectProgressEventsService,
  ) {}
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
    this.assertNotAuditorBusinessRead(user)
    return this.cache.getOrLoad(await this.cache.key('projects', user), async () => {
      const sql = user.role === 'admin' || user.role === 'auditor'
      ? `SELECT p.id,p.name,p.code,p.description,p.status,p.start_date,p.end_date,u.name owner_name,COALESCE(mc.members,0) members,COALESCE(tc.progress,0) progress FROM projects p JOIN users u ON u.id=p.owner_id LEFT JOIN (SELECT project_id,COUNT(*) members FROM project_members GROUP BY project_id) mc ON mc.project_id=p.id LEFT JOIN (SELECT project_id,ROUND(AVG(progress)) progress FROM tasks GROUP BY project_id) tc ON tc.project_id=p.id WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC`
      : user.role === 'manager'
        ? `SELECT p.id,p.name,p.code,p.description,p.status,p.start_date,p.end_date,u.name owner_name,COALESCE(mc.members,0) members,COALESCE(tc.progress,0) progress FROM projects p JOIN users u ON u.id=p.owner_id LEFT JOIN (SELECT project_id,COUNT(*) members FROM project_members GROUP BY project_id) mc ON mc.project_id=p.id LEFT JOIN (SELECT project_id,ROUND(AVG(progress)) progress FROM tasks GROUP BY project_id) tc ON tc.project_id=p.id WHERE p.owner_id=? AND p.deleted_at IS NULL ORDER BY p.created_at DESC`
        : `SELECT p.id,p.name,p.code,p.description,p.status,p.start_date,p.end_date,u.name owner_name,COALESCE(mc.members,0) members,COALESCE(tc.progress,0) progress FROM project_members pm JOIN projects p ON p.id=pm.project_id JOIN users u ON u.id=p.owner_id LEFT JOIN (SELECT project_id,assignee_id,ROUND(AVG(progress)) progress FROM tasks GROUP BY project_id,assignee_id) tc ON tc.project_id=p.id AND tc.assignee_id=pm.user_id LEFT JOIN (SELECT project_id,COUNT(*) members FROM project_members GROUP BY project_id) mc ON mc.project_id=p.id WHERE pm.user_id=? AND p.deleted_at IS NULL ORDER BY p.created_at DESC`
      const [rows] = await pool.query<any[]>(sql, user.role === 'manager' || user.role === 'member' ? [user.id] : [])
      return rows
    })
  }

  async createProject(user: SessionUser, input: { name: string; code: string; description?: string; endDate?: string }) {
    if (user.role !== 'manager') throw new ForbiddenException('Only managers can perform this action')
    if (!input.name?.trim() || !input.code?.trim()) throw new BadRequestException('项目名称和编码不能为空')
    const id = randomUUID()
    await pool.execute('INSERT INTO projects (id,name,code,description,owner_id,end_date) VALUES (?,?,?,?,?,?)', [id, input.name.trim(), input.code.trim(), input.description ?? null, user.id, input.endDate ?? null])
    await pool.execute('INSERT INTO project_members (project_id,user_id,project_role) VALUES (?,?,?)', [id, user.id, 'manager'])
    await this.audit(user.id, 'project.created', 'project', id, { code: input.code.trim() })
    await this.invalidateBusinessReads()
    return { id, ...input, ownerId: user.id, status: 'active' }
  }

  async updateProject(user: SessionUser, projectId: string, input: { name?: string; code?: string; description?: string; endDate?: string | null; status?: 'active' | 'paused' | 'archived' }) {
    await this.assertProjectManager(user, projectId)
    const fields: string[] = []
    const values: Array<string | null> = []
    const result: { id: string; name?: string; code?: string; description?: string; endDate?: string | null; status?: string } = { id: projectId }
    if (input.name !== undefined) { if (!input.name.trim()) throw new BadRequestException('Project name is required'); fields.push('name=?'); values.push(input.name.trim()); result.name = input.name.trim() }
    if (input.code !== undefined) { if (!input.code.trim()) throw new BadRequestException('Project code is required'); fields.push('code=?'); values.push(input.code.trim()); result.code = input.code.trim() }
    if (input.description !== undefined) { fields.push('description=?'); values.push(input.description?.trim() || null); result.description = input.description?.trim() || undefined }
    if (input.endDate !== undefined) { fields.push('end_date=?'); values.push(input.endDate || null); result.endDate = input.endDate || null }
    if (input.status !== undefined) { fields.push('status=?'); values.push(input.status); result.status = input.status }
    if (!fields.length) throw new BadRequestException('No project changes supplied')
    await pool.execute(`UPDATE projects SET ${fields.join(',')} WHERE id=? AND deleted_at IS NULL`, [...values, projectId])
    await this.audit(user.id, 'project.updated', 'project', projectId, { fields: Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined) })
    await this.invalidateBusinessReads()
    return result
  }

  async softDeleteProject(user: SessionUser, projectId: string) {
    await this.assertProjectManager(user, projectId)
    const [result] = await pool.execute<any>('UPDATE projects SET deleted_at=CURRENT_TIMESTAMP,deleted_by=? WHERE id=? AND deleted_at IS NULL', [user.id, projectId])
    if (!result.affectedRows) throw new BadRequestException('Project is already deleted')
    await this.audit(user.id, 'project.deleted', 'project', projectId)
    await this.invalidateBusinessReads()
    return { id: projectId, deleted: true }
  }

  async restoreProject(user: SessionUser, projectId: string) {
    if (user.role !== 'manager') throw new ForbiddenException('Only managers can perform this action')
    const [result] = await pool.execute<any>('UPDATE projects SET deleted_at=NULL,deleted_by=NULL WHERE id=? AND owner_id=? AND deleted_at IS NOT NULL', [projectId, user.id])
    if (!result.affectedRows) throw new BadRequestException('Deleted project does not exist')
    await this.audit(user.id, 'project.restored', 'project', projectId)
    await this.invalidateBusinessReads()
    return { id: projectId, restored: true }
  }

  async deletedProjects(user: SessionUser) {
    if (user.role !== 'manager') throw new ForbiddenException('Only managers can perform this action')
    const [rows] = await pool.query<any[]>('SELECT id,name,code,status,end_date,deleted_at FROM projects WHERE owner_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC', [user.id])
    return rows
  }

  async projectDetail(user: SessionUser, projectId: string) {
    this.assertNotAuditorBusinessRead(user)
    return this.cache.getOrLoad(await this.cache.key('project-detail', user, projectId), async () => {
      const access = user.role === 'manager'
      ? 'p.owner_id=?'
      : user.role === 'member'
        ? 'EXISTS (SELECT 1 FROM project_members pm_access WHERE pm_access.project_id=p.id AND pm_access.user_id=?)'
        : '1=1'
    const [projectRows] = await pool.query<any[]>(`SELECT p.id,p.name,p.code,p.description,p.status,p.start_date,p.end_date,p.owner_id,u.name owner_name,
      COALESCE((SELECT ROUND(AVG(t.progress)) FROM tasks t WHERE t.project_id=p.id),0) progress,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='completed') completed_task_count,
      (SELECT COUNT(*) FROM ai_analyses a JOIN meetings m ON m.id=a.meeting_id WHERE m.project_id=p.id AND a.status='pending') pending_review_count,
      (SELECT COUNT(*) FROM risks r WHERE r.project_id=p.id AND r.status='open') open_risk_count
      FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.id=? AND p.deleted_at IS NULL AND ${access}`, user.role === 'admin' || user.role === 'auditor' ? [projectId] : [projectId, user.id])
    if (!projectRows[0]) throw new BadRequestException('Project does not exist')
    const project = projectRows[0]
    const personalScope = user.role === 'member'
    const [tasks] = await pool.query<any[]>(`SELECT t.id,t.title,t.description,t.project_id,t.priority,t.status,t.progress,t.created_at,t.completed_at,t.due_date,t.assignee_id,u.name assignee_name
      FROM tasks t JOIN users u ON u.id=t.assignee_id WHERE t.project_id=?${personalScope ? ' AND t.assignee_id=?' : ''} ORDER BY t.updated_at DESC`, personalScope ? [projectId, user.id] : [projectId])
    const [meetings] = await pool.query<any[]>(`SELECT m.id,m.title,m.created_at,
      (SELECT COUNT(*) FROM meeting_versions mv WHERE mv.meeting_id=m.id) version_count,
      (SELECT a.status FROM ai_analyses a WHERE a.meeting_id=m.id ORDER BY a.created_at DESC LIMIT 1) latest_analysis_status
      FROM meetings m WHERE m.project_id=? ORDER BY m.created_at DESC`, [projectId])
    const [risks] = personalScope
      ? await pool.query<any[]>('SELECT r.id,r.title,r.description,r.level,r.status,r.created_at,r.resolved_at FROM risks r JOIN tasks rt ON rt.id=r.task_id WHERE r.project_id=? AND rt.assignee_id=? ORDER BY r.created_at DESC', [projectId, user.id])
      : await pool.query<any[]>('SELECT id,title,description,level,status,created_at,resolved_at FROM risks WHERE project_id=? ORDER BY created_at DESC', [projectId])
    const [members] = await pool.query<any[]>('SELECT u.id,u.name,u.email,u.role,u.is_active,pm.project_role FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? ORDER BY pm.project_role DESC,u.name ASC', [projectId])
    const [memberProgress] = await pool.query<any[]>(`SELECT pm.user_id member_id,u.name member_name,
      COUNT(t.id) task_count,
      COALESCE(SUM(t.status IN ('completed','closed')),0) completed_task_count,
      COALESCE(ROUND(AVG(t.progress)),0) average_progress,
      MAX(f.created_at) latest_feedback_at
      FROM project_members pm
      JOIN users u ON u.id=pm.user_id
      LEFT JOIN tasks t ON t.project_id=pm.project_id AND t.assignee_id=pm.user_id
      LEFT JOIN task_feedbacks f ON f.author_id=pm.user_id
        AND EXISTS (SELECT 1 FROM tasks ft WHERE ft.id=f.task_id AND ft.project_id=pm.project_id)
      WHERE pm.project_id=?${personalScope ? ' AND pm.user_id=?' : ''}
      GROUP BY pm.user_id,u.name
      ORDER BY average_progress DESC,u.name ASC`, personalScope ? [projectId, user.id] : [projectId])
    const [activity] = await pool.query<any[]>(`SELECT e.id,e.task_id,t.title task_title,e.actor_id,u.name actor_name,e.event_type,
      e.before_progress,e.after_progress,e.before_status,e.after_status,e.feedback_content,e.created_at
      FROM project_progress_events e
      JOIN tasks t ON t.id=e.task_id
      JOIN users u ON u.id=e.actor_id
      WHERE e.project_id=?${personalScope ? ' AND t.assignee_id=?' : ''}
      ORDER BY e.created_at DESC
      LIMIT 20`, personalScope ? [projectId, user.id] : [projectId])
    const canEdit = user.role === 'manager' && project.owner_id === user.id
      const scopedProgress = personalScope
        ? (tasks.length ? Math.round(tasks.reduce((sum, task) => sum + Number(task.progress ?? 0), 0) / tasks.length) : 0)
        : Number(project.progress ?? 0)
      return {
      scope: personalScope ? 'personal' : 'project',
      project: { id: project.id, name: project.name, code: project.code, description: project.description, status: project.status, startDate: project.start_date, endDate: project.end_date, ownerId: project.owner_id, ownerName: project.owner_name, progress: scopedProgress },
      tasks: tasks.map((task) => ({ ...task, assigneeName: task.assignee_name, createdAt: task.created_at, completedAt: task.completed_at ?? null, dueDate: task.due_date })),
      meetings: meetings.map((meeting) => ({ ...meeting, createdAt: meeting.created_at, versionCount: Number(meeting.version_count ?? 0), latestAnalysisStatus: meeting.latest_analysis_status ?? null })),
      risks: risks.map((risk) => ({ ...risk, createdAt: risk.created_at, resolvedAt: risk.resolved_at })),
      members,
      health: {
        activeTasks: tasks.filter((task) => !['completed', 'closed'].includes(task.status)).length,
        blockedTasks: tasks.filter((task) => task.status === 'todo').length,
        overdueTasks: tasks.filter((task) => !['completed', 'closed'].includes(task.status) && task.due_date && new Date(task.due_date).getTime() < new Date().setHours(0, 0, 0, 0)).length,
        openRisks: personalScope ? risks.filter((risk) => risk.status === 'open').length : Number(project.open_risk_count ?? risks.filter((risk) => risk.status === 'open').length),
      },
      memberProgress: memberProgress.map((member) => ({ memberId: member.member_id, memberName: member.member_name, taskCount: Number(member.task_count ?? 0), completedTaskCount: Number(member.completed_task_count ?? 0), averageProgress: Number(member.average_progress ?? 0), latestFeedbackAt: member.latest_feedback_at ?? null })),
      activity: activity.map((event) => ({ id: event.id, projectId, taskId: event.task_id, taskTitle: event.task_title, actorId: event.actor_id, actorName: event.actor_name, eventType: event.event_type, beforeProgress: Number(event.before_progress ?? 0), afterProgress: Number(event.after_progress ?? 0), beforeStatus: event.before_status ?? 'todo', afterStatus: event.after_status ?? 'todo', feedbackContent: event.feedback_content ?? undefined, createdAt: event.created_at })),
      counts: {
        tasks: personalScope ? tasks.length : Number(project.task_count ?? tasks.length),
        completedTasks: personalScope ? tasks.filter((task) => ['completed', 'closed'].includes(task.status)).length : Number(project.completed_task_count ?? tasks.filter((task) => task.status === 'completed').length),
        pendingReviews: personalScope ? 0 : Number(project.pending_review_count ?? 0),
        openRisks: personalScope ? risks.filter((risk) => risk.status === 'open').length : Number(project.open_risk_count ?? risks.filter((risk) => risk.status === 'open').length),
        members: members.length,
      },
      permissions: { canEdit, canCreateTask: canEdit, canManageMembers: canEdit, canManageRisks: canEdit },
      }
    })
  }

  async exportProjectData(user: SessionUser, projectId: string, kind: ExportKind) {
    this.assertNotAuditorBusinessRead(user)
    if (user.role === 'member' && kind !== 'tasks') throw new ForbiddenException('Members can only export tasks')
    if (user.role === 'manager') await this.assertProjectManager(user, projectId)
    if (user.role === 'member') await this.assertProjectViewer(user, projectId)

    const [projectRows] = await pool.query<any[]>(`SELECT p.id,p.name,p.code,p.description,p.owner_id,u.name owner_name,p.status,p.start_date,p.end_date
      FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.id=? AND p.deleted_at IS NULL`, [projectId])
    const project = projectRows[0]
    if (!project) throw new BadRequestException('Project does not exist')
    const projectDto = { id: project.id, name: project.name, code: project.code, description: project.description, ownerId: project.owner_id, ownerName: project.owner_name, status: project.status, startDate: project.start_date, endDate: project.end_date }

    const mapTask = (task: any) => ({ projectId: task.project_id, projectName: task.project_name, title: task.title, description: task.description, assigneeId: task.assignee_id, assigneeName: task.assignee_name, priority: task.priority, status: task.status, progress: Number(task.progress ?? 0), createdAt: task.created_at, dueDate: task.due_date })
    const mapMeeting = (meeting: any) => {
      let analysis: any = {}
      if (meeting.result_json) {
        try { analysis = typeof meeting.result_json === 'string' ? JSON.parse(meeting.result_json) : meeting.result_json } catch { analysis = {} }
      }
      return { title: meeting.title, createdAt: meeting.created_at, latestAnalysisStatus: meeting.latest_analysis_status ?? null, summary: meeting.summary ?? analysis.summary ?? null, decisions: meeting.decisions ?? analysis.decisions ?? [], versionCount: Number(meeting.version_count ?? 0) }
    }

    const taskQuery = user.role === 'member'
      ? `SELECT t.project_id,p.name project_name,t.title,t.description,t.assignee_id,u.name assignee_name,t.priority,t.status,t.progress,t.created_at,t.due_date FROM tasks t JOIN projects p ON p.id=t.project_id JOIN users u ON u.id=t.assignee_id WHERE t.project_id=? AND t.assignee_id=? AND p.deleted_at IS NULL ORDER BY t.created_at ASC`
      : `SELECT t.project_id,p.name project_name,t.title,t.description,t.assignee_id,u.name assignee_name,t.priority,t.status,t.progress,t.created_at,t.due_date FROM tasks t JOIN projects p ON p.id=t.project_id JOIN users u ON u.id=t.assignee_id WHERE t.project_id=? AND p.deleted_at IS NULL ORDER BY t.created_at ASC`
    const taskValues = user.role === 'member' ? [projectId, user.id] : [projectId]

    if (kind === 'tasks') {
      const [tasks] = await pool.query<any[]>(taskQuery, taskValues)
      const result = { project: projectDto, tasks: tasks.map(mapTask) }
      await this.audit(user.id, 'export.requested', 'project', projectId, { kind, scope: projectId })
      return result
    }

    if (kind === 'meetings') {
      const [meetings] = await pool.query<any[]>(`SELECT m.title,m.created_at,
      (SELECT a.status FROM ai_analyses a WHERE a.meeting_id=m.id ORDER BY a.created_at DESC LIMIT 1) latest_analysis_status,
      (SELECT a.result_json FROM ai_analyses a WHERE a.meeting_id=m.id ORDER BY a.created_at DESC LIMIT 1) result_json,
      (SELECT COUNT(*) FROM meeting_versions mv WHERE mv.meeting_id=m.id) version_count
      FROM meetings m WHERE m.project_id=? ORDER BY m.created_at ASC`, [projectId])
      const result = { project: projectDto, meetings: meetings.map(mapMeeting) }
      await this.audit(user.id, 'export.requested', 'project', projectId, { kind, scope: projectId })
      return result
    }

    const [tasks] = await pool.query<any[]>(taskQuery, taskValues)
    const [meetings] = await pool.query<any[]>(`SELECT m.title,m.created_at,
      (SELECT a.status FROM ai_analyses a WHERE a.meeting_id=m.id ORDER BY a.created_at DESC LIMIT 1) latest_analysis_status,
      (SELECT a.result_json FROM ai_analyses a WHERE a.meeting_id=m.id ORDER BY a.created_at DESC LIMIT 1) result_json,
      (SELECT COUNT(*) FROM meeting_versions mv WHERE mv.meeting_id=m.id) version_count
      FROM meetings m WHERE m.project_id=? ORDER BY m.created_at ASC`, [projectId])
    const [risks] = await pool.query<any[]>('SELECT id,title,description,level,status,created_at FROM risks WHERE project_id=? ORDER BY created_at ASC', [projectId])
    const taskDtos = tasks.map(mapTask)
    const meetingDtos = meetings.map(mapMeeting)
    const riskDtos = risks.map((risk) => ({ id: risk.id, title: risk.title, description: risk.description, level: risk.level, status: risk.status, createdAt: risk.created_at }))
    const result = { project: projectDto, metrics: buildProjectAnalytics({ tasks: taskDtos.map((task) => ({ id: task.title, title: task.title, status: task.status, createdAt: task.createdAt, dueDate: task.dueDate })), risks: riskDtos }, new Date().toISOString()).metrics, tasks: taskDtos, meetings: meetingDtos, risks: riskDtos }
    await this.audit(user.id, 'export.requested', 'project', projectId, { kind, scope: projectId })
    return result
  }

  async listProjectTags(user: SessionUser, projectId: string) {
    await this.assertProjectViewer(user, projectId)
    const [rows] = await pool.query<any[]>('SELECT t.id,t.project_id,t.name,t.created_at,EXISTS(SELECT 1 FROM project_tag_links l WHERE l.project_id=? AND l.tag_id=t.id) linked FROM project_tags t WHERE t.project_id=? ORDER BY t.created_at ASC', [projectId, projectId])
    return rows
  }

  async createProjectTag(user: SessionUser, projectId: string, input: { name: string }) {
    await this.assertProjectManager(user, projectId)
    if (!input.name?.trim()) throw new BadRequestException('Tag name is required')
    const id = randomUUID()
    const name = input.name.trim()
    await pool.execute('INSERT INTO project_tags (id,project_id,name,created_by) VALUES (?,?,?,?)', [id, projectId, name, user.id])
    await this.audit(user.id, 'project.tag_created', 'project_tag', id, { projectId, name })
    return { id, projectId, name }
  }

  async updateProjectTag(user: SessionUser, projectId: string, tagId: string, input: { name: string }) {
    await this.assertProjectManager(user, projectId)
    if (!input.name?.trim()) throw new BadRequestException('Tag name is required')
    const [result] = await pool.execute<any>('UPDATE project_tags SET name=? WHERE id=? AND project_id=?', [input.name.trim(), tagId, projectId])
    if (!result.affectedRows) throw new BadRequestException('Project tag does not exist')
    await this.audit(user.id, 'project.tag_updated', 'project_tag', tagId, { projectId, name: input.name.trim() })
    return { id: tagId, projectId, name: input.name.trim() }
  }

  async deleteProjectTag(user: SessionUser, projectId: string, tagId: string) {
    await this.assertProjectManager(user, projectId)
    const [result] = await pool.execute<any>('DELETE FROM project_tags WHERE id=? AND project_id=?', [tagId, projectId])
    if (!result.affectedRows) throw new BadRequestException('Project tag does not exist')
    await this.audit(user.id, 'project.tag_deleted', 'project_tag', tagId, { projectId })
    return { id: tagId, deleted: true }
  }

  async linkProjectTag(user: SessionUser, projectId: string, tagId: string) {
    await this.assertProjectManager(user, projectId)
    const [tags] = await pool.query<any[]>('SELECT id FROM project_tags WHERE id=? AND project_id=?', [tagId, projectId])
    if (!tags[0]) throw new BadRequestException('Project tag does not exist')
    await pool.execute('INSERT IGNORE INTO project_tag_links (project_id,tag_id) VALUES (?,?)', [projectId, tagId])
    await this.audit(user.id, 'project.tag_linked', 'project_tag', tagId, { projectId })
    return { projectId, tagId, linked: true }
  }

  async unlinkProjectTag(user: SessionUser, projectId: string, tagId: string) {
    await this.assertProjectManager(user, projectId)
    const [result] = await pool.execute<any>('DELETE FROM project_tag_links WHERE project_id=? AND tag_id=?', [projectId, tagId])
    if (!result.affectedRows) throw new BadRequestException('Project tag link does not exist')
    await this.audit(user.id, 'project.tag_unlinked', 'project_tag', tagId, { projectId })
    return { projectId, tagId, linked: false }
  }

  async listProjectMembers(user: SessionUser, projectId: string) {
    this.assertNotAuditorBusinessRead(user)
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
    const [users] = await pool.query<any[]>('SELECT id,is_active,role FROM users WHERE id=?', [userId])
    if (!users[0] || !users[0].is_active || !['manager', 'member'].includes(users[0].role)) throw new BadRequestException('Project member must be an active manager or member')
    await pool.execute('INSERT INTO project_members (project_id,user_id,project_role) VALUES (?,?,?) ON DUPLICATE KEY UPDATE project_role=VALUES(project_role)', [projectId, userId, projectRole])
    await this.audit(user.id, 'project.member_added', 'project_member', userId, { projectId, projectRole })
    await this.invalidateBusinessReads()
    return { projectId, userId, projectRole }
  }

  async updateProjectMemberRole(user: SessionUser, projectId: string, userId: string, projectRole: 'manager' | 'member') {
    await this.assertProjectManager(user, projectId)
    const [projectRows] = await pool.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [projectId])
    if (projectRows[0]?.owner_id === userId && projectRole !== 'manager') throw new BadRequestException('Project owner must retain manager role')
    const [result] = await pool.execute<any>('UPDATE project_members SET project_role=? WHERE project_id=? AND user_id=?', [projectRole, projectId, userId])
    if (!result.affectedRows) throw new BadRequestException('Project member does not exist')
    await this.audit(user.id, 'project.member_role_updated', 'project_member', userId, { projectId, projectRole })
    await this.invalidateBusinessReads()
    return { projectId, userId, projectRole }
  }

  async removeProjectMember(user: SessionUser, projectId: string, userId: string) {
    await this.assertProjectManager(user, projectId)
    const [projects] = await pool.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [projectId])
    if (projects[0]?.owner_id === userId) throw new BadRequestException('Project owner cannot be removed')
    const [result] = await pool.execute<any>('DELETE FROM project_members WHERE project_id=? AND user_id=?', [projectId, userId])
    if (!result.affectedRows) throw new BadRequestException('Project member does not exist')
    await this.progressEvents?.revokeMember(projectId, userId)
    await this.audit(user.id, 'project.member_removed', 'project_member', userId, { projectId })
    await this.invalidateBusinessReads()
    return { projectId, userId, removed: true }
  }

  async tasks(user: SessionUser) {
    this.assertNotAuditorBusinessRead(user)
    return this.cache.getOrLoad(await this.cache.key('tasks', user), async () => {
      const membershipJoin = user.role === 'member' ? 'JOIN project_members pm ON pm.project_id=t.project_id AND pm.user_id=t.assignee_id' : ''
      const filter = user.role === 'member' ? 'WHERE pm.user_id=? AND p.deleted_at IS NULL' : user.role === 'manager' ? 'WHERE p.owner_id=? AND p.deleted_at IS NULL' : 'WHERE p.deleted_at IS NULL'
      const values = user.role === 'member' || user.role === 'manager' ? [user.id] : []
      const [rows] = await pool.query<any[]>(`SELECT t.id,t.title,t.description,t.priority,t.status,t.progress,t.created_at,t.completed_at,t.due_date,p.id project_id,p.name project_name,u.id assignee_id,u.name assignee_name FROM tasks t JOIN projects p ON p.id=t.project_id ${membershipJoin} JOIN users u ON u.id=t.assignee_id ${filter} ORDER BY t.updated_at DESC`, values)
      return rows
    })
  }

  async calendarEvents(user: SessionUser) {
    this.assertNotAuditorBusinessRead(user)
    const projectFilter = user.role === 'manager' ? 'p.owner_id=?' : user.role === 'member' ? 'pm.user_id=?' : '1=1'
    const membershipJoin = user.role === 'member' ? 'JOIN project_members pm ON pm.project_id=p.id' : ''
    const values = user.role === 'admin' || user.role === 'auditor' ? [] : [user.id, user.id]
    const [rows] = await pool.query<any[]>(`
      SELECT t.id,'task' type,t.title,p.id project_id,p.name project_name,DATE_FORMAT(t.due_date, '%Y-%m-%d') date,u.name assignee_name,t.priority,t.status
      FROM tasks t
      JOIN projects p ON p.id=t.project_id
      ${membershipJoin}
      JOIN users u ON u.id=t.assignee_id
      WHERE t.due_date IS NOT NULL AND p.deleted_at IS NULL AND ${projectFilter}${user.role === 'member' ? ' AND t.assignee_id=pm.user_id' : ''}
      UNION ALL
      SELECT m.id,'meeting' type,m.title,p.id project_id,p.name project_name,DATE_FORMAT(m.created_at, '%Y-%m-%d') date,NULL assignee_name,NULL priority,NULL status
      FROM meetings m
      JOIN projects p ON p.id=m.project_id
      ${membershipJoin}
      WHERE p.deleted_at IS NULL AND ${projectFilter}
      ORDER BY date ASC, type ASC, title ASC
    `, values)
    return rows
  }

  async remindTask(user: SessionUser, taskId: string) {
    const [rows] = await pool.query<any[]>('SELECT id,title,assignee_id,project_id,status FROM tasks WHERE id=?', [taskId])
    const task = rows[0]
    if (!task) throw new BadRequestException('Task does not exist')
    if (task.status === 'completed' || task.status === 'closed') throw new BadRequestException('Completed tasks do not need reminders')
    await this.assertProjectManager(user, task.project_id)
    const id = randomUUID()
    await pool.execute('INSERT INTO notifications (id,user_id,title,body,link) VALUES (?,?,?,?,?)', [id, task.assignee_id, `任务推进提醒：${task.title}`, '项目经理提醒你尽快完成当前任务。', '/my-tasks'])
    await this.audit(user.id, 'task.reminder_sent', 'task', taskId, { projectId: task.project_id, assigneeId: task.assignee_id })
    await this.invalidateBusinessReads()
    return { id, taskId, recipientId: task.assignee_id }
  }

  async updateTask(user: SessionUser, id: string, input: { status?: string; progress?: number }) {
    try { assertTaskUpdateInput(input) } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid task update') }
    const [visibleRows] = await pool.query<any[]>('SELECT id,title,assignee_id,project_id,due_date,status,progress FROM tasks WHERE id=?', [id])
    const connection = await pool.getConnection()
    let task: any
    let event: ProjectProgressEvent | undefined
    let status: string | undefined
    let progress: number | undefined
    try {
      await connection.beginTransaction()
      const query = typeof (connection as any).query === 'function' ? (connection as any).query.bind(connection) : pool.query.bind(pool)
      const [rows] = visibleRows[0] ? [visibleRows] : await query('SELECT id,title,assignee_id,project_id,due_date,status,progress FROM tasks WHERE id=? FOR UPDATE', [id])
      task = rows[0]
      if (task && !canUpdateTask(user, task.assignee_id)) throw new ForbiddenException('You cannot update this task')
      if (!task) throw new BadRequestException('任务不存在')
      if (user.role === 'member') await this.assertCurrentTaskAccess(user, task, query)
      if (user.role === 'manager') await this.assertProjectManager(user, task.project_id)
      try { assertTaskStatusTransition(task.status, (input.status ?? task.status) as any, user.role === 'manager') } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid task transition') }
      progress = input.progress
      status = progress === 100 ? 'completed' : input.status
      const afterProgress = progress ?? Number(task.progress ?? 0)
      const afterStatus = status ?? task.status
      const createdAt = new Date().toISOString()
      const eventId = randomUUID()
      await connection.execute("UPDATE tasks SET status=COALESCE(?,status), progress=COALESCE(?,progress), completed_at=CASE WHEN ?='completed' THEN COALESCE(completed_at,CURRENT_TIMESTAMP) ELSE completed_at END WHERE id=?", [status ?? null, progress ?? null, status ?? null, id])
      await connection.execute('INSERT INTO project_progress_events (id,project_id,task_id,actor_id,event_type,before_progress,after_progress,before_status,after_status) VALUES (?,?,?,?,?,?,?,?,?)', [eventId, task.project_id, id, user.id, 'task_updated', Number(task.progress ?? 0), afterProgress, task.status, afterStatus])
      event = { id: eventId, projectId: task.project_id, taskId: id, taskTitle: task.title, actorId: user.id, actorName: user.name, eventType: 'task_updated', beforeProgress: Number(task.progress ?? 0), afterProgress, beforeStatus: task.status, afterStatus, createdAt }
      await connection.commit()
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    this.progressEvents?.publish(event!)
    await this.ensureTaskDeadlineWarnings({ ...task, status: status ?? task.status })
    await this.audit(user.id, 'task.updated', 'task', id, { projectId: task.project_id, status: status ?? null, progress: progress ?? null })
    await this.invalidateBusinessReads()
    return { id, status, progress }
  }

  async feedback(user: SessionUser, taskId: string, input: { content: string; progress: number }) {
    try { assertFeedbackInput(input) } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid feedback') }
    const id = randomUUID()
    const connection = await pool.getConnection()
    let event: ProjectProgressEvent | undefined
    try {
      await connection.beginTransaction()
      const [tasks] = await connection.query<any[]>('SELECT id,title,assignee_id,project_id,status,progress FROM tasks WHERE id=? FOR UPDATE', [taskId])
      const task = tasks[0]
      if (!task) throw new BadRequestException('Task does not exist')
      if (!canUpdateTask(user, task.assignee_id)) throw new ForbiddenException('You cannot update this task')
      if (user.role === 'member') await this.assertCurrentTaskAccess(user, task, connection.query.bind(connection))
      if (user.role === 'manager') {
        const [projects] = await connection.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [task.project_id])
        if (!projects[0] || projects[0].owner_id !== user.id) throw new ForbiddenException('You do not manage this project')
      }
      await connection.execute('UPDATE tasks SET status=CASE WHEN ?=100 THEN "completed" ELSE status END, progress=?, completed_at=CASE WHEN ?=100 THEN COALESCE(completed_at,CURRENT_TIMESTAMP) ELSE completed_at END WHERE id=?', [input.progress, input.progress, input.progress, taskId])
      await connection.execute('INSERT INTO task_feedbacks (id,task_id,author_id,content,progress) VALUES (?,?,?,?,?)', [id, taskId, user.id, input.content.trim(), input.progress])
      const afterStatus = input.progress === 100 ? 'completed' : task.status
      const eventId = randomUUID()
      await connection.execute('INSERT INTO project_progress_events (id,project_id,task_id,actor_id,event_type,before_progress,after_progress,before_status,after_status,feedback_content) VALUES (?,?,?,?,?,?,?,?,?,?)', [eventId, task.project_id, taskId, user.id, 'feedback_created', Number(task.progress ?? 0), input.progress, task.status, afterStatus, input.content.trim()])
      event = { id: eventId, projectId: task.project_id, taskId, taskTitle: task.title, actorId: user.id, actorName: user.name, eventType: 'feedback_created', beforeProgress: Number(task.progress ?? 0), afterProgress: input.progress, beforeStatus: task.status, afterStatus, feedbackContent: input.content.trim(), createdAt: new Date().toISOString() }
      await connection.commit()
    } catch (reason) {
      await connection.rollback()
      throw reason
    } finally {
      connection.release()
    }
    this.progressEvents?.publish(event!)
    await this.audit(user.id, 'task.feedback_created', 'task_feedback', id, { taskId, progress: input.progress })
    const [tasks] = await pool.query<any[]>('SELECT id,title,assignee_id,project_id,due_date,status FROM tasks WHERE id=?', [taskId])
    if (tasks[0]) await this.ensureTaskDeadlineWarnings(tasks[0])
    await this.invalidateBusinessReads()
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
    const riskTitle = `${isOverdue ? '任务逾期' : '任务临近截止'}：${task.title}`
    const [risks] = await pool.query<any[]>('SELECT id FROM risks WHERE project_id=? AND title=? AND status="open" LIMIT 1', [task.project_id, riskTitle])
    if (!risks[0]) await pool.execute('INSERT INTO risks (id,project_id,task_id,title,description,level) VALUES (?,?,?,?,?,?)', [randomUUID(), task.project_id, task.id, riskTitle, `任务“${task.title}”的截止日期为 ${dueDate}`, isOverdue ? 'high' : 'medium'])
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
    const settings = rows[0] ?? { model: 'deepseek-v4-pro', mode: 'rag', desensitize: true }
    return { model: normalizeSystemModel(settings.model), mode: normalizeSystemAnalysisMode(settings.mode), desensitize: Boolean(settings.desensitize) }
  }

  async updateSystemSettings(user: SessionUser, input: { model: string; mode: string; desensitize: boolean }) {
    this.assertAdmin(user)
    const settings = { model: normalizeSystemModel(input.model), mode: normalizeSystemAnalysisMode(input.mode), desensitize: input.desensitize }
    await pool.execute('UPDATE system_settings SET model=?,mode=?,desensitize=? WHERE id=1', [settings.model, settings.mode, settings.desensitize])
    await this.audit(user.id, 'system_settings.updated', 'system_settings', 'default', settings)
    return settings
  }

  async createRoleDemoNotifications(user: SessionUser) {
    this.assertAdmin(user)
    const demos: Array<{ role: Role; title: string; body: string; link: string }> = [
      { role: 'manager', title: 'AI 分析待审核', body: '请进入 AI 审核队列处理待审核分析。', link: '/reviews' },
      { role: 'member', title: '任务临近截止', body: '请进入我的任务处理临近截止的任务。', link: '/my-tasks' },
      { role: 'admin', title: '账号管理待处理', body: '请进入账号管理查看待处理账号事项。', link: '/users' },
      { role: 'auditor', title: '发现待核查审计记录', body: '请进入审计日志核查最新记录。', link: '/audit-logs' },
    ]
    const [users] = await pool.query<any[]>('SELECT id,role FROM users WHERE is_active=TRUE AND role IN ("manager","member","admin","auditor") ORDER BY created_at ASC')
    const recipients = new Map<Role, string>()
    for (const account of users) {
      if (demos.some((demo) => demo.role === account.role) && !recipients.has(account.role)) recipients.set(account.role, account.id)
    }
    let created = 0
    const missingRoles: Role[] = []
    for (const demo of demos) {
      const recipientId = recipients.get(demo.role)
      if (!recipientId) {
        missingRoles.push(demo.role)
        continue
      }
      const [existing] = await pool.query<any[]>('SELECT id FROM notifications WHERE user_id=? AND title=? AND link=? LIMIT 1', [recipientId, demo.title, demo.link])
      if (existing[0]) continue
      await pool.execute('INSERT INTO notifications (id,user_id,title,body,link) VALUES (?,?,?,?,?)', [randomUUID(), recipientId, demo.title, demo.body, demo.link])
      created++
    }
    await this.audit(user.id, 'notifications.demo_generated', 'notification_demo', null, { created, missingRoles })
    return { created, missingRoles }
  }

  private async audit(actorId: string | null, action: string, entityType: string, entityId: string | null, details: any = {}) {
    await pool.execute('INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?,?)', [randomUUID(), actorId, action, entityType, entityId, JSON.stringify(details)])
  }

  private async auditExecution(actorId: string, action: string, analysisId: string, metadata: AnalysisExecutionMetadata, durationMs: number) {
    await this.audit(actorId, action, 'analysis', analysisId, {
      mode: metadata.mode,
      modelCallCount: metadata.modelCallCount,
      durationMs,
      retrievalStatus: metadata.retrievalStatus,
    })
  }

  private persistedExecutionMetadata(metadata: AnalysisExecutionMetadata) {
    return {
      mode: metadata.mode,
      model: metadata.model,
      modelCallCount: metadata.modelCallCount,
      retrievalEnabled: metadata.retrievalEnabled,
      retrievalStatus: metadata.retrievalStatus,
      ...(Number.isFinite(metadata.retrievalDurationMs) ? { retrievalDurationMs: Math.max(0, Number(metadata.retrievalDurationMs)) } : {}),
      ...(Number.isInteger(metadata.retrievalHitCount) ? { retrievalHitCount: Math.max(0, Number(metadata.retrievalHitCount)) } : {}),
      ...(Array.isArray(metadata.retrievalSources) ? {
        retrievalSources: metadata.retrievalSources.slice(0, 5).map(({ meetingId, versionId, chunkIndex, score }) => ({ meetingId, versionId, chunkIndex, score })),
      } : {}),
      ...(metadata.plan ? { plan: metadata.plan.slice(0, 2000) } : {}),
    }
  }

  private failedExecutionMetadata(mode: AnalysisMode, error: unknown) {
    if (error instanceof AnalysisExecutionError) return this.persistedExecutionMetadata(error.metadata)
    return { mode, model: mode === 'manual' ? null : process.env.DEEPSEEK_MODEL ?? 'deepseek-chat', modelCallCount: 0, retrievalEnabled: false, retrievalStatus: mode === 'rag' ? 'not_configured' as const : 'not_applicable' as const }
  }

  private async afterExecutionPersisted(actorId: string, action: string, analysisId: string, metadata: AnalysisExecutionMetadata, durationMs: number) {
    try { await this.auditExecution(actorId, action, analysisId, metadata, durationMs) } catch {}
    try { await this.invalidateBusinessReads() } catch {}
  }

  private async invalidateBusinessReads() {
    await this.cache.invalidateBusinessReads()
  }

  private assertNotAuditorBusinessRead(user: SessionUser) {
    if (user.role === 'auditor') throw new ForbiddenException('Audit role cannot access project business data')
  }

  private async assertProjectManager(user: SessionUser, projectId: string) {
    if (user.role !== 'manager') throw new ForbiddenException('Only managers can perform this action')
    const [rows] = await pool.query<any[]>('SELECT owner_id FROM projects WHERE id=? AND deleted_at IS NULL', [projectId])
    if (!rows[0] || rows[0].owner_id !== user.id) throw new ForbiddenException('You do not manage this project')
  }

  private async assertCurrentTaskAccess(user: SessionUser, task: { project_id: string; assignee_id: string }, query = pool.query.bind(pool)) {
    if (user.role !== 'member' || task.assignee_id !== user.id) throw new ForbiddenException('You cannot access this task')
    const [memberships] = await query('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?', [task.project_id, user.id])
    if (!memberships[0]) throw new ForbiddenException('You cannot access this task')
  }

  private async assertProjectViewer(user: SessionUser, projectId: string) {
    if (user.role === 'manager') return this.assertProjectManager(user, projectId)
    if (user.role === 'member') {
      const [rows] = await pool.query<any[]>('SELECT pm.project_id FROM project_members pm JOIN projects p ON p.id=pm.project_id WHERE pm.project_id=? AND pm.user_id=? AND p.deleted_at IS NULL', [projectId, user.id])
      if (rows[0]) return
    }
    throw new ForbiddenException('You cannot view this project')
  }

  private async desensitizeForProject(projectId: string, content: string): Promise<{ content: string; entries: DesensitizationEntry[] }> {
    const [rows] = await pool.query<any[]>('SELECT desensitize FROM system_settings WHERE id=1')
    if (rows[0]?.desensitize === false || Number(rows[0]?.desensitize) === 0) return { content, entries: [] }
    const [rules] = await pool.query<any[]>('SELECT id,pattern,replacement,enabled FROM desensitization_rules WHERE project_id=? AND enabled=TRUE ORDER BY created_at ASC,id ASC', [projectId])
    return applyDesensitization(content, rules)
  }

  private async writeDesensitizationLogs(connection: { execute: Function }, versionId: string, actorId: string, entries: DesensitizationEntry[]) {
    for (const entry of entries) {
      await connection.execute('INSERT INTO desensitization_logs (id,meeting_version_id,actor_id,rule_kind,rule_id,hit_count) VALUES (?,?,?,?,?,?)', [randomUUID(), versionId, actorId, entry.ruleKind, entry.ruleId, entry.hitCount])
    }
  }

  async listDesensitizationRules(user: SessionUser, projectId: string) {
    await this.assertProjectManager(user, projectId)
    const [rows] = await pool.query<any[]>('SELECT id,project_id,name,pattern,replacement,enabled,created_at,updated_at FROM desensitization_rules WHERE project_id=? ORDER BY created_at ASC,id ASC', [projectId])
    return rows
  }

  async overdueTasks(user: SessionUser) {
    this.assertNotAuditorBusinessRead(user)
    if (user.role === 'admin') return []
    return this.cache.getOrLoad(await this.cache.key('overdue-tasks', user), async () => {
      const membershipJoin = user.role === 'member' ? 'JOIN project_members pm ON pm.project_id=t.project_id AND pm.user_id=t.assignee_id' : ''
      const filter = user.role === 'manager' ? 'p.owner_id=?' : 'pm.user_id=?'
      const [rows] = await pool.query<any[]>(`SELECT t.id,t.title,t.priority,t.status,t.progress,DATE_FORMAT(t.due_date,'%Y-%m-%d') due_date,p.name project_name,u.name assignee_name
      FROM tasks t JOIN projects p ON p.id=t.project_id ${membershipJoin} JOIN users u ON u.id=t.assignee_id
      WHERE p.deleted_at IS NULL AND t.status NOT IN ('completed','closed') AND t.due_date < CURDATE() AND ${filter}
      ORDER BY t.due_date ASC,t.priority DESC LIMIT 20`, [user.id])
      return rows
    })
  }

  async createTask(user: SessionUser, input: { projectId: string; title: string; description?: string; assigneeId: string; priority: 'low' | 'medium' | 'high' | 'urgent'; status?: 'todo' | 'in_progress' | 'completed'; progress?: number; dueDate?: string | null }) {
    try { assertManagedTaskInput(input) } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid task') }
    await this.assertProjectManager(user, input.projectId)
    const [assignees] = await pool.query<any[]>('SELECT u.id FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? AND pm.user_id=? AND u.is_active=TRUE AND u.role IN ("manager","member")', [input.projectId, input.assigneeId])
    if (!assignees[0]) throw new BadRequestException('Task assignee must be an active project member')
    const id = randomUUID()
    const status = input.progress === 100 ? 'completed' : input.status ?? 'todo'
    const progress = input.progress ?? 0
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('INSERT INTO tasks (id,title,description,project_id,assignee_id,priority,status,progress,due_date,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [id, input.title.trim(), input.description?.trim() || null, input.projectId, input.assigneeId, input.priority, status, progress, input.dueDate || null, status === 'completed' ? new Date() : null])
      await connection.commit()
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    await this.audit(user.id, 'task.created', 'task', id, { projectId: input.projectId, title: input.title.trim(), assigneeId: input.assigneeId, priority: input.priority, status, progress })
    await this.invalidateBusinessReads()
    return { id, title: input.title.trim(), projectId: input.projectId, assigneeId: input.assigneeId, priority: input.priority, status, progress, dueDate: input.dueDate ?? null }
  }

  async closeTask(user: SessionUser, taskId: string) {
    if (user.role !== 'manager') throw new ForbiddenException('Only managers can close tasks')
    const [rows] = await pool.query<any[]>('SELECT project_id FROM tasks WHERE id=?', [taskId])
    if (!rows[0]) throw new BadRequestException('Task does not exist')
    await this.assertProjectManager(user, rows[0].project_id)
    await pool.execute('UPDATE tasks SET status="closed" WHERE id=?', [taskId])
    await this.audit(user.id, 'task.closed', 'task', taskId)
    await this.invalidateBusinessReads()
    return { id: taskId, status: 'closed' }
  }

  async updateManagedTask(user: SessionUser, taskId: string, input: { title?: string; description?: string; assigneeId?: string; priority?: 'low' | 'medium' | 'high' | 'urgent'; status?: 'todo' | 'in_progress' | 'completed'; progress?: number; dueDate?: string | null }) {
    const [rows] = await pool.query<any[]>('SELECT id,project_id,assignee_id,status,title,due_date FROM tasks WHERE id=?', [taskId])
    const task = rows[0]
    if (!task) throw new BadRequestException('Task does not exist')
    await this.assertProjectManager(user, task.project_id)
    if (input.assigneeId !== undefined) {
      const [assignees] = await pool.query<any[]>('SELECT u.id FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? AND pm.user_id=? AND u.is_active=TRUE AND u.role IN ("manager","member")', [task.project_id, input.assigneeId])
      if (!assignees[0]) throw new BadRequestException('Task assignee must be an active project member')
    }
    const fields: string[] = []
    const values: Array<string | number | null> = []
    if (input.title !== undefined) { if (!input.title.trim()) throw new BadRequestException('Task title is required'); fields.push('title=?'); values.push(input.title.trim()) }
    if (input.description !== undefined) { fields.push('description=?'); values.push(input.description.trim() || null) }
    if (input.assigneeId !== undefined) { fields.push('assignee_id=?'); values.push(input.assigneeId) }
    if (input.priority !== undefined) { fields.push('priority=?'); values.push(input.priority) }
    if (input.dueDate !== undefined) { fields.push('due_date=?'); values.push(input.dueDate || null) }
    if (input.status !== undefined) { fields.push('status=?'); values.push(input.status) }
    if (input.progress !== undefined) { fields.push('progress=?'); values.push(input.progress); if (input.progress === 100 && input.status === undefined) fields.push('status="completed"') }
    if (input.status === 'completed' || input.progress === 100) fields.push('completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP)')
    if (!fields.length) throw new BadRequestException('No task changes supplied')
    await pool.execute(`UPDATE tasks SET ${fields.join(',')} WHERE id=?`, [...values, taskId])
    await this.audit(user.id, 'task.updated', 'task', taskId, { fields: Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined), status: input.status ?? (input.progress === 100 ? 'completed' : null), progress: input.progress ?? null })
    await this.invalidateBusinessReads()
    return { id: taskId, ...input }
  }

  async reopenTask(user: SessionUser, taskId: string, status: 'todo' | 'in_progress' = 'todo') {
    if (user.role !== 'manager') throw new ForbiddenException('Only managers can close tasks')
    const [rows] = await pool.query<any[]>('SELECT project_id,status FROM tasks WHERE id=?', [taskId])
    if (!rows[0]) throw new BadRequestException('Task does not exist')
    await this.assertProjectManager(user, rows[0].project_id)
    if (rows[0].status !== 'closed') throw new BadRequestException('Only closed tasks can be reopened')
    await pool.execute('UPDATE tasks SET status=? WHERE id=?', [status, taskId])
    await this.audit(user.id, 'task.reopened', 'task', taskId, { status })
    await this.invalidateBusinessReads()
    return { id: taskId, status }
  }

  private async visibleTaskForNote(user: SessionUser, taskId: string) {
    const sql = user.role === 'member'
      ? 'SELECT t.id,t.project_id,t.assignee_id,p.owner_id FROM tasks t JOIN projects p ON p.id=t.project_id JOIN project_members pm ON pm.project_id=t.project_id AND pm.user_id=t.assignee_id WHERE t.id=? AND t.assignee_id=? AND pm.user_id=? AND p.deleted_at IS NULL'
      : 'SELECT t.id,t.project_id,t.assignee_id,p.owner_id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.deleted_at IS NULL'
    const values = user.role === 'member' ? [taskId, user.id, user.id] : [taskId]
    const [rows] = await pool.query<any[]>(sql, values)
    const task = rows[0]
    if (!task) throw new BadRequestException('Task does not exist')
    if (user.role === 'manager' && task.owner_id === user.id) return task
    if (user.role === 'member' && task.assignee_id === user.id) return task
    throw new ForbiddenException('You cannot access this task')
  }

  async listTaskNotes(user: SessionUser, taskId: string) {
    await this.visibleTaskForNote(user, taskId)
    const [rows] = await pool.query<any[]>('SELECT n.id,n.task_id,n.author_id,n.content,n.created_at,u.name author_name FROM task_notes n JOIN users u ON u.id=n.author_id WHERE n.task_id=? ORDER BY n.created_at ASC', [taskId])
    return rows
  }

  async addTaskNote(user: SessionUser, taskId: string, content: string) {
    if (!content?.trim()) throw new BadRequestException('Task note is required')
    await this.visibleTaskForNote(user, taskId)
    const id = randomUUID()
    await pool.execute('INSERT INTO task_notes (id,task_id,author_id,content) VALUES (?,?,?,?)', [id, taskId, user.id, content.trim()])
    await this.audit(user.id, 'task.note_created', 'task_note', id, { taskId })
    return { id, taskId, authorId: user.id, content: content.trim() }
  }

  private assertPattern(pattern: string) {
    try { new RegExp(pattern, 'g') } catch { throw new BadRequestException('Invalid desensitization pattern') }
  }

  async createDesensitizationRule(user: SessionUser, projectId: string, input: { name: string; pattern: string; replacement: string; enabled: boolean }) {
    await this.assertProjectManager(user, projectId)
    this.assertPattern(input.pattern)
    const id = randomUUID()
    const name = input.name.trim()
    await pool.execute('INSERT INTO desensitization_rules (id,project_id,name,pattern,replacement,enabled,created_by) VALUES (?,?,?,?,?,?,?)', [id, projectId, name, input.pattern, input.replacement, input.enabled, user.id])
    await this.audit(user.id, 'desensitization_rule.created', 'desensitization_rule', id, { projectId, name, enabled: input.enabled })
    return { id, projectId, ...input, name }
  }

  async updateDesensitizationRule(user: SessionUser, projectId: string, ruleId: string, input: { name?: string; pattern?: string; replacement?: string; enabled?: boolean }) {
    await this.assertProjectManager(user, projectId)
    if (input.pattern !== undefined) this.assertPattern(input.pattern)
    const fields: string[] = []
    const values: Array<string | boolean> = []
    if (input.name !== undefined) { fields.push('name=?'); values.push(input.name.trim()) }
    if (input.pattern !== undefined) { fields.push('pattern=?'); values.push(input.pattern) }
    if (input.replacement !== undefined) { fields.push('replacement=?'); values.push(input.replacement) }
    if (input.enabled !== undefined) { fields.push('enabled=?'); values.push(input.enabled) }
    if (!fields.length) throw new BadRequestException('No desensitization rule changes supplied')
    const [result] = await pool.execute<any>(`UPDATE desensitization_rules SET ${fields.join(',')} WHERE id=? AND project_id=?`, [...values, ruleId, projectId])
    if (!result.affectedRows) throw new BadRequestException('Desensitization rule does not exist')
    await this.audit(user.id, 'desensitization_rule.updated', 'desensitization_rule', ruleId, { projectId, fields: Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined) })
    return { id: ruleId, projectId, ...input }
  }

  async deleteDesensitizationRule(user: SessionUser, projectId: string, ruleId: string) {
    await this.assertProjectManager(user, projectId)
    const [result] = await pool.execute<any>('DELETE FROM desensitization_rules WHERE id=? AND project_id=?', [ruleId, projectId])
    if (!result.affectedRows) throw new BadRequestException('Desensitization rule does not exist')
    await this.audit(user.id, 'desensitization_rule.deleted', 'desensitization_rule', ruleId, { projectId })
    return { id: ruleId, deleted: true }
  }

  async listMeetingDesensitizationLogs(user: SessionUser, meetingId: string) {
    await this.assertProjectManager(user, await this.meetingProjectId(meetingId))
    const [rows] = await pool.query<any[]>('SELECT l.id,l.meeting_version_id,l.rule_kind,l.rule_id,l.hit_count,l.created_at,u.name actor_name FROM desensitization_logs l JOIN meeting_versions v ON v.id=l.meeting_version_id LEFT JOIN users u ON u.id=l.actor_id WHERE v.meeting_id=? ORDER BY l.created_at ASC', [meetingId])
    return rows
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
    const projectId = await this.meetingProjectId(meetingId)
    await this.assertProjectManager(user, projectId)
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const [versions] = await connection.query<any[]>('SELECT * FROM meeting_versions WHERE id=? AND meeting_id=? FOR UPDATE', [versionId, meetingId])
      if (!versions[0]) throw new BadRequestException('Meeting version does not exist')
      const [numbers] = await connection.query<any[]>('SELECT COALESCE(MAX(version_number), 0) + 1 next_version FROM meeting_versions WHERE meeting_id=? FOR UPDATE', [meetingId])
      const id = randomUUID()
      const versionNumber = Number(numbers[0]?.next_version ?? 1)
      const desensitized = await this.desensitizeForProject(projectId, versions[0].original_content)
      await connection.execute('INSERT INTO meeting_versions (id,meeting_id,version_number,source_type,original_content,desensitized_content,created_by) VALUES (?,?,?,?,?,?,?)', [id, meetingId, versionNumber, 'restore', versions[0].original_content, desensitized.content, user.id])
      await this.writeDesensitizationLogs(connection, id, user.id, desensitized.entries)
      await connection.execute('UPDATE meetings SET current_version_id=? WHERE id=?', [id, meetingId])
      await connection.commit()
      await this.audit(user.id, 'meeting.version_restored', 'meeting', meetingId, { versionNumber, sourceVersionId: versionId })
      await this.invalidateBusinessReads()
      return { id, meetingId, versionNumber, sourceType: 'restore', originalContent: versions[0].original_content, desensitizedContent: desensitized.content }
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
    const desensitized = await this.desensitizeForProject(input.projectId, originalContent)
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('INSERT INTO meetings (id,project_id,created_by,title,content,current_version_id) VALUES (?,?,?,?,?,?)', [id, input.projectId, user.id, input.title.trim(), originalContent, versionId])
      await connection.execute('INSERT INTO meeting_versions (id,meeting_id,version_number,source_type,original_content,desensitized_content,created_by) VALUES (?,?,?,?,?,?,?)', [versionId, id, 1, input.sourceType ?? 'text', originalContent, desensitized.content, user.id])
      await this.writeDesensitizationLogs(connection, versionId, user.id, desensitized.entries)
      await connection.commit()
    } catch (reason) {
      await connection.rollback()
      throw reason
    } finally {
      connection.release()
    }
    await this.audit(user.id, 'meeting.created', 'meeting', id, { projectId: input.projectId, versionNumber: 1 })
    await this.invalidateBusinessReads()
    return { id, ...input, versionId, status: 'created' }
  }

  async analyzeMeeting(user: SessionUser, meetingId: string, mode: AnalysisMode = 'llm') {
    const [rows] = await pool.query<any[]>('SELECT m.id,m.title,m.project_id,m.current_version_id,v.desensitized_content FROM meetings m LEFT JOIN meeting_versions v ON v.id=m.current_version_id WHERE m.id=?', [meetingId])
    if (!rows[0]) throw new BadRequestException('Meeting does not exist')
    await this.assertProjectManager(user, rows[0].project_id)
    if (typeof rows[0].desensitized_content !== 'string') throw new BadRequestException('Current meeting version does not have desensitized content')
    const analysisId = randomUUID()
    const startedAt = new Date()
    await pool.execute('INSERT INTO ai_analyses (id,meeting_id,requested_by,status,model,mode,started_at,model_call_count) VALUES (?,?,?,?,?,?,?,?)', [analysisId, meetingId, user.id, 'pending', process.env.DEEPSEEK_MODEL ?? 'deepseek-chat', mode, startedAt, 0])
    let execution: { result: MeetingAnalysis; metadata: AnalysisExecutionMetadata }
    let durationMs: number
    try {
      execution = await this.analysisRunner.run({ mode, title: rows[0].title, projectId: rows[0].project_id, meetingId, versionId: rows[0].current_version_id, desensitizedContent: rows[0].desensitized_content })
      durationMs = Date.now() - startedAt.getTime()
      await pool.execute('UPDATE ai_analyses SET result_json=?,execution_metadata=?,finished_at=CURRENT_TIMESTAMP,duration_ms=?,model_call_count=? WHERE id=?', [JSON.stringify(execution.result), JSON.stringify(this.persistedExecutionMetadata(execution.metadata)), durationMs, execution.metadata.modelCallCount, analysisId])
    } catch (reason) {
      const durationMs = Date.now() - startedAt.getTime()
      const metadata = this.failedExecutionMetadata(mode, reason)
      await pool.execute('UPDATE ai_analyses SET status="failed",error_message=?,execution_metadata=?,finished_at=CURRENT_TIMESTAMP,duration_ms=?,model_call_count=? WHERE id=?', ['Analysis execution failed', JSON.stringify(metadata), durationMs, metadata.modelCallCount, analysisId])
      try { await this.audit(user.id, 'meeting.analysis_failed', 'analysis', analysisId, { mode: metadata.mode, modelCallCount: metadata.modelCallCount, durationMs, retrievalStatus: metadata.retrievalStatus }) } catch {}
      throw reason
    }
    await this.afterExecutionPersisted(user.id, 'meeting.analyzed', analysisId, execution.metadata, durationMs)
    return { id: analysisId, meetingId, status: 'pending', mode, result: execution.result }
  }

  async listAnalyses(user: SessionUser) {
    this.assertNotAuditorBusinessRead(user)
    const filter = user.role === 'admin'
      ? ' WHERE p.deleted_at IS NULL'
      : user.role === 'member'
        ? " JOIN project_members pm ON pm.project_id=m.project_id WHERE pm.user_id=? AND a.status='approved' AND p.deleted_at IS NULL"
        : ' WHERE p.owner_id=? AND p.deleted_at IS NULL'
    const [rows] = await pool.query<any[]>(`SELECT a.id,a.meeting_id,a.status,a.model,COALESCE(a.mode,'llm') mode,a.execution_metadata,a.duration_ms,a.model_call_count,a.result_json,a.created_at,m.title,m.project_id FROM ai_analyses a JOIN meetings m ON m.id=a.meeting_id JOIN projects p ON p.id=m.project_id${filter} ORDER BY a.created_at DESC`, user.role === 'admin' ? [] : [user.id])
    return rows.map((row) => ({ ...row, mode: row.mode ?? 'llm', result: row.result_json ? normalizeStoredAnalysis(row.result_json) : null }))
  }

  async reviewDetail(user: SessionUser, meetingId: string) {
    this.assertNotAuditorBusinessRead(user)
    const [meetings] = await pool.query<any[]>(`SELECT m.id,m.project_id,m.title,m.content,m.created_at,
      COALESCE(v.version_number,(SELECT MAX(v2.version_number) FROM meeting_versions v2 WHERE v2.meeting_id=m.id)) version_number,
      COALESCE(v.desensitized_content,(SELECT v3.desensitized_content FROM meeting_versions v3 WHERE v3.meeting_id=m.id ORDER BY v3.version_number DESC LIMIT 1)) desensitized_content
      FROM meetings m JOIN projects p ON p.id=m.project_id LEFT JOIN meeting_versions v ON v.id=m.current_version_id
      WHERE m.id=? AND p.deleted_at IS NULL`, [meetingId])
    const meeting = meetings[0]
    if (!meeting) throw new BadRequestException('Meeting does not exist')
    if (user.role !== 'admin') await this.assertProjectViewer(user, meeting.project_id)
    const [analyses] = await pool.query<any[]>(`SELECT id,status,model,COALESCE(mode,'llm') mode,execution_metadata,duration_ms,model_call_count,result_json,created_at,reviewed_at,rejection_reason,reanalysis_of_id FROM ai_analyses
      WHERE meeting_id=?${user.role === 'member' ? " AND status='approved'" : ''} ORDER BY created_at DESC LIMIT 1`, [meetingId])
    const analysis = analyses[0] ? { ...analyses[0], mode: analyses[0].mode ?? 'llm', result: analyses[0].result_json ? normalizeStoredAnalysis(analyses[0].result_json) : null } : null
    let draft: ReviewDraft | null = null
    if (analysis && user.role !== 'member') {
      const [draftRows] = await pool.query<any[]>('SELECT draft_json FROM ai_analysis_drafts WHERE analysis_id=?', [analysis.id])
      if (draftRows[0]) draft = normalizeStoredAnalysis(draftRows[0].draft_json)
    }
    let text = String(meeting.desensitized_content ?? '')
    if (!text && meeting.content) text = (await this.desensitizeForProject(meeting.project_id, String(meeting.content))).content
    const evidence = user.role === 'member' ? [] : analysis?.result?.tasks?.flatMap((task: any) => {
      const index = text.indexOf(task.title)
      return index >= 0 ? [{ start: index, end: index + task.title.length, snippet: text.slice(Math.max(0, index - 80), Math.min(text.length, index + task.title.length + 80)), source: 'generated_snippet' }] : []
    }) ?? []
    const safeAnalysis = analysis && user.role === 'member'
      ? (() => {
        const { tasks: _tasks, risks: _risks, ...safeResult } = analysis.result ?? {}
        return { ...analysis, result: safeResult, rejection_reason: undefined }
      })()
      : analysis
    return { meeting: { id: meeting.id, projectId: meeting.project_id, title: meeting.title, createdAt: meeting.created_at, versionNumber: meeting.version_number, desensitizedContent: text }, analysis: safeAnalysis, draft, evidence }
  }

  async saveReviewDraft(user: SessionUser, analysisId: string, draft: ReviewDraft) {
    const [rows] = await pool.query<any[]>('SELECT a.id,m.project_id,a.status FROM ai_analyses a JOIN meetings m ON m.id=a.meeting_id JOIN projects p ON p.id=m.project_id WHERE a.id=? AND p.deleted_at IS NULL', [analysisId])
    if (!rows[0]) throw new BadRequestException('Analysis does not exist')
    await this.assertProjectManager(user, rows[0].project_id)
    if (rows[0].status !== 'pending') throw new BadRequestException('Analysis has already been reviewed')
    if (!draft || !draft.summary?.trim() || !Array.isArray(draft.decisions) || draft.decisions.some((item) => typeof item !== 'string' || !item.trim() || item.length > 4000) || !Array.isArray(draft.tasks) || draft.tasks.length > 50 || !Array.isArray(draft.risks) || draft.risks.some((risk) => !risk?.title?.trim() || !['low', 'medium', 'high'].includes(risk.level) || (risk.description?.length ?? 0) > 4000)) throw new BadRequestException('Review draft is invalid')
    let normalized: ReviewDraft
    try { normalized = normalizeStoredAnalysis(draft) } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Review draft is invalid') }
    this.assertRiskTaskReferences(normalized)
    for (const task of normalized.tasks) {
      if (task.title.length > 180 || (task.description?.length ?? 0) > 4000 || (task.owner_email && !/^\S+@\S+\.\S+$/.test(task.owner_email)) || (task.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(task.due_date))) throw new BadRequestException('Review draft task fields exceed limits')
    }
    await pool.execute(`INSERT INTO ai_analysis_drafts (analysis_id,draft_json,updated_by) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE draft_json=VALUES(draft_json),updated_by=VALUES(updated_by),updated_at=CURRENT_TIMESTAMP`, [analysisId, JSON.stringify(normalized), user.id])
    await this.audit(user.id, 'analysis.draft_saved', 'analysis', analysisId, { fields: ['summary', 'decisions', 'tasks', 'risks'], taskCount: normalized.tasks.length, decisionCount: normalized.decisions.length, riskCount: normalized.risks.length })
    return normalized
  }

  private assertRiskTaskReferences(draft: ReviewDraft) {
    if (draft.risks.some((risk) => risk.task_index !== undefined && (!Number.isInteger(risk.task_index) || risk.task_index < 0 || risk.task_index >= draft.tasks.length))) {
      throw new BadRequestException('Risk task reference is invalid')
    }
  }

  async reviewAnalysis(user: SessionUser, analysisId: string, approved: boolean, reason?: string) {
    const [rows] = await pool.query<any[]>('SELECT a.*,m.project_id,m.title meeting_title FROM ai_analyses a JOIN meetings m ON m.id=a.meeting_id WHERE a.id=?', [analysisId])
    if (!rows[0]) throw new BadRequestException('Analysis does not exist')
    await this.assertProjectManager(user, rows[0].project_id)
    if (!approved && (!reason?.trim() || reason.trim().length > 500)) throw new BadRequestException('Review reason must contain 1 to 500 characters')
    if (approved && reason !== undefined && (!reason.trim() || reason.trim().length > 500)) throw new BadRequestException('Review reason must contain 1 to 500 characters')
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const [lockedRows] = await connection.query<any[]>(`SELECT a.*,m.project_id,m.title meeting_title,p.owner_id,
          owner.is_active owner_is_active,owner.role owner_role
        FROM ai_analyses a
        JOIN meetings m ON m.id=a.meeting_id
        JOIN projects p ON p.id=m.project_id
        JOIN users owner ON owner.id=p.owner_id
        WHERE a.id=? AND p.deleted_at IS NULL
        FOR UPDATE`, [analysisId])
      const locked = lockedRows[0]
      if (!locked) throw new BadRequestException('Analysis does not exist')
      if (locked.owner_id !== user.id) throw new ForbiddenException('You do not manage this project')
      if (locked.status !== 'pending') throw new BadRequestException('Analysis has already been reviewed')
      const [draftRows] = await connection.query<any[]>('SELECT draft_json FROM ai_analysis_drafts WHERE analysis_id=? FOR UPDATE', [analysisId])
      const result = draftRows[0]?.draft_json ? normalizeStoredAnalysis(draftRows[0].draft_json) : normalizeStoredAnalysis(locked.result_json)
      this.assertRiskTaskReferences(result)
      await connection.execute('UPDATE ai_analyses SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,rejection_reason=? WHERE id=?', [approved ? 'approved' : 'rejected', user.id, approved ? null : reason?.trim() ?? null, analysisId])
      if (approved) {
        const fallbackAssignee = locked.owner_is_active && locked.owner_role === 'manager' ? locked.owner_id : null
        if (!fallbackAssignee) throw new BadRequestException('Project owner is not an active task assignee')
        const createdTaskIds: string[] = []
        for (const task of result.tasks) {
          const [assignees] = task.owner_email ? await connection.query<any[]>('SELECT u.id,u.is_active,u.role FROM users u JOIN project_members pm ON pm.user_id=u.id WHERE pm.project_id=? AND u.email=? AND u.is_active=TRUE AND u.role IN ("manager","member")', [locked.project_id, task.owner_email]) : [[]]
          const assigneeId = assignees[0]?.id ?? fallbackAssignee
          const taskId = randomUUID()
          createdTaskIds.push(taskId)
          await connection.execute('INSERT INTO tasks (id,title,description,project_id,assignee_id,priority,status,progress,due_date) VALUES (?,?,?,?,?,?,?,?,?)', [taskId, task.title, task.description ?? null, locked.project_id, assigneeId, task.priority, 'todo', 0, task.due_date ?? null])
          await connection.execute('INSERT INTO notifications (id,user_id,title,body,link) VALUES (?,?,?,?,?)', [randomUUID(), assigneeId, `任务已分配：${task.title}`, '项目经理已审核会议纪要并分配给你，请更新任务进度。', '/my-tasks'])
        }
        for (const risk of result.risks) {
          const taskId = risk.task_index === undefined ? null : createdTaskIds[risk.task_index]
          await connection.execute('INSERT INTO risks (id,project_id,analysis_id,task_id,title,description,level) VALUES (?,?,?,?,?,?,?)', [randomUUID(), locked.project_id, analysisId, taskId, risk.title, risk.description ?? null, risk.level])
        }
      }
      await connection.commit()
    } catch (reason) { await connection.rollback(); throw reason } finally { connection.release() }
    await this.audit(user.id, approved ? 'analysis.approved' : 'analysis.rejected', 'analysis', analysisId)
    await this.invalidateBusinessReads()
    return { id: analysisId, status: approved ? 'approved' : 'rejected' }
  }

  async reviewAnalyses(user: SessionUser, analysisIds: string[], approved: boolean, reason?: string) {
    const succeeded: Array<{ id: string; status: string }> = []
    const failed: Array<{ id: string; message: string }> = []
    for (const id of analysisIds) {
      try { succeeded.push(await this.reviewAnalysis(user, id, approved, reason)) }
      catch (error) { failed.push({ id, message: error instanceof Error ? error.message : 'Review failed' }) }
    }
    return { succeeded, failed }
  }

  async reanalyzeRejectedAnalysis(user: SessionUser, analysisId: string, mode: AnalysisMode = 'llm') {
    const [rows] = await pool.query<any[]>(`SELECT a.id,a.status,a.meeting_id,m.title,m.project_id,m.current_version_id,v.desensitized_content
      FROM ai_analyses a JOIN meetings m ON m.id=a.meeting_id JOIN projects p ON p.id=m.project_id
      LEFT JOIN meeting_versions v ON v.id=m.current_version_id WHERE a.id=? AND p.deleted_at IS NULL`, [analysisId])
    const source = rows[0]
    if (!source) throw new BadRequestException('Analysis does not exist')
    await this.assertProjectManager(user, source.project_id)
    if (!['failed', 'rejected'].includes(source.status)) throw new BadRequestException('Only failed or rejected analyses can be reanalyzed')
    if (typeof source.desensitized_content !== 'string') throw new BadRequestException('Current meeting version does not have desensitized content')
    const id = randomUUID()
    const startedAt = new Date()
    await pool.execute('INSERT INTO ai_analyses (id,meeting_id,requested_by,status,model,mode,reanalysis_of_id,started_at,model_call_count) VALUES (?,?,?,?,?,?,?,?,?)', [id, source.meeting_id, user.id, 'pending', process.env.DEEPSEEK_MODEL ?? 'deepseek-chat', mode, analysisId, startedAt, 0])
    let execution: { result: MeetingAnalysis; metadata: AnalysisExecutionMetadata }
    let durationMs: number
    try {
      execution = await this.analysisRunner.run({ mode, title: source.title, projectId: source.project_id, meetingId: source.meeting_id, versionId: source.current_version_id, desensitizedContent: source.desensitized_content })
      durationMs = Date.now() - startedAt.getTime()
      await pool.execute('UPDATE ai_analyses SET result_json=?,execution_metadata=?,finished_at=CURRENT_TIMESTAMP,duration_ms=?,model_call_count=? WHERE id=?', [JSON.stringify(execution.result), JSON.stringify(this.persistedExecutionMetadata(execution.metadata)), durationMs, execution.metadata.modelCallCount, id])
    } catch (error) {
      const durationMs = Date.now() - startedAt.getTime()
      const metadata = this.failedExecutionMetadata(mode, error)
      await pool.execute('UPDATE ai_analyses SET status="failed",error_message=?,execution_metadata=?,finished_at=CURRENT_TIMESTAMP,duration_ms=?,model_call_count=? WHERE id=?', ['Analysis execution failed', JSON.stringify(metadata), durationMs, metadata.modelCallCount, id])
      try { await this.audit(user.id, 'analysis.reanalysis_failed', 'analysis', id, { mode: metadata.mode, modelCallCount: metadata.modelCallCount, durationMs, retrievalStatus: metadata.retrievalStatus }) } catch {}
      throw error
    }
    await this.afterExecutionPersisted(user.id, 'analysis.reanalyzed', id, execution.metadata, durationMs)
    return { id, meetingId: source.meeting_id, status: 'pending', mode, reanalysisOfId: analysisId, result: execution.result }
  }

  async syncProjectRagIndex(user: SessionUser, projectId: string): Promise<{ indexedChunks: number }> {
    await this.assertProjectManager(user, projectId)
    if (!this.ragIndex?.isConfigured()) throw new BadRequestException('RAG index is not configured')
    const [rows] = await pool.query<any[]>(`SELECT m.project_id,m.id meeting_id,v.id version_id,v.desensitized_content
      FROM meetings m JOIN projects p ON p.id=m.project_id JOIN meeting_versions v ON v.id=m.current_version_id
      WHERE m.project_id=? AND p.deleted_at IS NULL ORDER BY m.created_at ASC`, [projectId])
    let indexedChunks = 0
    for (const row of rows) {
      const result = await this.ragIndex.syncVersion({
        projectId: row.project_id,
        meetingId: row.meeting_id,
        versionId: row.version_id,
        desensitizedContent: String(row.desensitized_content ?? ''),
      })
      indexedChunks += result.indexedChunks
    }
    await this.audit(user.id, 'project.rag_index_synced', 'project', projectId, { indexedChunks })
    await this.invalidateBusinessReads()
    return { indexedChunks }
  }

  async ragIndexStatus(user: SessionUser, projectId: string): Promise<{ configured: boolean; ready: boolean; eligibleVersionCount: number }> {
    await this.assertProjectManager(user, projectId)
    const configured = Boolean(this.ragIndex?.isConfigured())
    const ready = configured && Boolean(await this.ragIndex?.health())
    const [rows] = await pool.query<any[]>(`SELECT COUNT(*) eligible_version_count FROM meetings m
      JOIN projects p ON p.id=m.project_id JOIN meeting_versions v ON v.id=m.current_version_id
      WHERE m.project_id=? AND p.deleted_at IS NULL AND TRIM(v.desensitized_content) <> ''`, [projectId])
    return { configured, ready, eligibleVersionCount: Number(rows[0]?.eligible_version_count ?? 0) }
  }

  async experimentSummary(user: SessionUser, projectId: string) {
    await this.assertProjectManager(user, projectId)
    const [rows] = await pool.query<any[]>(`SELECT COALESCE(a.mode,'llm') mode,COUNT(*) run_count,
      SUM(a.status='pending') pending_count,SUM(a.status='failed') failed_count,SUM(a.status='approved') approved_count,SUM(a.status='rejected') rejected_count,
      COALESCE(SUM(a.duration_ms),0) total_duration_ms,AVG(a.duration_ms) average_duration_ms,COALESCE(SUM(a.model_call_count),0) total_model_calls
      FROM ai_analyses a JOIN meetings m ON m.id=a.meeting_id WHERE m.project_id=? GROUP BY COALESCE(a.mode,'llm')`, [projectId])
    const empty = () => ({ runCount: 0, pendingCount: 0, failedCount: 0, approvedCount: 0, rejectedCount: 0, totalDurationMs: 0, averageDurationMs: 0, totalModelCalls: 0 })
    const summary: Record<AnalysisMode, ReturnType<typeof empty>> = { manual: empty(), llm: empty(), rag: empty(), agent: empty() }
    for (const row of rows) {
      const mode = (row.mode ?? 'llm') as AnalysisMode
      if (!(mode in summary)) continue
      const runCount = Number(row.run_count ?? 0)
      const totalDurationMs = Number(row.total_duration_ms ?? 0)
      summary[mode] = { runCount, pendingCount: Number(row.pending_count ?? 0), failedCount: Number(row.failed_count ?? 0), approvedCount: Number(row.approved_count ?? 0), rejectedCount: Number(row.rejected_count ?? 0), totalDurationMs, averageDurationMs: Number(row.average_duration_ms ?? 0), totalModelCalls: Number(row.total_model_calls ?? 0) }
    }
    return summary
  }

  async risks(user: SessionUser) {
    this.assertNotAuditorBusinessRead(user)
    return this.cache.getOrLoad(await this.cache.key('risks', user), async () => {
      const [rows] = user.role === 'member'
      ? await pool.query<any[]>('SELECT r.*,t.title task_title,u.name project_owner_name FROM risks r JOIN tasks t ON t.id=r.task_id JOIN project_members pm ON pm.project_id=t.project_id AND pm.user_id=t.assignee_id JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=p.owner_id WHERE t.assignee_id=? AND p.deleted_at IS NULL ORDER BY r.created_at DESC', [user.id])
      : user.role === 'manager'
        ? await pool.query<any[]>('SELECT r.*,t.title task_title,u.name project_owner_name FROM risks r LEFT JOIN tasks t ON t.id=r.task_id JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=p.owner_id WHERE p.owner_id=? AND p.deleted_at IS NULL ORDER BY r.created_at DESC', [user.id])
        : await pool.query<any[]>('SELECT r.*,t.title task_title,u.name project_owner_name FROM risks r LEFT JOIN tasks t ON t.id=r.task_id JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=p.owner_id WHERE p.deleted_at IS NULL ORDER BY r.created_at DESC')
      return rows
    })
  }

  async resolveRisk(user: SessionUser, id: string) {
    if (user.role === 'auditor' || user.role === 'member') throw new ForbiddenException('Read-only role')
    const [rows] = await pool.query<any[]>('SELECT project_id FROM risks WHERE id=?', [id])
    if (!rows[0]) throw new BadRequestException('Risk does not exist')
    await this.assertProjectManager(user, rows[0].project_id)
    await pool.execute('UPDATE risks SET status="resolved",resolved_by=?,resolved_at=CURRENT_TIMESTAMP WHERE id=? AND status="open"', [user.id, id])
    await this.audit(user.id, 'risk.resolved', 'risk', id)
    await this.invalidateBusinessReads()
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

  async sendNotification(user: SessionUser, input: { title: string; body: string; audienceType: 'user' | 'role'; userId?: string; role?: Role }) {
    this.assertAdmin(user)
    const title = input.title?.trim()
    const body = input.body?.trim()
    if (!title || !body) throw new BadRequestException('Notification title and body are required')

    const [recipients] = input.audienceType === 'user'
      ? input.userId
        ? await pool.query<any[]>('SELECT id FROM users WHERE id=? AND is_active=TRUE', [input.userId])
        : [[]]
      : input.audienceType === 'role' && input.role
        ? await pool.query<any[]>('SELECT id FROM users WHERE role=? AND is_active=TRUE ORDER BY created_at ASC', [input.role])
        : [[]]
    if (!recipients.length) throw new BadRequestException('No active notification recipients')

    for (const recipient of recipients) {
      await pool.execute('INSERT INTO notifications (id,user_id,title,body,link) VALUES (?,?,?,?,?)', [randomUUID(), recipient.id, title, body, '/notifications'])
    }
    await this.audit(user.id, 'notification.sent', 'notification', null, { audienceType: input.audienceType, userId: input.userId ?? null, role: input.role ?? null, created: recipients.length })
    return { created: recipients.length }
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
    await this.invalidateBusinessReads()
    return { id: projectId, status: 'archived' }
  }
}
