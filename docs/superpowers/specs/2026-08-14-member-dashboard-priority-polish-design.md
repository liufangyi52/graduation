# Member Dashboard Priority Polish

## Scope

Polish the member dashboard priority panel without changing task data or permissions.

## Display Rules

- Show each task title only; do not render the internal task UUID below it.
- Format each deadline in Asia/Shanghai as `YYYY-MM-DD HH:mm`.
- Keep the priority panel and notification panel aligned in their dashboard row, with a modest shared minimum height so the row sits closer to the content below.

## Implementation

- Reuse a small date utility for the deadline display instead of rendering the raw API timestamp.
- Apply the changes only to the member dashboard priority table.
- Add focused source-level regression assertions for the three display rules.

## Verification

Run the focused UI test, then run the production build.
