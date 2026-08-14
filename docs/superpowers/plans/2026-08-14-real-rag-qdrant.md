# Real RAG With Qdrant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current no-retrieval `rag` baseline with a Qdrant-backed, SiliconFlow-embedded, project-scoped retrieval path while preserving the existing four-mode experiment contract.

**Architecture:** Provider and vector-store adapters isolate external HTTP contracts. `RagIndexService` owns deterministic desensitized-text chunking, point construction, synchronization, and project-filtered retrieval. `AnalysisRunner` dispatches completed retrieval to DeepSeek once, while `AppService` keeps authorization, persistence, audit, and review responsibilities.

**Tech Stack:** Vue 3, TypeScript, NestJS, MySQL/mysql2, Qdrant REST API, Docker Compose, SiliconFlow OpenAI-compatible embeddings API, Vitest.

## Global Constraints

- The only embedding request is `POST https://api.siliconflow.cn/v1/embeddings`; default model is exactly `Qwen/Qwen3-Embedding-4B` and response vectors must have exactly `2560` dimensions.
- Read `SILICONFLOW_API_KEY`, `SILICONFLOW_BASE_URL`, `EMBEDDING_MODEL`, and `QDRANT_URL` only from ignored `.env`; never commit, return, audit, log, or persist secret values.
- Only `meeting_versions.desensitized_content` may reach chunking, embedding, Qdrant payloads, runner input, DeepSeek RAG context, test snapshots, or retrieval display. Original meeting content is prohibited in every RAG path.
- Chunks are deterministic 1200-character windows with 200-character overlap. A point ID is SHA-256 of project ID, meeting ID, version ID, chunk index, and desensitized chunk text.
- Qdrant uses cosine distance, project filtering for every search, and excludes the current version. Default retrieval limit is five.
- `manual`, `llm`, and `agent` behavior is unchanged. Completed `rag` makes exactly one DeepSeek extraction call; embedding calls are not included in `modelCallCount`.
- Missing RAG configuration retains the existing `retrievalStatus='not_configured'` baseline. Configured dependency or validation failure produces a failed analysis record and never silently downgrades to completed no-retrieval analysis.
- Metadata and audit entries are bounded and safe: source identifiers/scores, hit count, duration, and retrieval state only. No raw prompts, original text, provider errors, API keys, or copied chunk text.
- The explicit project synchronization API and experiment/index controls are manager-only for the manager's own project.

---

### Task 1: Add Qdrant Deployment And External Adapters

**Files:**
- Create: `docker-compose.yml`
- Create: `src/server/embedding-provider.ts`
- Create: `src/server/vector-store.ts`
- Create: `tests/embedding-provider.spec.ts`
- Create: `tests/vector-store.spec.ts`
- Modify: `.env.example`
- Modify: `src/server/app.module.ts`

**Interfaces:**
- `type EmbeddingProvider = { isConfigured(): boolean; embed(texts: string[]): Promise<number[][]> }`
- `class SiliconFlowEmbeddingProvider implements EmbeddingProvider`
- `type VectorPoint = { id: string; vector: number[]; payload: VectorPayload }`
- `type VectorPayload = { projectId: string; meetingId: string; versionId: string; chunkIndex: number; contentHash: string; text: string }`
- `type VectorStore = { isConfigured(): boolean; ensureCollection(): Promise<void>; upsert(points: VectorPoint[]): Promise<void>; search(vector: number[], query: { projectId: string; excludedVersionId: string; limit: number }): Promise<VectorSearchResult[]>; health(): Promise<boolean> }`
- `class QdrantVectorStore implements VectorStore`

- [ ] **Step 1: Write failing adapter tests**

Create `tests/embedding-provider.spec.ts` using a mocked `fetch` response containing two literal 2560-element arrays. Assert `embed(['alpha', 'beta'])` sends `POST https://api.siliconflow.cn/v1/embeddings`, the configured `Qwen/Qwen3-Embedding-4B` model, a Bearer key header, and returns ordered vectors. Add failures for wrong response count and a 2559-element vector; each must reject with a sanitized embedding-provider error that excludes the provider body and key.

Create `tests/vector-store.spec.ts` using mocked `fetch`. Assert `ensureCollection()` creates `meeting_rag_chunks` once with `{ size: 2560, distance: 'Cosine' }`, `upsert()` sends only typed points, and `search()` sends a filter with both `projectId` match and `versionId` must-not exclusion. Assert returned data maps to `{ meetingId, versionId, chunkIndex, score, text }` and malformed Qdrant data rejects without surfacing its raw body.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/embedding-provider.spec.ts tests/vector-store.spec.ts`

Expected: FAIL because the two adapter modules do not exist.

- [ ] **Step 3: Implement minimal adapters and deployment**

Create `docker-compose.yml`:

```yaml
services:
  qdrant:
    image: qdrant/qdrant:v1.13.4
    ports:
      - "127.0.0.1:6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
volumes:
  qdrant_data:
```

Implement `SiliconFlowEmbeddingProvider` with `SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1'`, `EMBEDDING_MODEL ?? 'Qwen/Qwen3-Embedding-4B'`, `encoding_format: 'float'`, and a 2560-dimension validator. Use a single sanitized `ServiceUnavailableException('Embedding service is unavailable')` for external errors.

Implement `QdrantVectorStore` with collection name `meeting_rag_chunks`, collection creation on a 404 collection lookup, cosine configuration, batch upsert, and `/points/search` filtering. Use `QDRANT_URL`; HTTP/parsing errors become `ServiceUnavailableException('Vector store is unavailable')`. Register both injectable services in `AppModule`.

Add this non-secret configuration to `.env.example`:

```dotenv
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-4B
QDRANT_URL=http://127.0.0.1:6333
```

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/embedding-provider.spec.ts tests/vector-store.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add docker-compose.yml .env.example src/server/embedding-provider.ts src/server/vector-store.ts src/server/app.module.ts tests/embedding-provider.spec.ts tests/vector-store.spec.ts && git commit -m "feat: add Qdrant RAG adapters"`

### Task 2: Implement Desensitized Chunk Indexing And Retrieval

**Files:**
- Create: `src/server/rag-index.service.ts`
- Create: `tests/rag-index.service.spec.ts`
- Modify: `src/server/app.module.ts`

**Interfaces:**
- `type RagVersion = { projectId: string; meetingId: string; versionId: string; desensitizedContent: string }`
- `type RetrievalEvidence = { meetingId: string; versionId: string; chunkIndex: number; score: number; text: string }`
- `class RagIndexService { isConfigured(): boolean; syncVersion(version: RagVersion): Promise<{ indexedChunks: number }>; retrieve(input: RagVersion): Promise<{ evidence: RetrievalEvidence[]; durationMs: number }>; health(): Promise<boolean> }`
- `export function chunkDesensitizedContent(content: string): string[]`
- `export function ragPointId(version: RagVersion, chunkIndex: number, text: string): string`

- [ ] **Step 1: Write failing index-service tests**

Create `tests/rag-index.service.spec.ts`. Assert a 2400-character literal input yields three chunks with offsets `0`, `1000`, and `2000`; assert a whitespace-only input yields none. Assert `ragPointId()` returns the same 64-character lowercase SHA-256 hex string for identical literal input and changes when only `versionId` changes.

Use real `RagIndexService` with fake adapter classes. Assert `syncVersion()` embeds and upserts only desensitized text, sends payload fields exactly `projectId`, `meetingId`, `versionId`, `chunkIndex`, `contentHash`, and `text`, and never contains fixture original text such as `13800138000`. Assert `retrieve()` synchronizes then searches with the input project and input version exclusion, maps five-or-fewer results, and reports a non-negative duration. Assert it does not call the embedder or vector store when `isConfigured()` is false.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/rag-index.service.spec.ts`

Expected: FAIL because `RagIndexService` and deterministic helpers do not exist.

- [ ] **Step 3: Implement the index boundary**

Implement 1200-character windows advancing by 1000 characters, trim only to decide whether a chunk is empty, and preserve the original desensitized chunk string for embedding and payload. Derive `contentHash` from the chunk with `createHash('sha256')`; derive point IDs from all five specified stable inputs. `syncVersion()` must ensure the collection, embed chunks in one batch, verify matching counts, and upsert deterministic points.

`retrieve()` must reject unavailable configured dependencies through the adapter errors, synchronize the current version first, embed the current desensitized content as the query, call project-scoped search with `excludedVersionId`, cap the request at five, and return only the normalized evidence and elapsed time. Register the service in `AppModule`.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/rag-index.service.spec.ts tests/embedding-provider.spec.ts tests/vector-store.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/server/rag-index.service.ts src/server/app.module.ts tests/rag-index.service.spec.ts && git commit -m "feat: index desensitized meeting versions for RAG"`

### Task 3: Run Real RAG, Persist Safe Metadata, And Sync Projects

**Files:**
- Modify: `src/server/analysis-runner.ts`
- Modify: `src/server/deepseek.service.ts`
- Modify: `src/server/app.service.ts`
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/app.module.ts`
- Modify: `tests/analysis-runner.spec.ts`
- Modify: `tests/analysis-experiment-service.spec.ts`
- Create: `tests/rag-project-sync.spec.ts`

**Interfaces:**
- `AnalysisRunner.run({ mode, title, projectId, meetingId, versionId, desensitizedContent })`
- `DeepSeekService.analyzeWithContext(title, content, context?: string): Promise<MeetingAnalysis>`
- `AnalysisExecutionMetadata.retrievalStatus` includes `'completed' | 'failed' | 'not_configured' | 'not_applicable'`.
- `AnalysisExecutionMetadata.retrievalDurationMs?: number`, `retrievalHitCount?: number`, `retrievalSources?: Array<{ meetingId: string; versionId: string; chunkIndex: number; score: number }>`.
- `AppService.syncProjectRagIndex(user, projectId): Promise<{ indexedChunks: number }>`
- `POST /projects/:id/rag-index/sync`

- [ ] **Step 1: Write failing runner, persistence, and authorization tests**

Extend `tests/analysis-runner.spec.ts` with a configured fake RAG service returning two literal evidence items. Assert `rag` calls `analyzeWithContext()` exactly once with the current `[PHONE]` content and a context containing source labels `Source 1` and `Source 2`; assert metadata has `retrievalEnabled: true`, `retrievalStatus: 'completed'`, hit count `2`, source identifiers/scores but no evidence `text`, and `modelCallCount: 1`.

Add an unconfigured fake RAG service test that keeps the current `not_configured` one-call baseline. Add a configured-service failure test that throws `AnalysisExecutionError` carrying `retrievalStatus: 'failed'`, zero DeepSeek extraction calls, and a sanitized message.

Extend `tests/analysis-experiment-service.spec.ts` so completed RAG persistence includes duration, hit count, and identifiers but excludes both original-content fixture `13800138000` and retrieved chunk text. Add the corresponding failure metadata persistence assertion.

Create `tests/rag-project-sync.spec.ts`. Mock two current-version rows containing original and desensitized values. Assert a manager owner calls `syncVersion()` twice with only the desensitized fields and receives the summed literal chunk count. Assert another manager and a member are rejected; assert audit payload excludes meeting text.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/analysis-runner.spec.ts tests/analysis-experiment-service.spec.ts tests/rag-project-sync.spec.ts`

Expected: FAIL because RAG context, completed retrieval metadata, and project synchronization do not exist.

- [ ] **Step 3: Implement real RAG execution and server contracts**

Extend the runner input to include current project, meeting, and version identifiers. Inject `RagIndexService`. For `rag`, call `isConfigured()` first; retain the existing baseline only if false. For configured retrieval, retrieve evidence, build a compact context of at most five numbered chunks, call `analyzeWithContext()` once, and return safe metadata. Do not retain evidence text in metadata. Map retrieval exceptions to `AnalysisExecutionError` with `retrievalStatus: 'failed'` and no raw cause text.

Make `DeepSeekService.analyzeWithContext()` append a bounded evidence section to the user message; keep `analyze()` and agent planning paths behaviorally unchanged. `AppService` must read `current_version_id` and `desensitized_content` only when creating the runner input, preserve the new safe metadata fields in `persistedExecutionMetadata()`, and use the existing failed-analysis persistence path.

Implement manager-only project sync by selecting every current meeting version's ID/project/meeting/desensitized text, invoking `syncVersion()` sequentially, summing chunk counts, auditing `{ indexedChunks }`, and invalidating business cache. Add the controller endpoint and register dependencies.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/analysis-runner.spec.ts tests/analysis-experiment-service.spec.ts tests/rag-project-sync.spec.ts tests/meeting-workflow.spec.ts tests/review-reanalysis.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/server/analysis-runner.ts src/server/deepseek.service.ts src/server/app.service.ts src/server/app.controller.ts src/server/app.module.ts tests/analysis-runner.spec.ts tests/analysis-experiment-service.spec.ts tests/rag-project-sync.spec.ts && git commit -m "feat: run and audit real RAG analyses"`

### Task 4: Expose Safe Index Controls, Retrieval Evidence, And Operations Guide

**Files:**
- Modify: `src/services/meetingService.ts`
- Modify: `src/App.vue`
- Modify: `src/components/MeetingReviewPage.vue`
- Modify: `README.md`
- Modify: `.env.example`
- Create: `tests/rag-ui.spec.ts`

**Interfaces:**
- `AnalysisExecutionMetadata` client type includes completed retrieval fields and safe source identifiers.
- `createMeetingService.syncRagIndex(projectId)` calls `POST /projects/:id/rag-index/sync`.
- Manager experiments display RAG configuration/index action; review detail displays only safe sources.

- [ ] **Step 1: Write failing client behavior tests**

Create `tests/rag-ui.spec.ts`. Mock `fetch`, invoke `syncRagIndex('project-1')`, and assert a POST to `/projects/project-1/rag-index/sync` with the bearer token. Read the rendered component source only to mount-independent contract-check the existing Vue structure: it must bind the sync command to a manager-only experiments condition and render a retrieval-source loop using `meetingId`, `versionId`, `chunkIndex`, and `score`, but must not render a `source.text` binding. Assert the client metadata mapper preserves literal completed retrieval fields.

Update `tests/experiment-summary-ui.spec.ts` to replace the old documentation assertion: README must document Qdrant, SiliconFlow, the exact embedding model, `not_configured` baseline semantics, and the explicit `docker compose up -d qdrant` command.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/rag-ui.spec.ts tests/experiment-summary-ui.spec.ts tests/review-detail-ui.spec.ts`

Expected: FAIL because no client sync method, source display, or real-RAG operating guide exists.

- [ ] **Step 3: Implement manager controls and safe display**

Add client types/method. In the existing manager-only experiments section of `App.vue`, add a project-scoped `同步 RAG 索引` command, a concise success/error state, and explicit configuration status. Keep it absent for non-managers. In `MeetingReviewPage.vue`, render completed retrieval duration, hit count, and source identifiers/scores; do not render retrieved chunk text, raw metadata JSON, secrets, or prompts.

Update README with environment variables, Docker command, health expectation, SiliconFlow model/endpoints, desensitized-only policy, RAG baseline-vs-completed semantics, and the failure behavior. Keep `.env.example` aligned with Task 1.

- [ ] **Step 4: Verify GREEN and live vector-store readiness**

Run: `npx vitest run tests/rag-ui.spec.ts tests/experiment-summary-ui.spec.ts tests/review-detail-ui.spec.ts tests/analysis-mode-ui.spec.ts`

Expected: PASS.

Run: `"C:\Program Files\Docker\Docker\resources\bin\docker.exe" compose up -d qdrant`

Expected: Qdrant container starts using the named volume and loopback-only port binding.

Run: `"C:\Program Files\Docker\Docker\resources\bin\docker.exe" compose ps`

Expected: `qdrant` is running.

- [ ] **Step 5: Commit**

Run: `git add src/services/meetingService.ts src/App.vue src/components/MeetingReviewPage.vue README.md .env.example tests/rag-ui.spec.ts tests/experiment-summary-ui.spec.ts && git commit -m "feat: expose RAG index and retrieval evidence"`

### Task 5: Final RAG Verification

**Files:**
- Modify: `README.md` only if verification reveals an operational correction.

**Interfaces:**
- All services from Tasks 1-4 are complete and no new production interfaces are introduced.

- [ ] **Step 1: Run focused RAG suite**

Run: `npx vitest run tests/embedding-provider.spec.ts tests/vector-store.spec.ts tests/rag-index.service.spec.ts tests/analysis-runner.spec.ts tests/analysis-experiment-service.spec.ts tests/rag-project-sync.spec.ts tests/rag-ui.spec.ts`

Expected: PASS.

- [ ] **Step 2: Run project regression and build**

Run: `npm test`

Expected: report every outcome. Existing test-environment failures are not attributed to this change unless their failure trace touches RAG-modified code.

Run: `npm run build`

Expected: TypeScript check and Vite build exit 0.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Run Docker status verification**

Run: `"C:\Program Files\Docker\Docker\resources\bin\docker.exe" compose ps`

Expected: `qdrant` is running with `127.0.0.1:6333->6333/tcp`.

- [ ] **Step 4: Commit an operational correction only when needed**

Run only if Task 5 changed README: `git add README.md && git commit -m "docs: clarify RAG operations"`
