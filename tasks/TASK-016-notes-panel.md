# TASK-016: Notes panel (create / edit / delete, markdown preview)

## Objective
Build a reusable notes panel anchored to a section or a chapter, and mount it on the section page.

## Prerequisites
TASK-012 (SectionPage slot), TASK-008 (notes API), TASK-010 (api client).

## Context
Notes are the learner's own markdown. The panel is deliberately reusable: TASK-017 mounts the same component with a chapter anchor. Rendering reuses `MarkdownView` from TASK-012.

## Files to create
```
client/src/components/reader/NotesPanel.tsx
```
## Files to modify
```
client/src/pages/SectionPage.tsx    (mount in the TASK-016 slot with { sectionId })
```

## Data contract
```ts
type NotesAnchor = { sectionId: number } | { chapterId: number };
interface NotesPanelProps { anchor: NotesAnchor; }
```
Panel state:
```ts
notes: Note[]                    // fetched on mount / anchor change
draft: string                    // new-note textarea
editingId: number | null         // note currently being edited
editDraft: string
busy: boolean                    // any request in flight
```

## Steps
1. On mount and whenever the anchor changes (`useEffect` keyed on `JSON.stringify(anchor)`): `fetchNotes(anchor)` → `notes`.
2. Card layout `border rounded-lg p-4 mt-8`: header (`StickyNote` lucide icon + "My notes" + count).
3. **Create:** textarea (`w-full border rounded p-2 font-mono text-sm`, 4 rows, placeholder "Write a note in markdown…") + "Add note" button (disabled when `draft.trim() === ''` or `busy`). On click: `createNote({ ...anchor, contentMarkdown: draft })`, prepend result to `notes`, clear draft.
4. **List:** each note, newest first:
   - view mode: `<MarkdownView markdown={note.contentMarkdown} />` + footer row with `updatedAt` formatted via `new Date(...).toLocaleString()` and two small buttons: "Edit", "Delete".
   - "Delete": `window.confirm('Delete this note?')` → `deleteNote(id)` → remove from list.
   - "Edit": switches that note to edit mode (textarea prefilled + "Save"/"Cancel"). Save → `updateNote(id, editDraft)` → replace in list, exit edit mode. Only one note editable at a time (`editingId`).
5. All handlers wrap in `try { setBusy(true); ... } catch (e) { alert((e as Error).message) } finally { setBusy(false) }`.
6. Mount in SectionPage's TASK-016 slot: `<NotesPanel anchor={{ sectionId: section.id }} />` (below LinksPanel).

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes.
- [ ] Adding a note with markdown (`**bold**, a list`) renders formatted immediately and survives reload.
- [ ] Edit changes the text and the displayed timestamp; Cancel discards; Delete asks for confirmation and removes.
- [ ] Notes are per-section: a note added on section A does not appear on section B.
- [ ] Empty/whitespace drafts cannot be submitted.
- [ ] `sqlite3 ... "SELECT COUNT(*) FROM notes"` matches the UI count after the above.

## Out of scope
Chapter-anchored mounting and the all-notes page (TASK-017), rich-text toolbar, autosave.
