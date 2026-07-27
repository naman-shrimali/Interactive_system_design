# TASK-024: Embed diagrams in the section page + file-driven preview route

## Objective
Show a section's interactive diagrams on its reader page (spec fetched from the API), and upgrade `/diagram-preview` to load any diagram file straight from `content/diagrams/` for the authoring workflow.

## Prerequisites
TASK-023 (DiagramViewer), TASK-012 (SectionPage slot), TASK-009 (`GET /api/diagrams/:id`).

## Context
Section pages get diagram metadata in `SectionDetail.diagrams` (`{ id, slug, title, viewed }`); the heavy `spec` is fetched per diagram from `GET /api/diagrams/:id`. The preview route needs raw files (not yet seeded), so the server gets two small dev routes reading `content/diagrams/` directly — this makes authoring step 5 in docs/04 work: edit JSON → refresh browser → see it.

## Files to create
```
server/src/routes/dev.ts
client/src/components/diagram/SectionDiagram.tsx
```
## Files to modify
```
server/src/index.ts                       (mount devRouter)
client/src/pages/SectionPage.tsx          (TASK-024 slot)
client/src/pages/DiagramPreviewPage.tsx   (file picker)
client/src/api/client.ts                  (two dev fetchers)
```

## Data contracts — dev routes (local-only app; still guard path traversal)

### `GET /api/dev/diagram-files`
→ `200 { "files": string[] }` — relative paths like `"sdi-vol1-2e__scale-to-millions__overview/web-data-tier.json"`, sorted; `[]` when the directory is missing.

### `GET /api/dev/diagram-file?name=<relativePath>`
→ `200` raw parsed JSON of that file | `400` invalid name | `404` not found.
Guard: reject any `name` that fails `/^[a-z0-9_-]+__[a-z0-9_-]+__[a-z0-9_-]+\/[a-z0-9-]+\.json$/`; additionally `path.resolve` the joined path and require it to start with the resolved `content/diagrams` directory.

Client fetchers: `fetchDiagramFiles(): Promise<string[]>`, `fetchDiagramFile(name: string): Promise<InteractiveDiagram>`.

## Steps
1. **Server `dev.ts`**: implement both routes with `fs.readdirSync` (outer dirs, inner files, only `.json`). Resolve the diagrams root as `path.join(__dirname, '..', '..', '..', 'content', 'diagrams')` (same root-resolution as seed.ts).
2. **`SectionDiagram.tsx`** — props `{ meta: DiagramMeta }`:
   - state: `spec: InteractiveDiagram | null`, `error: string | null`
   - on mount: `fetchDiagram(meta.id)` → store `.spec`
   - render: loading skeleton (`h-24 bg-slate-100 animate-pulse rounded`) → then `<DiagramViewer spec diagramId={meta.id} viewed={meta.viewed} />`; error → small red box with the message.
3. **SectionPage**: in the TASK-024 slot (between markdown and LinksPanel) render, when `section.diagrams.length > 0`:
   `<h2 className="mt-8 text-lg font-semibold">Interactive diagrams</h2>` + one `<SectionDiagram key={d.id} meta={d} />` per entry.
4. **DiagramPreviewPage**: top bar with a `<select>` populated from `fetchDiagramFiles()`; choosing one loads it via `fetchDiagramFile` and renders `<DiagramViewer spec />` (no `diagramId`). A "Reload file" button re-fetches the same name (authoring loop). Keep the node/edge showcase below, collapsed under a `<details>` element titled "Component showcase".
5. Note for verification: after finishing a flow on the section page, the sidebar's diagram icon state and section rollups refresh via the existing `refreshCurriculum()` call inside DiagramViewer.

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes in both packages.
- [ ] `curl localhost:4000/api/dev/diagram-files` lists the committed example; `?name=` fetch returns its JSON; `?name=../../server/data/app.db` and other malformed names → 400.
- [ ] The `scale-to-millions` overview section page shows the "Interactive diagrams" heading and the rendered web-data-tier diagram with its flow button.
- [ ] Completing the flow there flips the diagram to `viewed ✓`, persists across reload, and `GET /api/curriculum` now reports `diagramsViewed: 1` for that section.
- [ ] `/diagram-preview`: picking the file from the dropdown renders it; editing the JSON on disk and clicking "Reload file" shows the change without restarting anything.
- [ ] Sections without diagrams render no diagrams heading.

## Out of scope
Authoring new diagram content (Phase 6 tasks), hot-reload file watching, exporting diagrams as images.
