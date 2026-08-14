# System Settings Centered Layout Design

## Goal

Move the system settings panel from the left edge of the main content area to a visually balanced, centered position.

## Scope

Only the settings-page layout is changed. The page header, form controls, settings data, actions, and other application pages remain unchanged.

## Layout

- The settings page keeps its existing single-panel presentation.
- On desktop, the panel is horizontally centered within the `.page-section` content region, rather than the full browser viewport or the space including the sidebar.
- The panel retains a capped readable width of `654px` and may shrink to the available content width.
- The section uses a one-column grid/flex layout so no unused navigation column influences the card position.
- At narrow widths, the panel is `width: 100%` within the standard content padding, preventing horizontal overflow or compressed controls.

## Implementation

Update the existing `.settings-layout` CSS in `src/style.css` to center its only child while retaining `max-width: 654px` on the layout wrapper. No Vue template or API changes are required.

## Verification

- Add a UI source-level regression test that asserts the settings layout has a centered horizontal margin and a responsive full-width constraint.
- Run the focused test and the production build.
