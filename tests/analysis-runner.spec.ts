import { expect, it, vi } from 'vitest'
import { AnalysisRunner } from '../src/server/analysis-runner'
import type { MeetingAnalysis } from '../src/server/deepseek.service'

const providerResult: MeetingAnalysis = {
  summary: 'Provider summary',
  decisions: ['Approve launch'],
  tasks: [{ title: 'Prepare launch', priority: 'high' }],
  risks: [{ title: 'Timeline', level: 'medium' }],
}

function createProvider() {
  return {
    analyzeWithPlan: vi.fn().mockResolvedValue(providerResult),
    plan: vi.fn().mockResolvedValue('Inspect actions and risks'),
  }
}

it('returns a manual-review draft without calling the provider', async () => {
  const provider = createProvider()
  const runner = new AnalysisRunner(provider)

  const execution = await runner.run({ mode: 'manual', title: 'Standup', desensitizedContent: '[PHONE]' })

  expect(execution).toEqual({
    result: { summary: 'Manual review required', decisions: [], tasks: [], risks: [] },
    metadata: {
      mode: 'manual',
      model: null,
      modelCallCount: 0,
      retrievalEnabled: false,
      retrievalStatus: 'not_applicable',
    },
  })
  expect(provider.analyzeWithPlan).not.toHaveBeenCalled()
  expect(provider.plan).not.toHaveBeenCalled()
})

it('runs one structured extraction for LLM mode', async () => {
  const provider = createProvider()
  const runner = new AnalysisRunner(provider)

  const execution = await runner.run({ mode: 'llm', title: 'Standup', desensitizedContent: '[PHONE]' })

  expect(execution.result).toEqual(providerResult)
  expect(execution.metadata).toEqual({
    mode: 'llm',
    model: 'deepseek-chat',
    modelCallCount: 1,
    retrievalEnabled: false,
    retrievalStatus: 'not_applicable',
  })
  expect(provider.analyzeWithPlan).toHaveBeenCalledOnce()
  expect(provider.analyzeWithPlan).toHaveBeenCalledWith('Standup', '[PHONE]', undefined)
  expect(provider.plan).not.toHaveBeenCalled()
})

it('runs one structured extraction and reports unavailable retrieval for RAG mode', async () => {
  const provider = createProvider()
  const runner = new AnalysisRunner(provider)

  const execution = await runner.run({ mode: 'rag', title: 'Standup', desensitizedContent: '[PHONE]' })

  expect(execution.result).toEqual(providerResult)
  expect(execution.metadata).toEqual({
    mode: 'rag',
    model: 'deepseek-chat',
    modelCallCount: 1,
    retrievalEnabled: false,
    retrievalStatus: 'not_configured',
  })
  expect(provider.analyzeWithPlan).toHaveBeenCalledOnce()
  expect(provider.analyzeWithPlan).toHaveBeenCalledWith('Standup', '[PHONE]', undefined)
  expect(provider.plan).not.toHaveBeenCalled()
})

it('plans then extracts for agent mode', async () => {
  const provider = createProvider()
  const runner = new AnalysisRunner(provider)

  const execution = await runner.run({ mode: 'agent', title: 'Standup', desensitizedContent: '[PHONE]' })

  expect(execution.result).toEqual(providerResult)
  expect(execution.metadata).toEqual({
    mode: 'agent',
    model: 'deepseek-chat',
    modelCallCount: 2,
    retrievalEnabled: false,
    retrievalStatus: 'not_applicable',
    plan: 'Inspect actions and risks',
  })
  expect(provider.plan).toHaveBeenCalledOnce()
  expect(provider.plan).toHaveBeenCalledWith('Standup', '[PHONE]')
  expect(provider.analyzeWithPlan).toHaveBeenCalledOnce()
  expect(provider.analyzeWithPlan).toHaveBeenCalledWith('Standup', '[PHONE]', 'Inspect actions and risks')
})
