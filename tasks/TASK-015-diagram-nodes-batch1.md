# TASK-015: React Flow node components — batch 1 (client, server, database, load_balancer)

## Objective
Build the shared `BaseNode` and the first four typed diagram nodes as React Flow custom nodes, plus a dev preview page proving they render.

## Prerequisites
TASK-001 (client scaffold with `@xyflow/react` and `lucide-react` installed). No backend needed.

## Context
Diagrams are stored as JSON (nodes/edges) and rendered read-only with React Flow. Every node type shares one anatomy: an icon in a colored rounded box, a bold label beneath, an optional gray sublabel, an optional circled number badge (top-left), four connection handles, and a visual `state`. This task builds the pattern once; later batches copy it.

## Files to create
```
client/src/components/diagram/nodes/BaseNode.tsx
client/src/components/diagram/nodes/ClientNode.tsx
client/src/components/diagram/nodes/ServerNode.tsx
client/src/components/diagram/nodes/DatabaseNode.tsx
client/src/components/diagram/nodes/LoadBalancerNode.tsx
client/src/components/diagram/nodes/index.ts          (nodeTypes registry)
client/src/pages/DiagramPreviewPage.tsx
```
## Files to modify
```
client/src/App.tsx    (add route /diagram-preview — add react-router BrowserRouter if not present yet)
```

## Data contract — props every node receives

React Flow passes `{ data }`; our node data shape (subset of `DiagramNode` in docs/02 §4):

```ts
export interface DiagramNodeData {
  label: string;
  sublabel?: string;
  badge?: number;                                       // 1..99 → render as ①-style circle
  state?: 'normal' | 'highlighted' | 'failed' | 'dimmed'; // default 'normal'
  [key: string]: unknown;   // React Flow v12 requires index signature on node data
}
```

## Steps

1. **BaseNode.tsx** — a presentational component (NOT registered with React Flow directly):
   ```ts
   interface BaseNodeProps {
     data: DiagramNodeData;
     icon: React.ReactNode;        // a lucide icon element
     accent: string;               // tailwind classes for the icon box, e.g. 'bg-green-100 text-green-700 border-green-600'
   }
   ```
   Render:
   - wrapper `div` `relative flex flex-col items-center w-28` + state classes:
     `highlighted` → `ring-2 ring-blue-500 rounded-lg`; `dimmed` → `opacity-25`; `failed` → `opacity-90`.
   - 4 × `<Handle>` from `@xyflow/react`: `<Handle type="target" position={Position.Top} id="top" />` and likewise `bottom` (type `source`), `left` (target), `right` (source) — all styled invisible: `className="!w-1 !h-1 !bg-transparent !border-0"`. Also add a second Handle per side with the same id suffixed... **No — keep it simple:** React Flow allows one handle per id; use `type="source"` for `right`+`bottom`, `type="target"` for `left`+`top`. Edge JSON authors must pick handles accordingly.
   - icon box: `w-14 h-14 flex items-center justify-center rounded-lg border-2 ${accent}`.
   - `badge`: absolutely positioned top-left circle `-left-2 -top-2 w-5 h-5 rounded-full border border-slate-500 bg-white text-xs flex items-center justify-center`.
   - `failed` state: red ✗ overlay centered on the icon box (`text-red-600 text-3xl font-bold absolute`) + `border-red-500`.
   - label: `text-xs font-semibold text-slate-800 mt-1 text-center`; sublabel: `text-[10px] text-slate-500 text-center`.
2. **Typed nodes** — each ~10 lines, e.g. `ServerNode.tsx`:
   ```tsx
   import { Server } from 'lucide-react';
   import { BaseNode, DiagramNodeData } from './BaseNode';

   export function ServerNode({ data }: { data: DiagramNodeData }) {
     return <BaseNode data={data} icon={<Server size={28} />} accent="bg-green-50 text-green-700 border-green-600" />;
   }
   ```
   | File | lucide icon | accent classes |
   |---|---|---|
   | ClientNode | `Monitor` | `bg-slate-50 text-slate-700 border-slate-500` |
   | ServerNode | `Server` | `bg-green-50 text-green-700 border-green-600` |
   | DatabaseNode | `Database` | `bg-blue-50 text-blue-700 border-blue-600` |
   | LoadBalancerNode | `Network` | `bg-blue-600 text-white border-blue-800` |
3. **index.ts** registry:
   ```ts
   export const nodeTypes = {
     client: ClientNode,
     server: ServerNode,
     database: DatabaseNode,
     load_balancer: LoadBalancerNode,
   } as const;
   ```
4. **DiagramPreviewPage.tsx**: a full-height `<ReactFlow>` (import `@xyflow/react/dist/style.css`) with `nodeTypes`, `fitView`, `nodesDraggable={false}`, `nodesConnectable={false}`, and hard-coded nodes exercising every prop:
   - one of each type in a row (y=0, x = 0/200/400/600)
   - second row: a server with `badge: 1`, a database with `state: 'failed'`, a client with `state: 'dimmed'`, a load balancer with `state: 'highlighted'`, all with sublabels
   - two default edges (client→load_balancer using handles `right`→`left`, load_balancer→server using `bottom`→`top`) to prove handles connect.
5. Route: in `App.tsx` add `<Route path="/diagram-preview" element={<DiagramPreviewPage />} />` (wrap the app in `BrowserRouter` + keep the existing health-check UI as the index route).

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes in `client/`.
- [ ] `http://localhost:5173/diagram-preview` renders 8 nodes with icons, labels, and sublabels; canvas pans/zooms; nodes cannot be dragged.
- [ ] The badge node shows a circled "1"; the failed database shows a red ✗ and red border; the dimmed client is faint; the highlighted LB has a blue ring.
- [ ] Both edges connect at the correct sides of the nodes.
- [ ] No console errors from React Flow (e.g. missing handle ids, unknown node types).

## Out of scope
Other node types (batches 2–3), custom edges (TASK-020), groups (TASK-021), loading JSON specs (TASK-022), the flow stepper (TASK-023).
