# TASK-017: Chapter notes page + "All my notes" page

## Objective
Give chapters their own page (description + chapter-anchored notes) and add a global page listing every note grouped by where it was taken.

## Prerequisites
TASK-016 (reusable NotesPanel), TASK-011 (sidebar/routing).

## Context
`GET /api/notes` requires exactly one anchor param, so the all-notes page needs one new server route that returns every note with a human-readable anchor. This task therefore touches both server and client.

## Files to create
```
server/src/routes (modify notes.ts — add one route)
client/src/pages/ChapterPage.tsx
client/src/pages/NotesPage.tsx
```
## Files to modify
```
client/src/App.tsx                          (routes /chapters/:id and /notes)
client/src/components/layout/Sidebar.tsx    (chapter title → link to /chapters/:id)
client/src/components/layout/TopBar.tsx     (nav link "My notes" → /notes)
client/src/types.ts  and  client/src/api/client.ts   (new type + fetcher)
```

## Data contract — new API route (addition to docs/02, defined here)

### `GET /api/notes/all`
→ `200 { "notes": NoteWithAnchor[] }`, newest `updatedAt` first.
```ts
export interface NoteWithAnchor extends Note {
  anchorType: 'chapter' | 'section';
  anchorTitle: string;      // "Chapter title" or "Chapter title › Section title"
  anchorId: number;         // chapter id, or the SECTION's id for section notes
}
```
SQL (register BEFORE the `/notes/:id`-style routes so `all` isn't parsed as an id — in Express, define `router.get('/notes/all', …)` above `router.put('/notes/:id', …)`):
```sql
SELECT n.id, n.chapter_id, n.section_id, n.content_markdown, n.created_at, n.updated_at,
       ch.title  AS chapter_title,
       sec.title AS section_title,
       sch.title AS section_chapter_title
FROM notes n
LEFT JOIN chapters ch  ON ch.id  = n.chapter_id
LEFT JOIN sections sec ON sec.id = n.section_id
LEFT JOIN chapters sch ON sch.id = sec.chapter_id
WHERE n.user_id = 1
ORDER BY n.updated_at DESC;
```
Mapping: chapter note → `anchorType 'chapter'`, `anchorTitle = chapter_title`, `anchorId = chapter_id`; section note → `'section'`, `` `${section_chapter_title} › ${section_title}` ``, `anchorId = section_id`.

## Steps
1. Server: add the route + mapper; client: add `fetchAllNotes(): Promise<NoteWithAnchor[]>`.
2. `ChapterPage.tsx` (`/chapters/:id`): find the chapter in the store's curriculum by id (loading state until curriculum arrives; unknown id → "Chapter not found"). Render: source pill, chapter title, `description`, a link-list of its sections (to `/sections/:id` with the same status badges used in the sidebar), then `<NotesPanel anchor={{ chapterId }} />`.
3. Sidebar: chapter row title becomes a `<NavLink to={'/chapters/' + c.id}>`; the disclosure chevron alone toggles expansion (stopPropagation on the chevron button so navigating and expanding are separate actions).
4. `NotesPage.tsx` (`/notes`): fetch all notes on mount. Each note card: anchor title as a link (`/chapters/:anchorId` or `/sections/:anchorId`), `<MarkdownView>`, updated timestamp. Empty state: "No notes yet — open any section and write one." No editing here (link through to the anchor instead).
5. TopBar: add "My notes" nav link.

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes in both packages.
- [ ] `curl localhost:4000/api/notes/all` returns section notes with `anchorTitle` in "Chapter › Section" form.
- [ ] `/chapters/:id` shows description, working section links, and chapter-level notes that persist and do NOT appear on any section page.
- [ ] `/notes` lists chapter and section notes together, newest first; clicking an anchor navigates to the right page.
- [ ] Sidebar chevron still expands/collapses without navigating; clicking the chapter title navigates.

## Out of scope
Notes export (TASK-042), editing from the all-notes page, pagination.
