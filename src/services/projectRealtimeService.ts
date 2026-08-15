import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import type { ProjectDetail } from './workspaceService'

type Event = ProjectDetail['activity'][number]

export function createProjectRealtimeService(input: { token: string; projectId: string; onProgress: (event: Event) => void; onDisconnected: () => void }) {
  const connected = ref(false)
  let socket: Socket | undefined
  let fallback: number | undefined
  const stopFallback = () => { if (fallback !== undefined) { window.clearInterval(fallback); fallback = undefined } }
  const startFallback = () => { if (fallback === undefined) fallback = window.setInterval(input.onDisconnected, 10_000) }
  return {
    connected,
    connect() {
      socket = io((import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api').replace(/\/api$/, ''), { auth: { token: input.token }, reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 500, reconnectionDelayMax: 5_000 })
      socket.on('connect', () => { connected.value = true; stopFallback(); socket?.emit('project.join', { projectId: input.projectId }); input.onDisconnected() })
      socket.on('disconnect', () => { connected.value = false; startFallback() })
      socket.on('connect_error', () => { connected.value = false; startFallback() })
      socket.on('project.progress.updated', input.onProgress)
    },
    disconnect() { stopFallback(); socket?.disconnect(); socket = undefined },
  }
}
