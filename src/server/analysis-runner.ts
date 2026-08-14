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
    const { mode, title, desensitizedContent } = input
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
    if (mode === 'rag' && this.rag?.isConfigured()) return this.runRag(input)
    let result: MeetingAnalysis
    try { result = await this.deepseek.analyzeWithPlan(title, desensitizedContent, undefined) }
    catch (error) { throw new AnalysisExecutionError(error, this.metadata(mode, 1)) }
    return { result, metadata: this.metadata(mode, 1) }
  }

  private async runRag(input: AnalysisRunnerInput): Promise<AnalysisRunnerResult> {
    const startedAt = Date.now()
    if (!input.projectId || !input.meetingId || !input.versionId) {
      throw new AnalysisExecutionError(new Error('RAG retrieval failed'), this.failedRagMetadata(Date.now() - startedAt))
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
      throw new AnalysisExecutionError(new Error('RAG retrieval failed'), this.failedRagMetadata(Date.now() - startedAt))
    }
    const evidence = retrieval.evidence.slice(0, 5)
    const context = this.evidenceContext(evidence)
    let result: MeetingAnalysis
    try {
      result = await this.deepseek.analyzeWithContext(input.title, input.desensitizedContent, context)
    } catch (error) {
      throw new AnalysisExecutionError(error, {
        ...this.completedRagMetadata(retrieval.durationMs, evidence),
        modelCallCount: 1,
      })
    }
    return { result, metadata: this.completedRagMetadata(retrieval.durationMs, evidence) }
  }

  private evidenceContext(evidence: RetrievalEvidence[]): string {
    return evidence.map((item, index) =>
      `Source ${index + 1} [meeting=${item.meetingId}, version=${item.versionId}, chunk=${item.chunkIndex}, score=${item.score}]:\n${item.text}`,
    ).join('\n\n')
  }

  private completedRagMetadata(durationMs: number, evidence: RetrievalEvidence[]): AnalysisExecutionMetadata {
    return {
      ...this.metadata('rag', 1),
      retrievalEnabled: true,
      retrievalStatus: 'completed',
      retrievalDurationMs: Math.max(0, durationMs),
      retrievalHitCount: evidence.length,
      retrievalSources: evidence.map(({ meetingId, versionId, chunkIndex, score }) => ({ meetingId, versionId, chunkIndex, score })),
    }
  }

  private failedRagMetadata(durationMs: number): AnalysisExecutionMetadata {
    return {
      ...this.metadata('rag', 0),
      retrievalEnabled: true,
      retrievalStatus: 'failed',
      retrievalDurationMs: Math.max(0, durationMs),
    }
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
