# Notification Detail Modal Design

## Goal

Allow users to read a notification in full without leaving the notification
center.

## Behavior

- Clicking a notification card opens a modal on the current page.
- The modal displays the notification title, full body, creation time, and
  read status.
- Opening an unread notification marks it as read through the existing
  `PATCH /api/notifications/:id/read` endpoint and immediately updates the
  in-memory notification state and unread badge.
- Clicking a notification never navigates to its stored `link`; notification
  links remain persisted for backwards compatibility but are not used by the
  notification-center interaction.
- The modal closes through the close icon, the Close button, or clicking the
  backdrop, matching existing modal behavior.

## Data And UI

`createWorkspaceService` will preserve the API `body` field when mapping
notifications. `App.vue` will hold the selected notification and render it in
the existing shared modal pattern. The modal is read-only and uses no new API
endpoint or route.

## Error Handling

If marking the notification as read fails, the modal does not open and the
existing page notice reports the failure. Already-read notifications open
without sending another read request.

## Verification

Add focused source-level UI tests that assert notification bodies are mapped,
selection opens a modal instead of navigating, and the modal renders the four
required fields. Run the focused test, the full test suite, and the production
build.
