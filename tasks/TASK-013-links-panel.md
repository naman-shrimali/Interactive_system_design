# TASK-013: External-resources panel with completion checkboxes

## Objective
Add the "External resources" panel to the section page: every extracted link with a completion checkbox persisted to the server.

## Prerequisites
TASK-012 (SectionPage with placeholder slot), TASK-007 (`PUT /api/progress/link/:id`).

## Context
Feature requirement #5: sections list their outbound resources and track which ones the learner finished. Links come in on `SectionDetail.links` (`{ id, url, title, completed }`).

## Files to create
```
client/src/components/reader/LinksPanel.tsx
```
## Files to modify
```
client/src/pages/SectionPage.tsx    (mount in the TASK-013 slot)
```

## Data contract
```ts
interface LinksPanelProps {
  links: ExternalLink[];   // from SectionDetail
}
```
The panel owns a local copy (`useState(links)`, resynced via `useEffect` when the prop identity changes — section navigation replaces it).

## Steps
1. Render nothing (`return null`) when `links.length === 0`.
2. Panel: bordered card `border rounded-lg p-4 mt-8`. Header row: `Link` icon + "External resources" + right-aligned counter `"{completedCount}/{links.length} completed"` (`text-sm text-slate-500`).
3. Each link row:
   - `<input type="checkbox">` checked = `completed`
   - `<a href={url} target="_blank" rel="noopener noreferrer">` title, `text-blue-700 hover:underline`; completed rows get `line-through text-slate-400`
   - small gray hostname after the title: `new URL(url).hostname` (wrap in try/catch, fall back to nothing)
4. Checkbox handler (optimistic with rollback):
   ```
   flip local state
   try   → await setLinkCompleted(id, next); await refreshCurriculum()   // sidebar counts
   catch → flip local state back
   ```
5. Mount in SectionPage's TASK-013 slot: `<LinksPanel links={section.links} />` (below the markdown, above the attribution footer).

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes.
- [ ] A primer section with links shows the panel; a section without links shows nothing.
- [ ] Checking a box strikes the row, increments the counter, and survives a full page reload (persisted).
- [ ] `sqlite3 ... "SELECT completed FROM link_progress WHERE link_id = <id>"` shows 1 after checking, 0 after unchecking.
- [ ] With the API server stopped, clicking a checkbox visibly reverts (rollback works).
- [ ] Links open in a new tab; the row's checkbox toggles without following the link.

## Out of scope
Progress controls (TASK-014), any sidebar changes beyond the existing `refreshCurriculum` rollup.
