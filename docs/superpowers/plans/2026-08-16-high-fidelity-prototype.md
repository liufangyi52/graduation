# High-Fidelity Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce ten 1440 x 900 high-fidelity static prototype PNGs and one combined PDF for the intelligent meeting-minutes task tracking system.

**Architecture:** Build an isolated browser-rendered prototype gallery under `prototype/` rather than changing the production Vue application. The gallery receives a `screen` query parameter, renders one named high-fidelity page from shared sample data and component styles, then Chrome headless captures each page at the fixed desktop viewport. A small TypeScript exporter coordinates the local Vite server, PNG captures, and a PDF assembled from the captured screens.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Vite, Chrome headless, Node.js/TypeScript, jsPDF.

## Global Constraints

- Output dimensions are exactly 1440 x 900 px for every PNG.
- Produce ten single-page PNGs and one PDF in `docs/prototypes/`.
- Preserve the existing Vue application, routes, API clients, and test suite; the prototype lives entirely under `prototype/` and `scripts/`.
- Use the documented visual tokens: `#F4F6F8` canvas, `#155EEF` primary, `#172B4D` primary text, `#667085` secondary text, `#FFFFFF` panels, and `#E4E7EC` borders.
- Cover project manager, project member, system administrator, and auditor flows in the screen order defined by the approved design.
- Use fictional project data only; do not include real personal data, API keys, or external dependencies.

---

## File Structure

- Create: `prototype/index.html` — screen shell, shared navigation, page containers, and screen-specific sample content.
- Create: `prototype/prototype.css` — visual tokens, shell layout, charts, tables, forms, board cards, and print-safe styles.
- Create: `prototype/prototype.js` — reads `screen` query parameter, selects the matching page, updates title/navigation, and toggles the notification drawer.
- Create: `scripts/verify-prototype-gallery.ts` — validates that all screen identifiers, shared layout selectors, and output filenames exist before export.
- Create: `scripts/export-prototype.ts` — launches a local Vite preview, captures the ten fixed-size PNGs through Chrome headless, and builds the combined PDF with jsPDF.
- Modify: `package.json` — add `prototype:verify` and `prototype:export` scripts only.
- Create: `docs/prototypes/README.md` — lists each output file, its associated role/page, and the regeneration command.
- Create: `docs/prototypes/01-dashboard.png` through `docs/prototypes/10-audit-log.png` — final raster prototype screens.
- Create: `docs/prototypes/meeting-task-system-high-fidelity-prototype.pdf` — assembled presentation PDF.

### Task 1: Build the Gallery Shell and Verification Contract

**Files:**
- Create: `prototype/index.html`
- Create: `prototype/prototype.css`
- Create: `prototype/prototype.js`
- Create: `scripts/verify-prototype-gallery.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `?screen=<screen-id>` in the gallery URL.
- Produces: ten `<section class="prototype-screen" data-screen="...">` elements using the IDs `dashboard`, `project-detail`, `meeting-import`, `ai-review`, `task-board`, `risk-center`, `my-tasks`, `task-feedback`, `settings`, and `audit-log`.
- Produces: `npm run prototype:verify`, which exits zero only when the shell has all ten IDs and the CSS defines `.app-shell`, `.sidebar`, `.topbar`, and `.prototype-screen`.

- [ ] **Step 1: Write the failing gallery contract test**

Create `scripts/verify-prototype-gallery.ts` with this required check list:

```ts
const screenIds = [
  'dashboard', 'project-detail', 'meeting-import', 'ai-review', 'task-board',
  'risk-center', 'my-tasks', 'task-feedback', 'settings', 'audit-log',
]
const requiredSelectors = ['.app-shell', '.sidebar', '.topbar', '.prototype-screen']
```

The script must read `prototype/index.html` and `prototype/prototype.css`, collect missing strings, and throw `Error('Prototype gallery contract failed: ...')` when any required value is missing.

- [ ] **Step 2: Run the verifier to confirm it fails**

Run: `npx tsx scripts/verify-prototype-gallery.ts`

Expected: non-zero exit with `ENOENT` or `Prototype gallery contract failed` because the gallery files do not yet exist.

- [ ] **Step 3: Implement the minimal shared gallery**

Create the three gallery files with a 232px sidebar, 64px topbar, one `data-screen` section per ID, and shared role-aware navigation. In `prototype.js`, hide all sections except the query-selected screen, defaulting to `dashboard`.

Add package scripts:

```json
"prototype:verify": "tsx scripts/verify-prototype-gallery.ts",
"prototype:export": "tsx scripts/export-prototype.ts"
```

- [ ] **Step 4: Run the verifier to confirm it passes**

Run: `npm run prototype:verify`

Expected: exit zero and `Prototype gallery contract passed for 10 screens.`

- [ ] **Step 5: Commit the gallery shell**

```bash
git add prototype/index.html prototype/prototype.css prototype/prototype.js scripts/verify-prototype-gallery.ts package.json
git commit -m "feat: add prototype gallery shell"
```

### Task 2: Compose Project-Manager Workflow Screens

**Files:**
- Modify: `prototype/index.html`
- Modify: `prototype/prototype.css`
- Test: `scripts/verify-prototype-gallery.ts`

**Interfaces:**
- Consumes: gallery screen IDs defined in Task 1.
- Produces: populated `dashboard`, `project-detail`, `meeting-import`, `ai-review`, `task-board`, and `risk-center` sections.
- Produces: source evidence markup using `.evidence-highlight`, visible only in the AI review screen.

- [ ] **Step 1: Extend the verifier with manager-screen landmarks**

Require these strings in `prototype/index.html`:

```ts
const managerLandmarks = [
  '待审核会议', '项目甘特图', '提交 AI 分析', '候选任务', '待处理', '风险详情',
]
```

The verifier must throw when any landmark is absent.

- [ ] **Step 2: Run the verifier to confirm it fails**

Run: `npm run prototype:verify`

Expected: non-zero exit identifying the missing manager-screen landmarks.

- [ ] **Step 3: Implement the six manager screens**

Populate the manager sections with the approved structure:

- dashboard: four metrics, meeting-review queue, completion trend, deadline/risk list, and project table;
- project detail: header facts, five tabs, task distribution, Gantt timeline, and activity list;
- meeting import: metadata form, upload drop zone, meeting-text preview, desensitization toggle, and primary submission;
- AI review: three columns for source text, summaries/decisions, and editable candidate tasks; use pale-blue evidence highlights;
- task board: complete filter rail plus the four lifecycle columns;
- risk center: risk summary, filterable list, and an open detail drawer with evidence and disposition timeline.

Use a consistent fictional project named `智能会议任务平台` and sample date range `2026-08-01` through `2026-09-30`.

- [ ] **Step 4: Run the verifier and build the isolated page**

Run: `npm run prototype:verify`

Run: `npm run build`

Expected: the verifier exits zero; the existing Vue build continues to exit zero because production files have not changed.

- [ ] **Step 5: Commit the manager workflow screens**

```bash
git add prototype/index.html prototype/prototype.css scripts/verify-prototype-gallery.ts
git commit -m "feat: add manager workflow prototype screens"
```

### Task 3: Compose Role-Specific Screens and Global States

**Files:**
- Modify: `prototype/index.html`
- Modify: `prototype/prototype.css`
- Modify: `prototype/prototype.js`
- Test: `scripts/verify-prototype-gallery.ts`

**Interfaces:**
- Consumes: `my-tasks`, `task-feedback`, `settings`, and `audit-log` screen IDs from Task 1.
- Produces: page-specific role chips, account context, notification drawer, one loading example, one empty-state example, and one retry-error example.

- [ ] **Step 1: Extend the verifier with role and state landmarks**

Require these strings in `prototype/index.html`:

```ts
const roleLandmarks = [
  '我的任务', '提交反馈', 'AI 服务配置', '操作前快照', '暂无通知', '重新加载',
]
```

- [ ] **Step 2: Run the verifier to confirm it fails**

Run: `npm run prototype:verify`

Expected: non-zero exit identifying missing role/state landmarks.

- [ ] **Step 3: Implement the four role screens and global states**

Populate the remaining screens with:

- member my-tasks: personal metric row, overdue-prioritized task list, status/progress controls, and a compact empty-state example;
- member feedback: task context, a progress stepper, issue-category selector, feedback text field, submit action, and a historical timeline;
- administrator settings: settings subnavigation, model provider cards, simulated/real service segmented control, desensitization rules, and metric configuration;
- auditor log: multi-field filters, compact log table, a selected event, and a change-snapshot detail drawer.

Implement a non-modal notification drawer which is toggled from the bell button. It should include notifications and the `暂无通知` empty state in a secondary tab. Place the loading skeleton on the dashboard’s lower project-list row and a `重新加载` error panel in the meeting import source preview.

- [ ] **Step 4: Run verification and production build**

Run: `npm run prototype:verify`

Run: `npm run build`

Expected: both commands exit zero.

- [ ] **Step 5: Commit the role screens**

```bash
git add prototype/index.html prototype/prototype.css prototype/prototype.js scripts/verify-prototype-gallery.ts
git commit -m "feat: add role based prototype screens"
```

### Task 4: Capture PNGs, Assemble PDF, and Perform Visual QA

**Files:**
- Create: `scripts/export-prototype.ts`
- Create: `docs/prototypes/README.md`
- Create: `docs/prototypes/01-dashboard.png`
- Create: `docs/prototypes/02-project-detail.png`
- Create: `docs/prototypes/03-meeting-import.png`
- Create: `docs/prototypes/04-ai-review.png`
- Create: `docs/prototypes/05-task-board.png`
- Create: `docs/prototypes/06-risk-center.png`
- Create: `docs/prototypes/07-my-tasks.png`
- Create: `docs/prototypes/08-task-feedback.png`
- Create: `docs/prototypes/09-settings.png`
- Create: `docs/prototypes/10-audit-log.png`
- Create: `docs/prototypes/meeting-task-system-high-fidelity-prototype.pdf`

**Interfaces:**
- Consumes: `?screen=<id>` routes from Task 1 and the fixed ten-screen list.
- Produces: exact 1440 x 900 PNGs, a title-cover followed by ordered 16:10 PDF pages, and a documented regeneration command.

- [ ] **Step 1: Write the failing output manifest verification**

Extend `scripts/verify-prototype-gallery.ts` so that, when invoked with `--outputs`, it checks these names under `docs/prototypes/`:

```ts
const outputFiles = [
  '01-dashboard.png', '02-project-detail.png', '03-meeting-import.png',
  '04-ai-review.png', '05-task-board.png', '06-risk-center.png',
  '07-my-tasks.png', '08-task-feedback.png', '09-settings.png', '10-audit-log.png',
  'meeting-task-system-high-fidelity-prototype.pdf',
]
```

- [ ] **Step 2: Run the output verifier to confirm it fails**

Run: `npm run prototype:verify -- --outputs`

Expected: non-zero exit identifying absent prototype output files.

- [ ] **Step 3: Implement deterministic export**

In `scripts/export-prototype.ts`, start `vite --host 127.0.0.1 --port 4173`, then invoke `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe` in headless mode for each screen URL with `--window-size=1440,900`, `--force-device-scale-factor=1`, and `--screenshot=<absolute-output-path>`. Wait for the target URL before every capture. Build the PDF from the generated PNGs using jsPDF in landscape format with 16:10 page geometry.

Write `docs/prototypes/README.md` with the screen list, role mapping, fixed resolution, and `npm run prototype:export` regeneration command.

- [ ] **Step 4: Export and verify artefacts**

Run: `npm run prototype:export`

Run: `npm run prototype:verify -- --outputs`

Expected: all eleven artifact files exist and the verifier exits zero.

- [ ] **Step 5: Visually inspect desktop outputs**

Open the ten PNGs at native dimensions and inspect each for clipped text, overlaps, blank regions, inconsistent shell dimensions, unreadable table rows, and missing semantic color contrast. Render the PDF to images and compare its first, fourth, seventh, and tenth page to the corresponding PNGs.

Expected: all screens show a populated 1440 x 900 desktop layout, the PDF cover identifies the project/version/date, and all following PDF pages preserve the PNG framing without crops.

- [ ] **Step 6: Commit final prototype artifacts**

```bash
git add prototype scripts/verify-prototype-gallery.ts scripts/export-prototype.ts package.json docs/prototypes
git commit -m "docs: add high fidelity prototype artifacts"
```

## Plan Self-Review

### Spec Coverage

- Ten PNGs and one merged PDF: Task 4.
- Exact 1440 x 900 desktop frame: global constraints and Task 4 capture command.
- Visual tokens, navigation shell, and compact enterprise layout: Task 1 and Task 2.
- Six project-manager pages: Task 2.
- Member, administrator, and auditor pages: Task 3.
- Notification, empty, loading, and retry states: Task 3.
- No production business-code modifications: global constraints and Task 2 build verification.

### Placeholder Scan

No placeholder markers, deferred implementation language, or unspecified file paths are present.

### Interface Consistency

Task 1 establishes the exact screen IDs. Tasks 2 and 3 populate those IDs, and Task 4 captures those same query-parameter values in the approved display order.
