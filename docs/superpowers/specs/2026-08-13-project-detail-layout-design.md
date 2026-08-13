# Project Detail Layout Design

## Goal

Improve the first-screen readability of the project detail page on desktop while keeping the same project data, tab routes, and available actions. Narrow screens must remain usable without compressed or overlapping content.

## Scope

The change applies only to `src/components/ProjectDetailPage.vue` and the associated styles in `src/style.css`. It does not change API contracts, project permissions, tab destinations, or project data.

## Desktop Layout

The page uses three explicit visual bands:

1. A compact project summary header. The title, project code, owner, member count, status, and edit action share the primary row. Secondary facts use a concise summary strip rather than a two-by-two block below the title.
2. A dedicated tab navigation row with clear separation from the header and selected-state affordance.
3. An overview content area. The description remains in its own content block, and the task, completion, and open-risk counts use short, equal-height metric cards for scanning.

The summary header uses a two-column desktop grid: project identity grows naturally on the left, and progress, deadline, and review information form a fixed-width summary on the right. The main content is constrained by the existing application canvas rather than introducing a new page shell.

## Responsive Behavior

At narrow desktop and tablet widths, the summary header changes from two columns to one column. On small screens, the metrics use one or two columns according to available width; tab navigation remains accessible through horizontal scrolling. No text may overlap, and long project names or descriptions must wrap within their containers.

## Interaction And Accessibility

Existing tabs, navigation destinations, edit permission checks, button labels, and click handlers remain unchanged. The tab navigation retains an accessible label and keyboard-operable buttons. The responsive layout does not hide project facts or actions.

## Validation

Add source-level UI regression expectations for the new semantic layout classes and responsive style rules. Run the focused detail UI test, the full test suite, and the production build. Manually inspect the existing project detail route at desktop and a narrow viewport after the Vite server reloads.
