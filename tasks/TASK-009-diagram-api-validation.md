# TASK-009: `GET /api/diagrams/:id` + diagram validation script

> ⚠️ **SUPERSEDED — historical record, not a specification.** This task shipped, but against
> schema v1 (`sources → chapters → sections`) and the pre-redesign UI. Its DDL, API shapes, and
> component names no longer match the code. For current contracts see
> [docs/02-data-models.md](../docs/02-data-models.md); see [tasks/README.md](README.md) for status.


## Objective
Serve stored diagram specs over the API, and build the ajv-based `npm run validate:diagrams` script that gates all hand-authored diagram JSON.

## Prerequisites
TASK-005 (router pattern). Scripts package exists from TASK-003.

## Context
Diagram specs are authored as files in `content/diagrams/<sourceSlug>__<chapterSlug>__<sectionSlug>/<diagramSlug>.json` and seeded into `diagrams.spec_json`. The validator enforces the JSON Schema **plus** cross-reference rules ajv cannot express. It runs before every seed (authoring workflow step 4 in docs/04).

## Files to create
```
server/src/routes/diagrams.ts
scripts/diagram.schema.json       (copy VERBATIM from docs/02-data-models.md §3)
scripts/validate-diagrams.ts
```
## Files to modify
```
server/src/index.ts     (mount diagramsRouter)
scripts/package.json    (add dep "ajv"; add script "validate:diagrams": "tsx validate-diagrams.ts")
```

## Data contracts
API `200`: `{ id, slug, title, spec }` where `spec` = `JSON.parse(spec_json)` (type `InteractiveDiagram`). `404 { "error": "diagram not found" }`.

## Steps

1. **Route** `GET /diagrams/:id`: parse int (400), `SELECT id, slug, title, spec_json FROM diagrams WHERE id = ?` (404), respond with parsed spec.
2. **Validator** `scripts/validate-diagrams.ts`:
   ```
   files = glob content/diagrams/*/*.json   (fs.readdirSync twice; no glob dependency)
   if none: print "no diagram files found" and exit 0
   for each file:
     a. dir name must split on "__" into exactly 3 non-empty parts   → error otherwise
     b. JSON.parse                                                    → error on throw
     c. ajv.validate(schema, spec)                                    → collect ajv errors
     d. cross-reference checks (only if a–c passed):
        - node ids unique; group ids unique; edge ids unique; flow ids unique
        - every node.groupId exists in groups
        - every edge.source / edge.target exists in node ids
        - edge.sourceHandle (if set) ∈ {bottom, right}; edge.targetHandle (if set) ∈ {top, left}
          (rendering constraint: BaseNode exposes source handles bottom/right, target handles top/left)
        - every flow step edgeId exists in edge ids
        - nodes of type "table" must have tableData; non-table nodes must not
        - spec.id must equal the filename without .json
   print "OK <path>" or "FAIL <path>" + bulleted errors
   exit 1 if any file failed, else print summary and exit 0
   ```
   Use `new Ajv({ allErrors: true, useDefaults: false })`.

## Acceptance criteria
- [ ] `cd scripts && npm install && npm run validate:diagrams` prints `OK` for the committed `web-data-tier.json` and exits 0.
- [ ] Temporarily add `"badField": 1` to that file → FAIL with an `additionalProperties` error, exit 1 (then revert).
- [ ] Temporarily change an edge `"source"` to `"nope"` → FAIL naming the edge id and missing node (then revert).
- [ ] Temporarily set an edge `"sourceHandle": "top"` → FAIL with the handle-side rule (then revert).
- [ ] `curl localhost:4000/api/diagrams/<seeded-id>` returns the spec with `spec.schemaVersion === 1`; id 999999 → 404.
- [ ] `npx tsc --noEmit` passes in both `server/` and `scripts/`.

## Out of scope
Rendering (Phase 5), running validation inside the seed script (seed only requires `JSON.parse`; CI-style gating is manual via this script).
