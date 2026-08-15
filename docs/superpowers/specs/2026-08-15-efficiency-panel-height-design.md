# Efficiency Panel Height Adjustment Design

## Goal

Increase the desktop height of the project-manager efficiency trend and member-delivery panels from the current 460px cap to 550px, reducing the unused page area below the panels.

## Selected Design

Change only `.efficiency-page .efficiency-panel` in `src/style.css` from `height: min(460px, 52vh)` to `height: min(550px, 60vh)`.

The existing 360px minimum height remains in place. The trend and member list retain their internal vertical scrolling, so the shorter panel does not hide trend points or member records. The existing 1180px one-column layout and all task-data calculations remain unchanged.

## Verification

Update the layout regression assertion to protect the 550px cap, run the focused efficiency UI test, then run the production build.
