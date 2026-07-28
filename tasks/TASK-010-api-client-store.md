# TASK-010: Typed API client + Zustand store

> ⚠️ **SUPERSEDED — historical record, not a specification.** This task shipped, but against
> schema v1 (`sources → chapters → sections`) and the pre-redesign UI. Its DDL, API shapes, and
> component names no longer match the code. For current contracts see
> [docs/02-data-models.md](../docs/02-data-models.md); see [tasks/README.md](README.md) for status.


## Objective
Create the client-side types file, a typed fetch wrapper for every API endpoint, and a minimal Zustand store holding the curriculum tree.

## Prerequisites
TASK-001 (client scaffold). The server API (TASK-005…009) should exist for manual verification, but this task compiles standalone.

## Context
All server communication goes through `client/src/api/client.ts` — components never call `fetch` directly. The store keeps ONLY the curriculum tree (sidebar data); page-level data (section detail, notes, diagram specs) stays in component state. After any mutation, components call `refreshCurriculum()` to update sidebar rollups — no optimistic tree surgery.

## Files to create
```
client/src/types.ts               (copy ALL types verbatim from docs/02-data-models.md §4)
client/src/api/client.ts
client/src/store/useAppStore.ts
```

## Data contracts

`client.ts` exports exactly these functions (shapes from `types.ts`):
```ts
fetchCurriculum(): Promise<CurriculumSource[]>                 // GET /api/curriculum → .sources
fetchSection(id: number): Promise<SectionDetail>               // GET /api/sections/:id
fetchDiagram(id: number): Promise<{ id: number; slug: string; title: string; spec: InteractiveDiagram }>
setSectionProgress(id: number, status: ProgressStatus): Promise<void>
setLinkCompleted(id: number, completed: boolean): Promise<void>
markDiagramViewed(id: number): Promise<void>                   // body { viewed: true }
fetchProgressSummary(): Promise<ProgressSummarySource[]>       // GET /api/progress/summary → .sources
fetchNotes(anchor: { sectionId: number } | { chapterId: number }): Promise<Note[]>
createNote(input: { sectionId?: number; chapterId?: number; contentMarkdown: string }): Promise<Note>
updateNote(id: number, contentMarkdown: string): Promise<Note>
deleteNote(id: number): Promise<void>
```
Add to `types.ts` (matches TASK-007 response):
```ts
export interface ProgressSummarySource {
  slug: string; title: string;
  sectionsTotal: number; sectionsCompleted: number;
  linksTotal: number; linksCompleted: number;
  diagramsTotal: number; diagramsViewed: number;
}
```

Store shape:
```ts
interface AppState {
  curriculum: CurriculumSource[] | null;   // null = not yet loaded
  curriculumError: string | null;
  loadCurriculum(): Promise<void>;         // no-op if already loaded
  refreshCurriculum(): Promise<void>;      // always re-fetches
}
```

## Steps
1. Private helper in `client.ts`:
   ```ts
   async function request<T>(path: string, init?: RequestInit): Promise<T> {
     const res = await fetch(path, {
       headers: { 'content-type': 'application/json' }, ...init });
     if (!res.ok) {
       const body = await res.json().catch(() => ({}));
       throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
     }
     return res.json() as Promise<T>;
   }
   ```
   All paths are relative (`/api/...`) — the Vite proxy routes them.
2. Implement each exported function as a one-liner over `request` (PUT/POST with `JSON.stringify` body, `method` set).
3. `useAppStore.ts` with `create<AppState>()` — `refreshCurriculum` catches errors into `curriculumError`; `loadCurriculum` returns early when `curriculum !== null`.

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes in `client/`.
- [ ] With both servers running, calling `useAppStore.getState().loadCurriculum()` from the browser console (temporarily expose it via `window` in `main.tsx` or test in a scratch `useEffect`) populates 2 sources.
- [ ] `client.ts` contains exactly one `fetch` call (the helper); every endpoint function is exported and typed (no `any`).
- [ ] A failing request (e.g. `fetchSection(999999)`) rejects with `Error("section not found")`.

## Out of scope
Any UI components, section/notes local state management, error toasts.
