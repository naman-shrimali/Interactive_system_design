# TASK-019: React Flow node components — batch 3 (stacks, service, text_box, table)

> ⚠️ **SHIPPED — historical record, not a specification.** The diagram engine is built. Node
> components are grouped by shape rather than one file per kind; see
> [docs/01-architecture.md](../docs/01-architecture.md) and [tasks/README.md](README.md).


## Objective
Complete the node catalog: stacked cluster variants, the filled service box, plain annotation boxes, and the data-table node.

## Prerequisites
TASK-018 (BaseNode with `iconBoxClassName`, registry).

## Context
Stacks reproduce the book's "multiple overlapping icons = cluster" visual (Web servers, Databases, Caches, Workers). Service/text_box/table don't use the icon-above-label anatomy, so they are standalone components — but they MUST render the same 4 handles (top/left targets, bottom/right sources) so edges attach uniformly. Extract the handle block from BaseNode into a shared component first.

## Files to create
```
client/src/components/diagram/nodes/NodeHandles.tsx      (the 4 invisible handles, extracted)
client/src/components/diagram/nodes/ServerStackNode.tsx
client/src/components/diagram/nodes/DatabaseStackNode.tsx
client/src/components/diagram/nodes/CacheStackNode.tsx
client/src/components/diagram/nodes/WorkerStackNode.tsx
client/src/components/diagram/nodes/ServiceNode.tsx
client/src/components/diagram/nodes/TextBoxNode.tsx
client/src/components/diagram/nodes/TableNode.tsx
```
## Files to modify
```
client/src/components/diagram/nodes/BaseNode.tsx    (use NodeHandles; add `stacked` prop)
client/src/components/diagram/nodes/index.ts        (register 7 types)
client/src/pages/DiagramPreviewPage.tsx             (showcase row)
```

## Data contracts & visual specs

1. **`NodeHandles`**: renders exactly what BaseNode had — `top`/`left` as `type="target"`, `bottom`/`right` as `type="source"`, all `className="!w-1 !h-1 !bg-transparent !border-0"`. BaseNode switches to `<NodeHandles />` with zero visual change.
2. **BaseNode `stacked?: boolean`**: when true, render two "ghost" boxes behind the icon box — absolutely positioned copies (`same size, rounded-lg border-2 bg-white` + the accent border class) offset `translate(6px,-6px)` and `translate(12px,-12px)`, placed before the icon box in DOM order so they sit underneath. Wrap icon box + ghosts in a `relative` container.
3. **Stack nodes** (each ~10 lines, `stacked` + batch-1/2 accents):
   | key | icon | accent |
   |---|---|---|
   | `server_stack` | `Server` | green (as ServerNode) |
   | `database_stack` | `Database` | blue (as DatabaseNode) |
   | `cache_stack` | `Zap` | blue (as CacheNode) |
   | `worker_stack` | `Cpu` | green (as ServerNode) |
4. **`ServiceNode`** (key `service`): label INSIDE a filled box — `<NodeHandles/>` + `div className="px-5 py-3 rounded-lg bg-blue-600 border-2 border-blue-800 text-white text-sm font-semibold min-w-28 text-center"` showing `data.label`; `data.sublabel` beneath in `text-[10px] text-blue-100`. Reuse badge/state styling rules from BaseNode (copy the small badge/state snippets; states apply to the box).
5. **`TextBoxNode`** (key `text_box`): `<NodeHandles/>` + `div className="px-3 py-2 rounded-lg border-2 border-purple-500 bg-white"`, `data.label` as `text-xs font-medium text-slate-800`, `data.sublabel` as `text-[10px] text-slate-500 whitespace-pre-line` (authors can embed `\n`).
6. **`TableNode`** (key `table`): `<NodeHandles/>` + `<table className="border-collapse bg-white text-xs">`; header cells `border border-slate-400 bg-slate-100 px-2 py-1 font-semibold`, body cells `border border-slate-400 px-2 py-1`. Data: `data.tableData?: { columns: string[]; rows: string[][] }` (add to `DiagramNodeData`); render `data.label` as a caption above when non-empty. If `tableData` is missing render a red "table: missing tableData" box (authoring error surface).

## Steps
1. Extract `NodeHandles`, refactor BaseNode, verify batches 1–2 unchanged.
2. Add `stacked` to BaseNode; build the 4 stack nodes.
3. Build ServiceNode, TextBoxNode, TableNode.
4. Register all 7 in `nodeTypes` — after this task the registry covers **all 17 `NodeKind` values**; add a compile-time completeness check:
   ```ts
   import type { NodeKind } from '../../../types';
   const _check: Record<NodeKind, unknown> = nodeTypes;  // compile error if any kind is missing
   ```
5. Preview page: fourth row with the 4 stacks ("Web servers", "Databases", "Caches", "Workers"), a service ("Producer"), a text_box ("Tools", sublabel "Logging\nMetrics\nMonitoring"), and a table (columns `["Domain","IP Address"]`, one row `["mywebsite.com","88.88.88.1"]` — the book's DNS lookup table).

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes, including the `Record<NodeKind, …>` completeness check.
- [ ] Stacks show two offset ghost boxes behind the icon (cluster look); non-stacked nodes unchanged.
- [ ] Service renders white-on-blue with the label inside; text_box shows multi-line sublabel; table renders a real bordered table.
- [ ] An edge from the table node to a stack node connects at the expected sides in the preview.
- [ ] A `table` node without `tableData` shows the red authoring-error box instead of crashing.

## Out of scope
Edges (TASK-020), groups (TASK-021), JSON-driven rendering (TASK-022).
