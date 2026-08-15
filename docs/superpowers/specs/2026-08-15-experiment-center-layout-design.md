# Experiment Center Layout Design

## Goal

Make the experiment center's project selector, RAG control, summary metrics, and results table read as one compact full-width workflow without unused space on wide screens or overlapping content near the table.

## Selected Design

Keep the existing API calls, data, controls, and permissions unchanged. Scope the layout changes to the experiment panel:

- Use a two-column header on desktop: a fixed-width title block and a project selector that fills the remaining width.
- Place the RAG synchronization command and readiness message in a dedicated full-width status row with padding and a bottom divider.
- Render the two existing metrics in an experiment-specific two-column grid so they share the usable panel width rather than inheriting the dashboard's five-column metric grid.
- Keep the table as the final full-width section. The experiment body provides consistent horizontal padding and vertical spacing between each row.
- At narrow widths, stack the header and metrics while retaining an accessible horizontal scroll area for the table.

No new cards, actions, API requests, or experiment data will be added.

## Verification

Add a source-level UI regression test for the scoped experiment layout classes and responsive rules. Run the focused test suite and the production build.
