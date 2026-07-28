# TASK-024: Embed diagrams in the topic page + file-driven preview route

## Objective
Render a topic's interactive diagrams on its page (spec fetched from the API), and upgrade
`/diagram-preview` to load any file from `content/diagrams/` for the authoring loop.

## Prerequisites
TASK-023 (DiagramViewer), TASK-009 (`GET /api/diagrams/:id`). The dev routes described below **already
exist** in `server/src/routes/dev.ts` — verify them rather than rewriting.

## Context
`GET /api/topics/:idOrSlug` already returns diagram metadata in two places:
- `topic.sections[].diagrams` — anchored to a section (declared via `diagrams: [...]` in the topic map)
- `topic.topicDiagrams` — not anchored to any section

Both are `DiagramMeta` (`{ id, slug, title, viewed }`). The heavy `spec` is fetched per diagram from
`GET /api/diagrams/:id`. `TopicPage.tsx` currently renders a **placeholder card** where each
section-anchored diagram belongs — replace that placeholder.

Diagram files live at `content/diagrams/<topicSlug>/<diagramSlug>.json`.

## Files to create
```
client/src/components/diagram/SectionDiagram.tsx
```
## Files to modify
```
client/src/pages/TopicPage.tsx            (replace the placeholder card; add topicDiagrams block)
client/src/pages/DiagramPreviewPage.tsx   (file picker)
client/src/api/client.ts                  (two dev fetchers)
```

## Data contracts — dev routes (already implemented; confirm they behave as stated)

### `GET /api/dev/diagram-files`
→ `200 { "files": string[] }` — relative paths like `"scaling-journey/web-data-tier.json"`, sorted;
`[]` when the directory is missing.

### `GET /api/dev/diagram-file?name=<relativePath>`
→ `200` the parsed JSON | `400` invalid name | `404` not found.
Guard: `name` must match `/^[a-z0-9-]+\/[a-z0-9-]+\.json$/`, **and** the resolved path must start with
the resolved `content/diagrams` directory (defence against traversal).

Client fetchers to add:
```ts
fetchDiagramFiles(): Promise<string[]>
fetchDiagramFile(name: string): Promise<InteractiveDiagram>
```

## Steps

1. **`SectionDiagram.tsx`** — props `{ meta: DiagramMeta }`:
   - state `spec: InteractiveDiagram | null`, `error: string | null`
   - on mount: `fetchDiagram(meta.id)` → store `.spec`
   - render: `<Skeleton className="h-64" />` while loading → then
     `<DiagramViewer spec={spec} diagramId={meta.id} viewed={meta.viewed} />`; on error a small red box.
2. **TopicPage** — replace the placeholder block inside each section:
   ```tsx
   {section.diagrams.map((d) => <SectionDiagram key={d.id} meta={d} />)}
   ```
   Then, after the last section and before `LinksPanel`, render `topic.topicDiagrams` under an
   `<h2>Diagrams</h2>` when non-empty (these are diagrams whose owning section hasn't been written yet).
3. **DiagramPreviewPage** — top bar with a `<select>` populated from `fetchDiagramFiles()`; choosing one
   loads it via `fetchDiagramFile` and renders `<DiagramViewer spec />` (**no** `diagramId` — preview
   must never write progress). A "Reload file" button re-fetches the same name. Keep the node/edge
   showcase below inside a `<details>` titled "Component showcase".
4. The sticky table of contents in TopicPage should stay correct — diagrams render inside existing
   `<section id="section-…">` elements, so no TOC change is needed.

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes in `client/` and `server/`.
- [ ] `curl 'localhost:4000/api/dev/diagram-files'` lists `scaling-journey/web-data-tier.json`;
      `?name=scaling-journey/web-data-tier.json` returns the spec;
      `?name=../../server/data/app.db` → 400.
- [ ] `/topics/scaling-journey` renders the web-data-tier diagram (currently it appears under
      "Diagrams" as a topic-level diagram, because its owning section
      `content/authored/scaling-journey/01-web-and-data-tier.md` is not written yet).
- [ ] Completing the diagram's flow flips it to `viewed ✓`, persists across reload, and
      `GET /api/curriculum` reports `diagramsViewed: 1` for that topic.
- [ ] `/diagram-preview`: picking a file renders it; editing the JSON on disk and clicking "Reload file"
      shows the change with no restart.
- [ ] Topics with no diagrams render no diagram heading and no empty box.

## Out of scope
Authoring new diagram content (roadmap phase 7), file watching, image export.
