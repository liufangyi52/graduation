export type SystemAnalysisMode = 'manual' | 'llm' | 'rag' | 'agent'

const modeMappings: Record<string, SystemAnalysisMode> = {
  manual: 'manual',
  '无 AI': 'manual',
  '人工审核': 'manual',
  llm: 'llm',
  '单轮大模型': 'llm',
  rag: 'rag',
  'RAG 检索增强': 'rag',
  agent: 'agent',
  '智能体': 'agent',
  '智能体编排': 'agent',
}

const modeLabels: Record<SystemAnalysisMode, string> = {
  manual: '人工审核',
  llm: '单轮大模型',
  rag: 'RAG 检索增强',
  agent: '智能体编排',
}

export function normalizeSystemModel(_model: unknown): 'deepseek-v4-pro' {
  return 'deepseek-v4-pro'
}

export function normalizeSystemAnalysisMode(mode: unknown): SystemAnalysisMode {
  const value = String(mode ?? '').trim()
  return modeMappings[value] ?? modeMappings[value.toLowerCase()] ?? 'llm'
}

export function systemAnalysisModeLabel(mode: SystemAnalysisMode): string {
  return modeLabels[mode]
}
