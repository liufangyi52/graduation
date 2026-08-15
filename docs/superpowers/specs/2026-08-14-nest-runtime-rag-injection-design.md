# Nest Runtime RAG Injection Design

## Goal

Ensure the NestJS runtime injects the real analysis, cache, and RAG services into `AppService` when the API is launched through `tsx`.

## Problem

`tsx` does not emit the TypeScript constructor metadata that NestJS normally uses for implicit dependency injection. `AppService` currently relies on implicit constructor types, so its runtime `DeepSeekService`, `AnalysisRunner`, and `RagIndexService` dependencies can be undefined. Read-only project operations still work, but AI analysis and RAG index endpoints cannot use their configured services.

## Design

`AppService` will use explicit Nest `@Inject(...)` parameter decorators for `DeepSeekService`, `RedisCacheService`, `AnalysisRunner`, and `RagIndexService`. The existing default constructor values remain so direct unit tests can continue supplying only the dependencies they exercise. The application module already registers all four providers, so no module or API contract change is required.

## Data Flow

1. Nest resolves `AppService` from `AppModule`.
2. Explicit tokens resolve the configured `DeepSeekService`, `RedisCacheService`, `AnalysisRunner`, and `RagIndexService`.
3. `ragIndexStatus` reports the RAG provider configuration and health accurately.
4. `syncProjectRagIndex` uses the injected provider to index desensitized meeting versions.
5. Existing API routes remain unchanged.

## Error Handling

Missing embedding or Qdrant configuration continues to return the existing `RAG index is not configured` validation error. A configured but unreachable dependency continues to surface its existing service-unavailable behavior. No fallback will falsely report RAG as ready.

## Tests

Add a regression test that creates a Nest testing module with the production providers, resolves `AppService`, and verifies it reports RAG as configured when a configured fake RAG service is supplied. The test must fail before explicit injection and pass after it. Run the focused test and the full Vitest suite.

## Scope

This change does not modify database schema, REST routes, authorization, model prompts, vector payloads, or frontend behavior.
