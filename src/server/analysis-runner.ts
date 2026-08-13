import { Inject, Injectable } from '@nestjs/common'
import { DeepSeekService, type MeetingAnalysis } from './deepseek.service'

export type AnalysisMode = 'manual' | 'llm' | 'rag' | 'agent'

export type AnalysisExecutionMetadata = {
  mode: AnalysisMode
  model: string | null
  modelCallCount: number
  retrievalEnabled: boolean
  retrievalStatus: 'not_applicable' | 'not_configured'
  plan?: string
}

export type AnalysisRunnerInput = { mode: AnalysisMode; title: string; desensitizedContent: string }
export type AnalysisRunnerResult = { result: MeetingAnalysis; metadata: AnalysisExecutionMetadata }
type AnalysisProvider = Pick<DeepSeekService, 'analyzeWithPlan' | 'plan'>

@Injectable()
export class AnalysisRunner {
  constructor(@Inject(DeepSeekService) private readonly deepseek: AnalysisProvider) {}

  async run({ mode, title, desensitizedContent }: AnalysisRunnerInput): Promise<AnalysisRunnerResult> {
    if (mode === 'manual') {
      return {
        result: { summary: 'Manual review required', decisions: [], tasks: [], risks: [] },
        metadata: this.metadata(mode, 0),
      }
    }
    if (mode === 'agent') {
      const plan = await this.deepseek.plan(title, desensitizedContent)
      const result = await this.deepseek.analyzeWithPlan(title, desensitizedContent, plan)
      return { result, metadata: { ...this.metadata(mode, 2), plan } }
    }
    const result = await this.deepseek.analyzeWithPlan(title, desensitizedContent, undefined)
    return { result, metadata: this.metadata(mode, 1) }
  }

  private metadata(mode: AnalysisMode, modelCallCount: number): AnalysisExecutionMetadata {
    return {
      mode,
      model: mode === 'manual' ? null : process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
      modelCallCount,
      retrievalEnabled: false,
      retrievalStatus: mode === 'rag' ? 'not_configured' : 'not_applicable',
    }
  }
}
