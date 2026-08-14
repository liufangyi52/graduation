import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createMeetingService } from '../src/services/meetingService'

const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const readmeSource = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

afterEach(() => vi.restoreAllMocks())

it('documents Qdrant-backed RAG operations and baseline semantics', () => {
  expect(readmeSource).toContain('docker compose up -d qdrant')
  expect(readmeSource).toContain('Qdrant')
  expect(readmeSource).toContain('SiliconFlow')
  expect(readmeSource).toContain('Qwen/Qwen3-Embedding-4B')
  expect(readmeSource).toContain('`retrievalStatus=not_configured`')
  expect(readmeSource).toContain('脱敏')
})

it('requests the selected project experiment summary', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))

  await createMeetingService('token').experimentSummary('project-1')

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/projects/project-1/experiment-summary'),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
  )
})

it('limits the experiment summary to managers and exposes readable aggregate metrics', () => {
  expect(appSource).toContain("currentPage === 'experiments' && canManageBusiness")
  expect(appSource).toContain('平均耗时')
  expect(appSource).toContain('模型调用次数')
  expect(appSource).toContain('检索未配置时为无检索基线')
})

it('documents RAG as the current no-retrieval baseline', () => {
  expect(readmeSource).toContain('`rag` 表示当前无检索 RAG 基线')
  expect(readmeSource).toContain('`retrievalStatus=not_configured`')
  expect(readmeSource).not.toContain('`rag` 表示检索增强运行')
})
