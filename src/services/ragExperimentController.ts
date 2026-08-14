import { reactive } from 'vue'
import type { ExperimentSummary, RagIndexStatus } from './meetingService'
import { createRagIndexRequestGuard } from './ragIndexRequestGuard'

type RagExperimentApi = {
  experimentSummary(projectId: string): Promise<ExperimentSummary>
  ragIndexStatus(projectId: string): Promise<RagIndexStatus>
  syncRagIndex(projectId: string): Promise<{ indexedChunks: number }>
}

export function createRagExperimentController(api: RagExperimentApi) {
  const state = reactive({ projectId: '', summary: null as ExperimentSummary | null, status: null as RagIndexStatus | null, summaryLoading: false, statusLoading: false, syncing: false, notice: '' })
  const requests = createRagIndexRequestGuard()
  const isCurrent = (request: ReturnType<typeof requests.issue>) => state.projectId === request.projectId && requests.isCurrent(request)

  async function loadStatus(projectId: string) {
    const request = requests.issue('status', projectId)
    state.status = null; state.statusLoading = true
    try {
      const status = await api.ragIndexStatus(projectId)
      if (!isCurrent(request)) return
      state.status = status
    } catch {
      if (!isCurrent(request)) return
      state.status = null
    } finally { if (isCurrent(request)) state.statusLoading = false }
  }

  async function loadSelectedProject(projectId: string) {
    state.projectId = projectId
    requests.select(projectId)
    state.notice = ''; state.syncing = false
    if (!projectId) {
      state.summary = null; state.status = null; state.statusLoading = false; state.summaryLoading = false
      return
    }
    const request = requests.issue('summary', projectId)
    state.summary = null
    state.summaryLoading = true
    const statusLoad = loadStatus(projectId)
    try {
      const summary = await api.experimentSummary(projectId)
      if (!isCurrent(request)) return
      state.summary = summary
    } catch (reason) {
      if (!isCurrent(request)) return
      state.summary = null
      state.notice = reason instanceof Error ? reason.message : '实验汇总加载失败'
    } finally { if (isCurrent(request)) state.summaryLoading = false }
    await statusLoad
  }

  async function sync() {
    if (!state.projectId || !isReady()) return
    const request = requests.issue('sync', state.projectId)
    state.syncing = true; state.notice = ''
    try {
      const result = await api.syncRagIndex(request.projectId)
      if (!isCurrent(request)) return
      state.notice = `RAG 索引同步完成：${result.indexedChunks} 个脱敏分块`
      await loadStatus(request.projectId)
    } catch (reason) {
      if (!isCurrent(request)) return
      state.notice = reason instanceof Error ? reason.message : 'RAG 索引同步失败'
    } finally { if (isCurrent(request)) state.syncing = false }
  }

  function isReady() { return !state.statusLoading && Boolean(state.status?.configured && state.status.ready) }
  return { state, isReady, loadSelectedProject, sync }
}
