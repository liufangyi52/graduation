# System Label Localization Design

## Goal

Present project-management classifications as consistent Chinese semantic tags throughout the application. Labels must make status, priority, risk, review state, and personnel roles distinguishable at a glance without altering stored or transported enum values.

## Scope

The change covers every current frontend surface that displays project state, task state or priority, risk level or resolution state, AI analysis state, system role, or project role. It includes dashboard, project list and detail, task board, risk center, review queue and detail, user administration, and member information.

It excludes form option values, API payloads, database records, filter query values, authorization checks, and server code. These continue to use their existing English enum values.

## Shared Label Dictionary

Create a frontend-only labeling module that accepts raw strings and returns a Chinese label plus one existing tag tone. Each renderer uses this module instead of outputting raw values or embedding per-page ternaries.

| Category | Raw values | Chinese labels | Tag tones |
| --- | --- | --- | --- |
| Project state | `active`, `paused`, `archived` | 进行中, 已暂停, 已归档 | blue, amber, gray |
| Task state | `to` + `do`, `in_progress`/`in-progress`, `completed`, `closed` | 待开始, 进行中, 已完成, 已关闭 | gray, blue, green, gray |
| Task priority | `low`, `medium`, `high`, `urgent` | 低, 中, 高, 紧急 | gray, blue, amber, red |
| Risk level | `low`, `medium`, `high` | 低风险, 中风险, 高风险 | green, amber, red |
| Risk state | `open`, `pending`, `in_progress`, `resolved` and existing Chinese values | 待处理, 跟进中, 已处理 | amber, blue, green |
| AI analysis | `pending`, `approved`, `rejected` | 待审核, 已通过, 已驳回 | amber, green, red |
| System role | `manager`, `member`, `admin`, `auditor` | 项目经理, 项目成员, 系统管理员, 审计人员 | blue, gray, purple, purple |
| Project role | `manager`, `member` | 项目经理, 项目成员 | blue, gray |

Unknown, null, or newly introduced values render their original text when available and use the neutral `gray` tone. This prevents missing tags from concealing unexpected data.

## UI Rules

All classification values use the existing `tag` component class with the tone returned by the dictionary. Add a purple semantic tag variant for administration and auditing roles. Plain text remains appropriate for names, dates, titles, and descriptions; the change does not turn every table cell into a tag.

Where a value is already Chinese in client state, the dictionary normalizes it to the same Chinese label and tone. This preserves display consistency while the API migration remains out of scope.

## Testing

Add unit tests for raw-value normalization, Chinese labels, tones, and unknown-value fallback. Extend page-level source tests to ensure project detail, task board, review detail, and main application render classification tags through the shared dictionary. Run the full existing test suite and production build.
