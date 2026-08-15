import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const realtimeTestState = vi.hoisted(() => {
  const handlers: Record<string, (payload?: any) => void> = {}
  const socket = {
    on: vi.fn((event: string, handler: (payload?: any) => void) => { handlers[event] = handler }),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }
  return { handlers, socket, io: vi.fn(() => socket) }
})

vi.mock('socket.io-client', () => ({ io: realtimeTestState.io }))

import { createDashboardRealtimeService } from '../src/services/dashboardRealtimeService'

beforeEach(() => vi.stubGlobal('window', globalThis))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  for (const event of Object.keys(realtimeTestState.handlers)) delete realtimeTestState.handlers[event]
})

it('joins visible projects and forwards a progress event immediately', () => {
  const onProgress = vi.fn()
  const realtime = createDashboardRealtimeService({ token: 'token', onProgress, onDisconnected: vi.fn() })

  realtime.connect(['project-a', 'project-b'])
  realtimeTestState.handlers.connect()
  realtimeTestState.handlers['project.progress.updated']({ projectId: 'project-a', taskId: 'task-1' })

  expect(realtimeTestState.socket.emit).toHaveBeenCalledWith('project.join', { projectId: 'project-a' })
  expect(realtimeTestState.socket.emit).toHaveBeenCalledWith('project.join', { projectId: 'project-b' })
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1' }))
})

it('joins newly visible projects and only polls while disconnected', () => {
  vi.useFakeTimers()
  const onDisconnected = vi.fn()
  const realtime = createDashboardRealtimeService({ token: 'token', onProgress: vi.fn(), onDisconnected })

  realtime.connect(['project-a'])
  realtimeTestState.handlers.connect()
  realtime.syncProjects(['project-a', 'project-b'])
  realtimeTestState.handlers.disconnect()
  vi.advanceTimersByTime(10_000)
  realtimeTestState.handlers.connect()
  vi.advanceTimersByTime(10_000)

  expect(realtimeTestState.socket.emit).toHaveBeenCalledWith('project.join', { projectId: 'project-b' })
  expect(onDisconnected).toHaveBeenCalledTimes(1)
})

it('disconnects the socket and clears a disconnected fallback timer', () => {
  vi.useFakeTimers()
  const onDisconnected = vi.fn()
  const realtime = createDashboardRealtimeService({ token: 'token', onProgress: vi.fn(), onDisconnected })

  realtime.connect(['project-a'])
  realtimeTestState.handlers.disconnect()
  realtime.disconnect()
  vi.advanceTimersByTime(10_000)

  expect(realtimeTestState.socket.disconnect).toHaveBeenCalledOnce()
  expect(onDisconnected).not.toHaveBeenCalled()
})
