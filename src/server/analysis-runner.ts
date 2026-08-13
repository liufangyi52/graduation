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

export class AnalysisExecutionError extends Error {
  constructor(cause: unknown, readonly metadata: AnalysisExecutionMetadata) {
    super(cause instanceof Error ? cause.message : 'Analysis execution failed')
    this.name = 'AnalysisExecutionError'
  }
}

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
      let plan: string
      try { plan = await this.deepseek.plan(title, desensitizedContent) }
      catch (error) { throw new AnalysisExecutionError(error, this.metadata(mode, 1)) }
      let result: MeetingAnalysis
      try { result = await this.deepseek.analyzeWithPlan(title, desensitizedContent, plan) }
      catch (error) { throw new AnalysisExecutionError(error, this.metadata(mode, 2)) }
      return { result, metadata: { ...this.metadata(mode, 2), plan } }
    }
    let result: MeetingAnalysis
    try { result = await this.deepseek.analyzeWithPlan(title, desensitizedContent, undefined) }
    catch (error) { throw new AnalysisExecutionError(error, this.metadata(mode, 1)) }
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
