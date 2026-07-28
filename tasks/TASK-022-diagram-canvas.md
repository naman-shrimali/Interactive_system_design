# TASK-022: DiagramCanvas — `InteractiveDiagram` JSON → React Flow

## Objective
Build the read-only canvas component that renders any valid `InteractiveDiagram` spec, including highlight/dim emphasis driven from outside.

## Prerequisites
TASK-019 (full node registry), TASK-020 (LabeledEdge), TASK-021 (GroupNode).

## Context
This is the single translation point between our stored schema (docs/02 §3–4) and React Flow. Rendering constraint carried from BaseNode: schema `sourceHandle` ∈ {bottom, right}, `targetHandle` ∈ {top, left} (the validator from TASK-009 guarantees this for stored specs).

## Files to create
```
client/src/components/diagram/DiagramCanvas.tsx
client/src/components/diagram/specToFlow.ts
```
## Files to modify
```
client/src/pages/DiagramPreviewPage.tsx   (render the committed example spec through the canvas)
```

## Data contract
```ts
interface DiagramCanvasProps {
  spec: InteractiveDiagram;
  highlightedEdgeIds?: Set<string> | null;  // null/undefined = explore mode (no emphasis)
  heightClassName?: string;                 // default 'h-[480px]'
}
```
`specToFlow(spec, highlightedEdgeIds)` → `{ nodes: Node[], edges: Edge[] }` (React Flow types).

## Steps — mapping rules (`specToFlow.ts`)

1. **Groups first** (so they exist before children reference them):
   ```
   for g in spec.groups ?? []:
     { id: g.id, type: 'group_box', position: g.position,
       style: { width: g.size.width, height: g.size.height },
       data: { label: g.label, boxStyle: g.style, labelPosition: g.labelPosition },
       zIndex: -1, draggable: false, selectable: false }
   ```
2. **Nodes**:
   ```
   for n in spec.nodes:
     effectiveState =
       highlightedEdgeIds == null → n.state ?? 'normal'
       else if n.id ∈ touchedNodeIds → (n.state === 'failed' ? 'failed' : 'highlighted' ? no — keep 'normal')
       else → 'dimmed'
     { id: n.id, type: n.type, position: n.position,
       parentId: n.groupId, extent: n.groupId ? 'parent' : undefined,
       data: { label: n.label, sublabel: n.sublabel, badge: n.badge,
               state: effectiveState, tableData: n.tableData },
       draggable: false, connectable: false }
   ```
   where `touchedNodeIds` = union of `source`/`target` of every edge in `highlightedEdgeIds`. Precise emphasis rule: in flow mode, touched nodes keep their authored state (`n.state ?? 'normal'`), untouched nodes become `'dimmed'` (unless authored `'failed'` — failed always shows).
3. **Edges**:
   ```
   arrow = { type: MarkerType.ArrowClosed, width: 18, height: 18, color: EDGE_COLORS[e.color ?? 'blue'] }
   for e in spec.edges:
     { id: e.id, source: e.source, target: e.target,
       sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
       type: 'labeled',
       markerEnd:   direction !== 'none' ? arrow : undefined,
       markerStart: direction === 'both' ? arrow : undefined,
       data: { label: e.label, step: e.step, color: e.color, lineStyle: e.lineStyle,
               emphasis: highlightedEdgeIds == null ? 'normal'
                         : highlightedEdgeIds.has(e.id) ? 'highlighted' : 'dimmed' } }
   ```
   (`direction` default `'forward'`.)
4. **`DiagramCanvas.tsx`**: `useMemo(() => specToFlow(spec, highlightedEdgeIds), [spec, highlightedEdgeIds])`; render
   ```tsx
   <div className={heightClassName + ' w-full border rounded-lg bg-white'}>
     <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
                fitView nodesDraggable={false} nodesConnectable={false}
                elementsSelectable={false} zoomOnScroll panOnDrag minZoom={0.3} maxZoom={2}>
       <Controls showInteractive={false} />
       <Background gap={16} />
     </ReactFlow>
   </div>
   ```
   Import `@xyflow/react/dist/style.css` once here. Keep the React Flow attribution visible (MIT attribution requirement for the free tier).
5. Preview page: import the example spec with `import spec from '../../../content/diagrams/scaling-journey/web-data-tier.json'` — **if** Vite refuses imports outside root, instead copy the file to `client/src/devFixtures/web-data-tier.json` and add a comment that TASK-024 replaces this with server-fetched files. Render `<DiagramCanvas spec={spec as InteractiveDiagram} />` above the node showcase, plus a second instance with `highlightedEdgeIds={new Set(['e_lb'])}` to demo emphasis.

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes.
- [ ] The example diagram renders recognizably: User box (solid) with two clients, DNS right, LB centered, dashed Web tier with 2 servers, dashed Data tier with master/slave, labeled arrows with step circles ①②③, dashed gray "replicate" edge.
- [ ] Arrowheads: `e_dns` has arrows on both ends; all others one end; colors match edge colors.
- [ ] The emphasized instance shows only `e_lb` bright/animated; browser, lb stay normal; everything else dims.
- [ ] Nodes cannot be dragged or selected; canvas pans and zooms; fitView frames the whole diagram on load.
- [ ] Rendering a spec with `flows` but passing no `highlightedEdgeIds` shows plain explore mode (flows are ignored here).

## Out of scope
Flow stepping UI/state (TASK-023), fetching specs from the API (TASK-024), viewed tracking.
