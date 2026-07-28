# TASK-011: App shell — sidebar curriculum tree + routing

> ⚠️ **SUPERSEDED — historical record, not a specification.** This task shipped, but against
> schema v1 (`sources → chapters → sections`) and the pre-redesign UI. Its DDL, API shapes, and
> component names no longer match the code. For current contracts see
> [docs/02-data-models.md](../docs/02-data-models.md); see [tasks/README.md](README.md) for status.


## Objective
Build the persistent layout (sidebar + top bar + content outlet) with a collapsible Source → Chapter → Section tree showing per-section progress badges.

## Prerequisites
TASK-010 (store + types). Server running with seeded data for manual checks.

## Context
The sidebar is the app's primary navigation and renders purely from `useAppStore().curriculum`. Clicking a section routes to `/sections/:id`. This task creates a **placeholder** SectionPage (TASK-012 fills it in).

## Files to create
```
client/src/components/layout/Sidebar.tsx
client/src/components/layout/TopBar.tsx
client/src/pages/HomePage.tsx
client/src/pages/SectionPage.tsx     (placeholder: renders "Section {id}")
```
## Files to modify
```
client/src/App.tsx
```

## Data contract
Routing (react-router v6):
```
/                    → HomePage
/sections/:id        → SectionPage
/diagram-preview     → DiagramPreviewPage (keep existing route if TASK-015 landed; otherwise skip)
```
Layout: `App.tsx` renders `<BrowserRouter>` → flex row: `<Sidebar />` (fixed width `w-80`, full height, own scroll) + main column (`<TopBar />` + scrollable `<Routes>` area).

## Steps
1. `App.tsx`: call `loadCurriculum()` once in a `useEffect`. Replace the TASK-001 health-check UI (move its content into `HomePage`).
2. `TopBar.tsx`: app title (link to `/`), right side placeholder text "Local learner" — keep dumb.
3. `Sidebar.tsx`:
   - Local state: `expanded: Set<string>` keyed by `src-<id>` / `ch-<id>`; toggle on row click. Default: both sources expanded, chapters collapsed.
   - Render per source: header row (title + `kind` pill "repo"/"book"). Per chapter: row with disclosure chevron (`ChevronRight` rotated when open, from lucide-react), title, and a right-aligned fraction `x/y` where x = sections with `progressStatus === 'completed'`, y = total.
   - Per section: `<NavLink to={'/sections/' + s.id}>` row with a status badge before the title:
     `completed` → green check (`CheckCircle2` icon, `text-green-600`); `in_progress` → blue dot (`Circle`, `text-blue-500 fill-blue-500`, size 8); `not_started` → gray ring (`Circle`, `text-slate-300`).
     If `s.diagramCount > 0`, append a small `Workflow` icon (`text-blue-400`); if `s.linkCount > 0`, a small `Link` icon (`text-slate-400`).
   - Active section (NavLink `isActive`) → `bg-blue-50 text-blue-800` row.
   - While `curriculum === null`: show "Loading…"; on `curriculumError`: show the message in red.
4. `HomePage.tsx`: heading, one-paragraph description, and (when curriculum is loaded) a simple list: each source with total chapters/sections computed client-side. Include the attribution line: "Text content from The System Design Primer (MIT) © Donne Martin."

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes; app renders with sidebar and top bar.
- [ ] Both sources appear; expanding `primer` shows 24 chapters; expanding a chapter shows its sections with gray rings on a fresh DB.
- [ ] `sqlite3 ... "INSERT INTO section_progress (user_id, section_id, status) VALUES (1, 1, 'completed')"` + browser refresh → green check on that section and the chapter fraction increments.
- [ ] Clicking a section navigates to `/sections/:id` (placeholder text visible) and the row highlights.
- [ ] The `scale-to-millions` overview section row shows the diagram icon.
- [ ] Sidebar scrolls independently of the content area.

## Out of scope
Section content rendering (TASK-012), chapter progress bars (TASK-014 refines the fraction into a bar), search, mobile layout.
