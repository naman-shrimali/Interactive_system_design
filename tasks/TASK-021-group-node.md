# TASK-021: Group (tier) rendering

> ⚠️ **SHIPPED — historical record, not a specification.** The diagram engine is built. Node
> components are grouped by shape rather than one file per kind; see
> [docs/01-architecture.md](../docs/01-architecture.md) and [tasks/README.md](README.md).


## Objective
Render diagram groups — the book's dashed "Web tier"/"Data tier" boxes, the solid "User" device box, and the filled gray datacenter regions — as background container nodes.

## Prerequisites
TASK-015 (registry, preview page). Independent of edges.

## Context
In React Flow v12, containers are nodes whose children reference them via `parentId`; the container's size comes from `node.style.width/height` set by the canvas mapping (TASK-022). This task builds the visual component and registers it under the custom type key **`group_box`** (NOT React Flow's built-in `group`, to keep our styling rules self-contained).

## Files to create
```
client/src/components/diagram/nodes/GroupNode.tsx
```
## Files to modify
```
client/src/components/diagram/nodes/index.ts        (register 'group_box')
client/src/pages/DiagramPreviewPage.tsx             (grouped showcase)
```

## Data contract
```ts
export interface GroupNodeData {
  label?: string;
  boxStyle: 'dashed' | 'solid' | 'filled';
  labelPosition?: 'top-left' | 'top-right' | 'right' | 'bottom';  // default 'top-left'
  [key: string]: unknown;
}
```
The component renders a full-size div (`w-full h-full` — React Flow sizes the wrapper from `node.style`). No handles: groups are never edge endpoints (the ajv validator already enforces edges reference real nodes; group ids and node ids live in separate namespaces).

## Steps
1. Style map:
   - `dashed` → `border-2 border-dashed border-sky-400 rounded-2xl bg-sky-50/20`
   - `solid`  → `border-2 border-sky-500 rounded-2xl bg-white/0`
   - `filled` → `border border-slate-300 rounded-2xl bg-slate-100`
2. Label: small `text-xs font-semibold text-slate-600 bg-white/80 px-1 rounded absolute` positioned by `labelPosition`:
   `top-left` → `top-2 left-3`; `top-right` → `top-2 right-3`; `right` → `top-1/2 -right-2 translate-x-full -translate-y-1/2` (outside the box, like the book's "Web tier ⟶" captions); `bottom` → `-bottom-6 left-1/2 -translate-x-1/2`.
3. Register `group_box: GroupNode` in `nodeTypes` (this key is intentionally NOT part of `NodeKind` — exclude it from the TASK-019 completeness check by declaring the registry as `Record<NodeKind, unknown> & { group_box: unknown }`).
4. Preview: add a demo — a dashed group node (id `g1`, `position {x:0,y:560}`, `style {width:360,height:160}, zIndex:-1, draggable:false, selectable:false`) with `labelPosition:'right'`, label "Web tier", containing two server nodes with `parentId:'g1'`, `extent:'parent'`, relative positions `{x:40,y:40}` / `{x:200,y:40}`. Add a second filled group ("DC1 US-East") wrapping a server_stack + database_stack if TASK-019 has landed (skip those children otherwise).

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes.
- [ ] The dashed tier box renders BEHIND its child nodes with the label floating outside its right edge.
- [ ] Child nodes move with the canvas as one unit when panning; edges to children still attach correctly.
- [ ] The filled group shows the gray-region look; solid style shows a clean rounded border.
- [ ] Nodes never render underneath the group visually (zIndex -1 on groups only).

## Out of scope
Mapping schema `groups[]` to these nodes (TASK-022), nesting groups inside groups (not in schema v1).
