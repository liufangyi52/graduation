import { Inject, Injectable, Optional } from '@nestjs/common'
import { DeepSeekService, type MeetingAnalysis } from './deepseek.service'
import { RagIndexService, type RetrievalEvidence } from './rag-index.service'

export type AnalysisMode = 'manual' | 'llm' | 'rag' | 'agent'

export type AnalysisExecutionMetadata = {
  mode: AnalysisMode
  model: string | null
  modelCallCount: number
  retrievalEnabled: boolean
  retrievalStatus: 'completed' | 'failed' | 'not_applicable' | 'not_configured'
  retrievalDurationMs?: number
  retrievalHitCount?: number
  retrievalSources?: Array<{ meetingId: string; versionId: string; chunkIndex: number; score: number }>
  plan?: string
}

export type AnalysisRunnerInput = {
  mode: AnalysisMode
  model?: string
  title: string
  projectId?: string
  meetingId?: string
  versionId?: string
  desensitizedContent: string
}
export type AnalysisRunnerResult = { result: MeetingAnalysis; metadata: AnalysisExecutionMetadata }
type AnalysisProvider = Pick<DeepSeekService, 'analyzeWithContext' | 'analyzeWithPlan' | 'plan'>
type RagRetriever = Pick<RagIndexService, 'isConfigured' | 'retrieve'>

export class AnalysisExecutionError extends Error {
  constructor(cause: unknown, readonly metadata: AnalysisExecutionMetadata) {
    super(cause instanceof Error ? cause.message : 'Analysis execution failed')
    this.name = 'AnalysisExecutionError'
  }
}

@Injectable()
export class AnalysisRunner {
  constructor(
    @Inject(DeepSeekService) private readonly deepseek: AnalysisProvider,
    @Optional() @Inject(RagIndexService) private readonly rag?: RagRetriever,
  ) {}

  async run(input: AnalysisRunnerInput): Promise<AnalysisRunnerResult> {
    const { mode, model, title, desensitizedContent } = input
    if (mode === 'manual') {
      return {
        result: { summary: 'Manual review required', decisions: [], tasks: [], risks: [] },
        metadata: this.metadata(mode, 0, model),
      }
    }
    if (mode === 'agent') {
      let plan: string
      try { plan = model === undefined ? await this.deepseek.plan(title, desensitizedContent) : await this.deepseek.plan(title, desensitizedContent, model) }
      catch (error) { throw new AnalysisExecutionError(error, this.metadata(mode, 1, model)) }
      let result: MeetingAnalysis
      try { result = model === undefined ? await this.deepseek.analyzeWithPlan(title, desensitizedContent, plan) : await this.deepseek.analyzeWithPlan(title, desensitizedContent, plan, model) }
      catch (error) { throw new AnalysisExecutionError(error, this.metadata(mode, 2, model)) }
      return { result, metadata: { ...this.metadata(mode, 2, model), plan } }
    }
    if (mode === 'rag' && this.rag?.isConfigured()) return this.runRag(input)
    let result: MeetingAnalysis
    try { result = model === undefined ? await this.deepseek.analyzeWithPlan(title, desensitizedContent, undefined) : await this.deepseek.analyzeWithPlan(title, desensitizedContent, undefined, model) }
    catch (error) { throw new AnalysisExecutionError(error, this.metadata(mode, 1, model)) }
    return { result, metadata: this.metadata(mode, 1, model) }
  }

  private async runRag(input: AnalysisRunnerInput): Promise<AnalysisRunnerResult> {
    const startedAt = Date.now()
    if (!input.projectId || !input.meetingId || !input.versionId) {
      throw new AnalysisExecutionError(new Error('RAG retrieval failed'), this.failedRagMetadata(Date.now() - startedAt, input.model))
    }
    let retrieval: Awaited<ReturnType<RagRetriever['retrieve']>>
    try {
      retrieval = await this.rag!.retrieve({
        projectId: input.projectId,
        meetingId: input.meetingId,
        versionId: input.versionId,
        desensitizedContent: input.desensitizedContent,
      })
    } catch {
      throw new AnalysisExecutionError(new Error('RAG retrieval failed'), this.failedRagMetadata(Date.now() - startedAt, input.model))
    }
    const evidence = retrieval.evidence.slice(0, 5)
    const context = this.evidenceContext(evidence)
    let result: MeetingAnalysis
    try {
      result = input.model === undefined
        ? await this.deepseek.analyzeWithContext(input.title, input.desensitizedContent, context)
        : await this.deepseek.analyzeWithContext(input.title, input.desensitizedContent, context, input.model)
    } catch (error) {
      throw new AnalysisExecutionError(error, {
        ...this.completedRagMetadata(retrieval.durationMs, evidence, input.model),
        modelCallCount: 1,
      })
    }
    return { result, metadata: this.completedRagMetadata(retrieval.durationMs, evidence, input.model) }
  }

  private evidenceContext(evidence: RetrievalEvidence[]): string {
    return evidence.map((item, index) =>
      `Source ${index + 1} [meeting=${item.meetingId}, version=${item.versionId}, chunk=${item.chunkIndex}, score=${item.score}]:\n${item.text}`,
    ).join('\n\n')
  }

  private completedRagMetadata(durationMs: number, evidence: RetrievalEvidence[], model?: string): AnalysisExecutionMetadata {
    return {
      ...this.metadata('rag', 1, model),
      retrievalEnabled: true,
      retrievalStatus: 'completed',
      retrievalDurationMs: Math.max(0, durationMs),
      retrievalHitCount: evidence.length,
      retrievalSources: evidence.map(({ meetingId, versionId, chunkIndex, score }) => ({ meetingId, versionId, chunkIndex, score })),
    }
  }

  private failedRagMetadata(durationMs: number, model?: string): AnalysisExecutionMetadata {
    return {
      ...this.metadata('rag', 0, model),
      retrievalEnabled: true,
      retrievalStatus: 'failed',
      retrievalDurationMs: Math.max(0, durationMs),
    }
  }

  private metadata(mode: AnalysisMode, modelCallCount: number, model?: string): AnalysisExecutionMetadata {
    return {
      mode,
      model: mode === 'manual' ? null : model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
      modelCallCount,
      retrievalEnabled: false,
      retrievalStatus: mode === 'rag' ? 'not_configured' : 'not_applicable',
    }
  }
}
