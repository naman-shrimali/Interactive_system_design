# TASK-014: Section progress controls + chapter progress bars

## Objective
Let the learner set a section's status (Not started / In progress / Completed) from the reader, and upgrade sidebar chapter fractions into visual progress bars.

## Prerequisites
TASK-012 (SectionPage), TASK-011 (Sidebar), TASK-007 (`PUT /api/progress/section/:id`).

## Context
The section's current status lives in the curriculum tree (store), not in `SectionDetail`. Look it up from `useAppStore().curriculum` by section id; default `'not_started'` when absent.

## Files to create
```
client/src/components/reader/ProgressControls.tsx
```
## Files to modify
```
client/src/pages/SectionPage.tsx            (mount below the h1 title)
client/src/components/layout/Sidebar.tsx    (chapter fraction → progress bar)
```

## Data contract
```ts
interface ProgressControlsProps { sectionId: number; }
```
Status values and labels: `not_started` → "Not started", `in_progress` → "In progress", `completed` → "Completed".

## Steps
1. `ProgressControls.tsx`: segmented control — three buttons in a `inline-flex rounded-lg border overflow-hidden` group.
   - Find current status: walk `curriculum` (`sources → chapters → sections`) for `sectionId`; memoize with `useMemo`.
   - Active button styling by status: not_started `bg-slate-200 text-slate-700`; in_progress `bg-blue-600 text-white`; completed `bg-green-600 text-white`. Inactive: `bg-white text-slate-500 hover:bg-slate-50`.
   - onClick (ignore clicks on the already-active status):
     ```
     await setSectionProgress(sectionId, status)
     await refreshCurriculum()          // single source of truth; button re-renders from store
     ```
     Disable all three buttons while the request is in flight (`useState` flag).
2. Sidebar chapter rows: replace the `x/y` text with text + bar:
   - keep the fraction, add underneath a `h-1 rounded bg-slate-200` track with an inner `bg-green-500` div, `width: {pct}%` via inline style where `pct = completed / total * 100` (0 when total is 0).
3. Mount `<ProgressControls sectionId={section.id} />` in SectionPage directly under the `<h1>`.

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes.
- [ ] Opening a fresh section shows "Not started" active; clicking "Completed" turns the button green, the sidebar badge green, and the chapter bar grows — all without a reload.
- [ ] Status survives a page reload; `sqlite3 ... "SELECT status FROM section_progress WHERE section_id = <id>"` matches the UI.
- [ ] Buttons are disabled during the request (no double-fire on rapid clicks).
- [ ] A chapter with 0 completed sections shows an empty bar, fully completed shows a full bar.

## Out of scope
Auto-marking sections complete on scroll/diagram view, dashboard page (TASK-040).
