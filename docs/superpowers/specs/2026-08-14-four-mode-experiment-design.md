# Four-Mode Experiment Design

## Goal

Add four auditable analysis modes and persistent experiment records so the meeting-analysis workflow can support controlled thesis experiments without claiming that vector retrieval already exists.

## Scope

This change extends the existing synchronous meeting analysis and reanalysis paths. It does not add a vector database, document chunking, embeddings, model plug-ins, asynchronous workers, or automatic quality scoring. Redis remains limited to the existing read-cache behavior.

## Analysis Modes

Each analysis request has exactly one of these server-validated modes:

| Mode | Identifier | Behavior | Model calls | Retrieval fields |
| --- | --- | --- | ---: | --- |
| No AI | `manual` | Produces an empty structured draft for human review; never calls DeepSeek. | 0 | `retrievalEnabled=false`, `retrievalStatus=not_applicable` |
| Single-turn LLM | `llm` | Calls DeepSeek once with the current desensitized meeting text. | 1 | `retrievalEnabled=false`, `retrievalStatus=not_applicable` |
| RAG baseline | `rag` | Calls DeepSeek once with the current desensitized meeting text and no retrieved context. | 1 | `retrievalEnabled=false`, `retrievalStatus=not_configured` |
| Agent orchestration baseline | `agent` | Calls DeepSeek once to create a short plan, then once to create the structured analysis from that plan and the desensitized meeting text. | 2 | `retrievalEnabled=false`, `retrievalStatus=not_applicable` |

The `rag` label represents a controlled baseline only. Its persisted metadata and user-visible label must say that retrieval is not configured. The result must never imply that a vector store, embeddings, or external knowledge was used.

## Backend Design

Create a small analysis-runner boundary that receives `{ mode, title, desensitizedContent }` and returns the existing `MeetingAnalysis` result plus immutable execution metadata. The runner owns mode dispatch; `AppService` remains responsible for authorization, database persistence, audit logging, and review workflow.

`DeepSeekService` retains the provider-specific HTTP logic. It gains a planning call for `agent` mode and a context-aware analysis call. The latter is used only by agent orchestration to include its generated plan. No production call path may send `meetings.content` to the model or include it in an audit payload.

The current `POST /meetings/:id/analyze` and `POST /analyses/:id/reanalyze` endpoints accept a request body with `mode`. Omitted mode defaults to `llm` for compatibility. The server rejects unknown values. Reanalysis preserves the link to the rejected source analysis and records the newly selected mode independently.

## Persistence And Reporting

Extend `ai_analyses` with the following fields, added through idempotent migrations:

- `mode VARCHAR(20) NOT NULL DEFAULT 'llm'`
- `execution_metadata JSON NULL`
- `started_at DATETIME NULL`
- `finished_at DATETIME NULL`
- `duration_ms INT UNSIGNED NULL`
- `model_call_count TINYINT UNSIGNED NOT NULL DEFAULT 0`

`execution_metadata` stores `mode`, `model`, `retrievalEnabled`, `retrievalStatus`, and, for agent mode, the generated plan. It never stores original meeting content, API keys, or prompts containing original meeting content. `result_json` remains the immutable generated output consumed by the existing review-draft and approval flow.

Persist a record before running the selected mode. On success, save the normalized result, metadata, finish time, duration, call count, and existing `pending` review status. On failure, save finish time, duration when known, error message, and `failed` status. Both success and failure create audit events with mode, model-call count, duration, and retrieval state only.

The analysis list and review-detail responses expose the mode and safe metadata. Add a manager-facing experiment summary endpoint that aggregates analyses accessible to that manager by mode: run count, succeeded/pending/failed count, approved/rejected count, total and average duration, and total model calls. It is descriptive data for manual thesis evaluation; it does not infer precision, recall, or quality scores.

## Frontend Design

The meeting submission view exposes a four-option select control, defaulting to Single-turn LLM. The request body sends the selected identifier. The review list and review detail display the recorded mode, model-call count, duration, and retrieval state. RAG baseline is visibly marked as "检索未配置".

Managers can open an experiment summary view grouped by the four modes. The view uses existing table and metric patterns; it does not add a new dashboard framework. Only managers see project experiment summaries. Members retain access to their permitted meeting and task views but do not receive experiment aggregates. Administrators and auditors keep their established role boundaries.

## Error Handling And Compatibility

Manual mode succeeds without a DeepSeek API key. LLM, RAG baseline, and agent mode surface the existing provider failure as a failed analysis record, so the user can inspect and re-run it. Existing analysis rows load as `llm` when their mode is null or absent. Existing review operations continue to accept only `pending` analyses.

## Tests And Acceptance

Tests cover mode validation; the zero/one/two call behavior; RAG metadata; agent-plan handoff; result normalization; persistence of timing, model calls, and failure state; privacy of desensitized input; analysis/reanalysis authorization; and aggregate experiment metrics. Existing review, task creation, and reanalysis tests remain green.

Acceptance is met when a manager can run each mode against the same meeting, review only successful structured results, and compare persisted execution metrics by mode. The RAG baseline must display and persist `retrievalStatus=not_configured`; no claim of actual retrieval is acceptable until a separate RAG/vector-store change is implemented.
