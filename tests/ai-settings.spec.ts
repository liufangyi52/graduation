import { expect, it } from 'vitest'
import { normalizeSystemAnalysisMode, normalizeSystemModel, systemAnalysisModeLabel } from '../src/server/ai-settings'

it('normalizes legacy model names to the supported DeepSeek V4 Pro identifier', () => {
  expect(normalizeSystemModel('DeepSeek V3')).toBe('deepseek-v4-pro')
  expect(normalizeSystemModel('deepseek-v4-pro')).toBe('deepseek-v4-pro')
})

it('normalizes legacy and localized mode values to executable modes', () => {
  expect(normalizeSystemAnalysisMode('RAG')).toBe('rag')
  expect(normalizeSystemAnalysisMode('智能体编排')).toBe('agent')
  expect(normalizeSystemAnalysisMode('unknown')).toBe('llm')
  expect(systemAnalysisModeLabel('manual')).toBe('人工审核')
})
