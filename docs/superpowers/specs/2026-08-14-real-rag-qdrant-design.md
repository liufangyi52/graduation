# Real RAG With Qdrant Design

## Goal

Turn the existing `rag` experiment baseline into a real, auditable retrieval-augmented analysis mode. The system indexes only desensitized meeting-version text, retrieves project-scoped evidence with Qdrant, and supplies that evidence to the existing DeepSeek extraction path.

## Scope

This change adds a local Qdrant deployment, SiliconFlow embeddings, project-scoped indexing, retrieval metadata, a manager index-sync action, and retrieval-source display. It does not add external document sources, reranking, background workers, quality scoring, vector-store administration UI, or a new agent orchestration mode.

## Provider And Deployment

- The embedding provider is SiliconFlow's OpenAI-compatible embeddings endpoint: `POST https://api.siliconflow.cn/v1/embeddings`.
- The default model is `Qwen/Qwen3-Embedding-4B`; all vectors are 2560-dimensional `float` vectors.
- The embedding key is read only from `SILICONFLOW_API_KEY` in the local ignored `.env` file. It is never returned by an API, written to a database, logged, audited, or committed.
- `docker-compose.yml` deploys Qdrant with its REST port bound to `127.0.0.1:6333` and persists data in a named Docker volume. The application uses `QDRANT_URL`, defaulting to `http://127.0.0.1:6333`.

## Data Boundary And Index Model

Only `meeting_versions.desensitized_content` is eligible for chunking, embedding, Qdrant payloads, provider requests, and retrieval display. `meetings.content` and `meeting_versions.original_content` must not reach the RAG components, audit payloads, or test snapshots.

`RagIndexService` chunks the text deterministically into 1200-character windows with a 200-character overlap. Empty chunks are discarded. A SHA-256 hash of project ID, meeting ID, version ID, chunk sequence, and desensitized text creates the stable point ID. Repeated synchronization upserts the same point instead of duplicating it.

Each Qdrant point contains a 2560-dimensional vector and this payload only:

- `projectId`
- `meetingId`
- `versionId`
- `chunkIndex`
- `contentHash`
- `text` (the desensitized chunk)

The collection has cosine distance and an index for `projectId`. Project filtering is mandatory for every search. Point IDs and payloads use no original meeting text, user credentials, API keys, prompts, or model errors.

## Service Boundaries

`EmbeddingProvider` exposes `embed(texts: string[]): Promise<number[][]>`. `SiliconFlowEmbeddingProvider` batches calls to the SiliconFlow endpoint, validates the response count and 2560 dimensions, and surfaces a sanitized service-unavailable error.

`VectorStore` exposes collection initialization, `upsert(points)`, `search(vector, { projectId, excludedVersionId, limit })`, and a health/readiness check. `QdrantVectorStore` implements it with Qdrant REST API calls. Its filter requires `projectId` and excludes the current version ID so the meeting under analysis cannot be retrieved as its own historical context.

`RagIndexService` owns text chunking, point construction, lazy version synchronization, explicit project synchronization, and retrieval. It returns typed evidence `{ meetingId, versionId, chunkIndex, score, text }` plus elapsed retrieval time. The runner only receives evidence obtained from this service.

## Analysis Flow

For `manual`, `llm`, and `agent`, existing behavior is unchanged.

For `rag`:

1. `AppService` authorizes the manager and reads the current version's title, project ID, version ID, and `desensitized_content`.
2. `AnalysisRunner` asks `RagIndexService` to synchronize the current desensitized version and retrieve up to five historical chunks scoped to the same project, excluding that version.
3. The runner calls DeepSeek exactly once, with the current desensitized meeting text and a compact, numbered evidence section derived only from retrieved chunks.
4. Analysis result persistence stores normal generated output plus safe retrieval metadata. Review approval remains unchanged.

The `rag` mode still has exactly one extraction-model call. Embedding calls are recorded separately as retrieval work and are not counted in `modelCallCount`, which remains comparable to the prior four-mode experiments.

## Execution Metadata And Failures

`AnalysisExecutionMetadata` gains:

- `retrievalEnabled: true` and `retrievalStatus: 'completed'` when RAG retrieval succeeds.
- `retrievalDurationMs`, `retrievalHitCount`, and `retrievalSources` for completed retrievals.
- Each retrieval source contains only meeting ID, version ID, chunk index, and numeric score. The generated text is not duplicated into analysis metadata.

`rag` continues as the `not_configured` baseline only when any required RAG configuration is absent: `SILICONFLOW_API_KEY`, `QDRANT_URL`, or `EMBEDDING_MODEL`. The runner performs the normal one-call DeepSeek analysis in that condition and persists `retrievalEnabled=false`, `retrievalStatus='not_configured'`.

When configuration exists but the embedding endpoint, Qdrant endpoint, response validation, or index operation fails, RAG fails closed: it creates a `failed` analysis record with sanitized error text and metadata identifying the failed retrieval state. It never silently drops to a completed no-retrieval run.

No raw provider errors, prompt bodies, API keys, original text, or unbounded retrieved text are stored in execution metadata or audit logs.

## APIs And UI

Add `POST /projects/:id/rag-index/sync`, restricted to that project's manager. It synchronizes all current desensitized meeting versions for the project and returns the number of indexed chunks. Its audit event contains project ID and chunk count only.

Existing analysis and reanalysis endpoints keep accepting `mode: 'rag'`. Review list/detail responses expose safe retrieval metadata. The review detail displays retrieval status, duration, hit count, and a compact list of source meeting/version/chunk/score identifiers. It does not display a separate raw-content copy beyond the existing desensitized meeting evidence view.

The manager experiment view shows whether the selected project RAG index is configured and permits explicit index synchronization. Members, administrators, and auditors do not receive index control or project experiment aggregates.

## Configuration

`.env.example` documents these values without secrets:

```dotenv
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-4B
QDRANT_URL=http://127.0.0.1:6333
```

`docker compose up -d qdrant` starts the local vector store. Application startup must not require Qdrant, because `manual`, `llm`, `agent`, and the unconfigured RAG baseline remain usable without it.

## Tests And Acceptance

Tests prove deterministic chunking and IDs, desensitized-only provider/vector payloads, 2560-dimension validation, project filtering, current-version exclusion, no duplicate upsert for unchanged content, one DeepSeek call for completed RAG, safe metadata persistence, missing-config baseline behavior, configured dependency failure behavior, manager-only synchronization, and UI rendering of safe sources.

Acceptance is met when a manager can start Qdrant, configure a local embedding key, synchronize a project's desensitized meeting versions, run RAG analysis, inspect recorded retrieval status and source identifiers, and compare it to the existing no-retrieval RAG baseline. No test, log, database row, Qdrant payload, or provider request may contain original meeting content.
