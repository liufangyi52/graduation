import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'

type ProgressEvent = { projectId: string; taskId: string }

export function createDashboardRealtimeService(input: {
  token: string
  onProgress: (event: ProgressEvent) => void
  onDisconnected: () => void
}) {
  const connected = ref(false)
  const desiredProjectIds = new Set<string>()
  const joinedProjectIds = new Set<string>()
  let socket: Socket | undefined
  let fallback: number | undefined

  const stopFallback = () => {
    if (fallback === undefined) return
    window.clearInterval(fallback)
    fallback = undefined
  }
  const startFallback = () => {
    if (fallback === undefined) fallback = window.setInterval(input.onDisconnected, 10_000)
  }
  const joinDesiredProjects = () => {
    if (!connected.value) return
    for (const projectId of desiredProjectIds) {
      if (joinedProjectIds.has(projectId)) continue
      joinedProjectIds.add(projectId)
      socket?.emit('project.join', { projectId })
    }
  }
  const syncProjects = (projectIds: string[]) => {
    for (const projectId of projectIds) if (projectId) desiredProjectIds.add(projectId)
    joinDesiredProjects()
  }
  const markDisconnected = () => {
    connected.value = false
    joinedProjectIds.clear()
    startFallback()
  }

  return {
    connected,
    connect(projectIds: string[]) {
      syncProjects(projectIds)
      socket = io((import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api').replace(/\/api$/, ''), {
        auth: { token: input.token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5_000,
      })
      socket.on('connect', () => {
        connected.value = true
        joinedProjectIds.clear()
        stopFallback()
        joinDesiredProjects()
      })
      socket.on('disconnect', markDisconnected)
      socket.on('connect_error', markDisconnected)
      socket.on('project.progress.updated', input.onProgress)
    },
    syncProjects,
    disconnect() {
      stopFallback()
      desiredProjectIds.clear()
      joinedProjectIds.clear()
      connected.value = false
      socket?.disconnect()
      socket = undefined
    },
  }
}
