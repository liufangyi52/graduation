import { WebSocketGateway, WebSocketServer, SubscribeMessage, WsException } from '@nestjs/websockets'
import jwt from 'jsonwebtoken'
import type { Server, Socket } from 'socket.io'
import { pool } from './database'
import type { ProjectProgressEvent } from './project-progress.types'

type SocketUser = { id: string; role: 'manager' | 'member' | 'admin' | 'auditor'; name: string; email: string; authVersion?: number }

@WebSocketGateway({ cors: { origin: (process.env.CORS_ORIGINS ?? 'http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean), credentials: true } })
export class ProjectProgressGateway {
  @WebSocketServer() server!: Server

  async handleConnection(socket: Socket) {
    try {
      const supplied = socket.handshake.auth?.token ?? socket.handshake.headers.authorization
      const token = typeof supplied === 'string' ? supplied.replace(/^Bearer\s+/i, '') : ''
      const verified = jwt.verify(token, process.env.JWT_SECRET as string) as SocketUser
      const [users] = await pool.query<any[]>('SELECT id,role,name,email,is_active,auth_version FROM users WHERE id=?', [verified.id])
      const user = users[0]
      if (!user?.is_active || Number(user.auth_version ?? 0) !== Number(verified.authVersion ?? -1)) throw new Error('Invalid session')
      socket.data.user = { id: user.id, role: user.role, name: user.name, email: user.email, authVersion: Number(user.auth_version ?? 0) } satisfies SocketUser
    } catch {
      socket.disconnect(true)
    }
  }

  @SubscribeMessage('project.join')
  async joinProject(socket: Socket, payload: { projectId?: string }) {
    const user = socket.data.user as SocketUser | undefined
    const projectId = payload?.projectId
    if (!user || !projectId || !['manager', 'member'].includes(user.role)) throw new WsException('You cannot view this project')
    const managerFilter = user.role === 'manager' ? 'p.owner_id=?' : 'EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=?)'
    const [projects] = await pool.query<any[]>(`SELECT p.id FROM projects p WHERE p.id=? AND p.deleted_at IS NULL AND ${managerFilter}`, [projectId, user.id])
    if (!projects[0]) throw new WsException('You cannot view this project')
    await socket.join(`project:${projectId}`)
    return { projectId }
  }

  emitProgress(event: ProjectProgressEvent) { this.server?.to(`project:${event.projectId}`).emit('project.progress.updated', event) }
}
