# Production MeetingFlow Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Deliver a deployable MeetingFlow system with real DeepSeek/OpenAI analysis, mandatory review, durable workflows, RAG-ready architecture, exports and reproducible ablation metrics.

**Architecture:** Restore the root monorepo and retain the nested prototype as read-only migration reference. NestJS owns persistence, RBAC, queues, exports and orchestration. FastAPI owns provider-neutral AI processing. Vue consumes documented REST APIs. MySQL stores business facts; Redis supplies caching and queues; Qdrant is accessed only through an adapter.

**Tech Stack:** Vue 3, Vite, TypeScript, NestJS, TypeORM, MySQL 8, Redis 7, BullMQ, FastAPI, Pydantic, httpx, Qdrant, Docker Compose, Vitest, pytest.

## Global Constraints

- Work in isolated codex/production-meetingflow worktree; never overwrite the nested prototype.
- AI drafts never create formal tasks before a manager approves them.
- Real provider calls require configured credentials; unit tests use deterministic fakes and no secret.
- Lists return items,total,page,pageSize; all mutations create immutable audit records.
- External failures use queued,running,retrying,failed,pending_review; approval creates formal tasks transactionally.
- Add production code only after its focused test has failed.

---

### Task 1: Restore and isolate the monorepo

**Files:**
- Restore .env.example, .gitignore, README.md, docker-compose.yml, apps/**, docs/*.md, package.json and package-lock.json.
- Preserve stitch_intelligent_meeting_task_system/**.

**Produces:** A clean versioned root monorepo on codex/production-meetingflow.

- [ ] **Step 1: Create an isolated worktree and branch**

    git worktree add .worktrees/production-meetingflow -b codex/production-meetingflow HEAD

- [ ] **Step 2: Restore only tracked application paths in the new worktree**

    git restore --source=HEAD -- .env.example .gitignore README.md docker-compose.yml apps docs package.json package-lock.json

- [ ] **Step 3: Verify restoration does not affect the nested prototype**

    git status --short
    git -C ..\..\ status --short -- stitch_intelligent_meeting_task_system

- [ ] **Step 4: Commit only restored paths**

    git add .env.example .gitignore README.md docker-compose.yml apps docs package.json package-lock.json
    git commit -m "chore: restore meetingflow monorepo baseline"

### Task 2: Add typed configuration, persistence, RBAC and audit trail

**Files:**
- Create apps/api/src/config/env.ts, apps/api/src/database/data-source.ts, apps/api/src/database/entities/*.entity.ts, apps/api/src/auth/policy.ts, apps/api/src/audit/audit.service.ts.
- Test apps/api/test/config/env.spec.ts and apps/api/test/auth/rbac.spec.ts.
- Modify apps/api/src/app.module.ts, apps/api/src/main.ts, apps/api/package.json, .env.example and docker-compose.yml.

**Consumes:** MySQL and Redis variables from Docker Compose.
**Produces:** loadEnv(), can(role,action), and durable User/Project/Meeting/Task/Risk/Analysis/Audit entities.

- [ ] **Step 1: Write failing tests**

    it('rejects production startup without JWT_SECRET', () => {
      expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow('JWT_SECRET');
    });
    it('allows only managers to approve analysis', () => {
      expect(can('member', 'analysis:approve')).toBe(false);
      expect(can('manager', 'analysis:approve')).toBe(true);
    });

- [ ] **Step 2: Verify RED**

    npm --workspace apps/api test -- config/env.spec.ts auth/rbac.spec.ts

Expected: fails because loadEnv and policy are absent.

- [ ] **Step 3: Implement minimal configuration, policy, TypeORM entities, migrations, guards and append-only audit service**

    export function loadEnv(source = process.env): AppEnv {
      if (source.NODE_ENV === 'production' && !source.JWT_SECRET) throw new Error('JWT_SECRET is required');
      return { dbHost: source.DB_HOST ?? 'mysql', redisUrl: source.REDIS_URL ?? 'redis://redis:6379', jwtSecret: source.JWT_SECRET ?? 'development-only-secret' };
    }
    export const can = (role: Role, action: Action) => policy[role].includes(action);

- [ ] **Step 4: Verify GREEN and commit**

    npm --workspace apps/api test
    git add apps/api .env.example docker-compose.yml
    git commit -m "feat: add durable api foundation"

### Task 3: Implement the review-gated workflow and real model providers

**Files:**
- Create apps/api/src/meetings/*.ts, apps/api/test/meetings/review.spec.ts, apps/ai/app/providers/base.py, apps/ai/app/providers/deepseek.py, apps/ai/app/providers/openai.py, apps/ai/app/analysis.py, apps/ai/tests/test_analysis.py.
- Modify apps/api/src/app.module.ts, apps/ai/app/main.py, apps/ai/requirements.txt and docs/api.md.

**Consumes:** Task 2 entities and RBAC.
**Produces:** Meeting creation, AI draft, review approval/rejection and formal task transaction; ProviderAdapter.analyze(request) to AnalysisDraft.

- [ ] **Step 1: Write failing workflow and adapter tests**

    it('creates formal tasks only after manager approval', async () => {
      const analysis = await fixture.pendingAnalysis({ tasks: [{ title: '发布清单', assigneeEmail: 'a@example.com' }] });
      await expect(service.review(member, analysis.id, { approved: true })).rejects.toThrow('forbidden');
      await service.review(manager, analysis.id, { approved: true });
      expect(await fixture.formalTaskTitles()).toEqual(['发布清单']);
    });

    def test_provider_output_becomes_reviewable_draft():
        result = analyze_with(FakeProvider('{"summary":"s","decisions":[],"tasks":[],"risks":[]}'), request())
        assert result.status == "pending_review"
        assert result.model == "fake-model"

- [ ] **Step 2: Verify RED**

    npm --workspace apps/api test -- meetings/review.spec.ts
    pytest apps/ai/tests/test_analysis.py -q

- [ ] **Step 3: Implement provider adapter and approval transaction**

    class ProviderAdapter(Protocol):
        async def analyze(self, request: AnalysisRequest) -> AnalysisDraft: ...

    await this.dataSource.transaction(async manager => {
      await manager.update(Analysis, id, { status: 'approved', reviewedById: actor.id });
      await manager.save(Task, approvedCandidates.map(candidate => toFormalTask(candidate, project)));
      await this.audit.record({ actorId: actor.id, action: 'analysis.approved', entityType: 'analysis', entityId: id });
    });

- [ ] **Step 4: Verify GREEN and commit**

    npm --workspace apps/api test
    pytest apps/ai/tests -q
    git add apps/api apps/ai docs/api.md
    git commit -m "feat: add real review-gated analysis"

### Task 4: Add privacy, business rules, queues, retries and RAG

**Files:**
- Create apps/ai/app/privacy.py, apps/ai/app/rules.py, apps/ai/app/vector/base.py, apps/ai/app/vector/qdrant.py, apps/ai/app/retrieval.py, apps/api/src/queue/*.ts, apps/api/src/cache/cache.service.ts.
- Test apps/ai/tests/test_privacy.py, apps/ai/tests/test_rules.py, apps/ai/tests/test_retrieval.py and apps/api/test/queue/retry.spec.ts.

**Consumes:** Provider contract from Task 3.
**Produces:** Redacted AI input, evidence trace, project-scoped retrieval and reliable job lifecycle.

- [ ] **Step 1: Write failing privacy, rules, retrieval and retry tests**

    def test_redact_replaces_email_and_phone():
        result = redact("13800138000 a@example.com")
        assert "13800138000" not in result.text and "a@example.com" not in result.text

    def test_rag_includes_project_scoped_source():
        assert run_rag(FakeVectorStore([chunk("plan-v2", 0.91)]), FakeProvider(), request()).citations[0].source_version == "plan-v2"

    it('retries a retryable provider failure at most three times', async () => {
      await processor.process(jobFailingWith(503));
      expect(await analysis.status()).toBe('retrying');
      expect(job.opts.attempts).toBe(3);
    });

- [ ] **Step 2: Verify RED**

    pytest apps/ai/tests/test_privacy.py apps/ai/tests/test_rules.py apps/ai/tests/test_retrieval.py -q
    npm --workspace apps/api test -- queue/retry.spec.ts

- [ ] **Step 3: Implement regex redaction, business validation, Qdrant filter and BullMQ retries**

    PHONE = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
    return RedactionResult(text=PHONE.sub("[PHONE]", text), replacements={"phone": len(PHONE.findall(text))})

    await this.analysisQueue.add('analyze', { analysisId }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });

- [ ] **Step 4: Persist trace steps and ensure failed analysis creates no formal task**

- [ ] **Step 5: Verify GREEN and commit**

    pytest apps/ai/tests -q
    npm --workspace apps/api test
    git add apps/api apps/ai docker-compose.yml
    git commit -m "feat: add reliable rag analysis pipeline"

### Task 5: Implement live analytics, CSV export and ablation experiments

**Files:**
- Create apps/api/src/analytics/*.ts, apps/api/src/exports/*.ts, apps/api/src/evaluations/*.ts, apps/api/test/analytics/metrics.spec.ts, apps/api/test/exports/csv.spec.ts, apps/api/test/evaluations/runner.spec.ts and docs/evaluation.md.
- Modify apps/api/src/app.module.ts and docs/api.md.

**Consumes:** Durable workflow records from Tasks 2-4.
**Produces:** Live metrics, trace retrieval, role-scoped CSV export and four-mode evaluation runs.

- [ ] **Step 1: Write failing aggregate, export and evaluation tests**

    it('exports only tasks visible to the requester', async () => {
      const csv = await requestAs(member).get('/api/projects/p1/export.csv');
      expect(csv.text).toContain('mine');
      expect(csv.text).not.toContain('restricted');
    });
    it.each(['manual_baseline', 'single_llm', 'rag', 'agentic'])('records metrics for %s', async mode => {
      const run = await runner.run({ datasetId: fixture.dataset.id, mode });
      expect(run.metrics.sampleCount).toBeGreaterThan(0);
    });

- [ ] **Step 2: Verify RED**

    npm --workspace apps/api test -- analytics/metrics.spec.ts exports/csv.spec.ts evaluations/runner.spec.ts

- [ ] **Step 3: Implement metrics, CSV and deterministic comparison modes**

    const modes: Record<EvaluationMode, RunConfig> = {
      manual_baseline: { provider: false, retrieval: false, rules: false },
      single_llm: { provider: true, retrieval: false, rules: false },
      rag: { provider: true, retrieval: true, rules: false },
      agentic: { provider: true, retrieval: true, rules: true },
    };

- [ ] **Step 4: Audit exports and expose analysis trace/evaluation endpoints**

- [ ] **Step 5: Verify GREEN and commit**

    npm --workspace apps/api test
    git add apps/api docs
    git commit -m "feat: add analytics exports and evaluations"

### Task 6: Connect Vue views, document task packages and prove acceptance

**Files:**
- Create apps/web/src/services/*.ts, apps/web/src/views/MeetingReviewView.vue, apps/web/src/views/ExperimentView.vue, apps/web/src/views/AnalyticsView.vue, apps/web/src/views/ExportView.vue, docs/task-packages/*.md, docs/acceptance.md and scripts/verify-e2e.ps1.
- Modify apps/web/src/App.vue, apps/web/src/api.ts, apps/web/src/router.ts, apps/web/src/style.css, README.md, docs/deployment.md and docs/development.md.
- Test apps/web/src/services/analysisClient.spec.ts.

**Consumes:** API contracts from Tasks 3-5.
**Produces:** Data-backed review/retry/trace/export/evaluation views, task packages and executable end-to-end acceptance.

- [ ] **Step 1: Write failing typed-client test**

    it('maps a paginated pending-review response', async () => {
      const client = createAnalysisClient(fakeFetch({ items: [{ id: 'a1', status: 'pending_review' }], total: 1, page: 1, pageSize: 20 }));
      expect((await client.list()).items[0].status).toBe('pending_review');
    });

- [ ] **Step 2: Verify RED**

    npm --workspace apps/web test -- analysisClient.spec.ts

- [ ] **Step 3: Implement typed clients and live UI actions**

    export async function listAnalyses(query: PageQuery): Promise<Page<Analysis>> {
      return request('/analyses?' + new URLSearchParams(pageQuery(query)));
    }

Implement review, retry, trace, CSV download and evaluation actions with explicit loading and error states.

- [ ] **Step 4: Add task package documents**

Each document lists input, output, endpoint fields, permission rules, exceptional states and frontend integration for meeting ingestion, review, task tracking, risk, export and evaluation.

- [ ] **Step 5: Verify build and full closed loop**

    npm --workspace apps/web test
    npm --workspace apps/web run build
    docker compose up -d --build
    npm test
    pytest apps/ai/tests -q
    powershell -ExecutionPolicy Bypass -File scripts/verify-e2e.ps1

The E2E script creates a manager session, project, meeting, analysis, approval, task feedback, analytics request and CSV export. It forces one retryable provider failure and confirms no task existed before manager approval.

- [ ] **Step 6: Commit**

    git add apps/web docs scripts README.md
    git commit -m "feat: deliver production meetingflow experience"

## Plan Self-Review

- Coverage: Tasks 1-3 restore the durable real-model review-gated core; Task 4 delivers privacy, queues and RAG; Task 5 delivers metrics, exports and ablation; Task 6 removes static UI substitutions and proves deployment and acceptance.
- Placeholder scan: every task identifies files, tests, commands and interfaces.
- Type consistency: analysis lifecycle names and the review-required task transition remain identical in all tasks.

