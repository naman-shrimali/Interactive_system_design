# TASK-020: LabeledEdge component (color / dash / step badge / emphasis)

> ⚠️ **SHIPPED — historical record, not a specification.** The diagram engine is built. Node
> components are grouped by shape rather than one file per kind; see
> [docs/01-architecture.md](../docs/01-architecture.md) and [tasks/README.md](README.md).


## Objective
Build the single custom edge type that renders every edge style in the diagram schema: semantic colors, dashed lines, the circled-step + label pill, and highlight/dim emphasis for the flow stepper.

## Prerequisites
TASK-015 (preview page). Independent of TASK-018/019.

## Context
Every edge in every diagram uses this one component (registered as type `labeled`). Arrowheads are NOT drawn here — the canvas mapping (TASK-022) sets React Flow `markerEnd`/`markerStart` on the edge object from the schema's `direction` field; this component just passes them through.

## Files to create
```
client/src/components/diagram/edges/LabeledEdge.tsx
client/src/components/diagram/edges/index.ts        (export const edgeTypes = { labeled: LabeledEdge })
```
## Files to modify
```
client/src/pages/DiagramPreviewPage.tsx     (use edgeTypes; restyle showcase edges)
```

## Data contract
```ts
export const EDGE_COLORS = {
  blue: '#2563eb', green: '#16a34a', purple: '#7c3aed', red: '#dc2626', gray: '#94a3b8',
} as const;

export interface LabeledEdgeData {
  label?: string;
  step?: number;                                   // 1..99 → circled number in the pill
  color?: keyof typeof EDGE_COLORS;                // default 'blue'
  lineStyle?: 'solid' | 'dashed';                  // default 'solid'
  emphasis?: 'normal' | 'highlighted' | 'dimmed';  // default 'normal' (driven by FlowStepper)
  [key: string]: unknown;
}
```

## Steps
1. Component skeleton:
   ```tsx
   import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

   export function LabeledEdge(props: EdgeProps) {
     const data = (props.data ?? {}) as LabeledEdgeData;
     const [path, labelX, labelY] = getBezierPath({
       sourceX: props.sourceX, sourceY: props.sourceY, sourcePosition: props.sourcePosition,
       targetX: props.targetX, targetY: props.targetY, targetPosition: props.targetPosition,
     });
     // styles below, then:
     return (
       <>
         <BaseEdge id={props.id} path={path} style={edgeStyle}
                   markerEnd={props.markerEnd} markerStart={props.markerStart} />
         {(data.label || data.step) && (
           <EdgeLabelRenderer>{/* pill positioned at labelX/labelY */}</EdgeLabelRenderer>
         )}
       </>
     );
   }
   ```
2. `edgeStyle` from data:
   - `stroke: EDGE_COLORS[data.color ?? 'blue']`
   - `strokeWidth`: highlighted `2.5`, otherwise `1.5`
   - `opacity`: dimmed `0.15`, otherwise `1`
   - `strokeDasharray`: `'6 4'` when `lineStyle === 'dashed'` OR when highlighted (highlight also sets CSS `animation: dash 0.5s linear infinite` — add the `@keyframes dash { to { stroke-dashoffset: -10 } }` to `index.css`).
3. Pill inside `EdgeLabelRenderer`: absolutely positioned `translate(-50%,-50%) translate(labelX px, labelY px)`, `pointer-events: none`, classes `flex items-center gap-1 bg-white/90 border border-slate-300 rounded-full px-2 py-0.5 text-[10px] text-slate-700`; dimmed emphasis → `opacity-15`. When `step` is set, prepend a `w-4 h-4 rounded-full border border-slate-500 flex items-center justify-center font-semibold` circle with the number (the book's ① style).
4. Preview page: register `edgeTypes`, convert the existing showcase edges to `type: 'labeled'` and add four demo edges exercising: green label, purple dashed, red with `step: 1` + label, gray dimmed.

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes.
- [ ] Preview shows: colored edges matching the hex table, a dashed edge, a pill with circled "1" + text centered on its edge, and a barely-visible dimmed edge.
- [ ] Temporarily setting one edge's `emphasis: 'highlighted'` shows a thicker animated marching-ants line (then keep one demo edge highlighted in the showcase).
- [ ] Labels stay centered when panning/zooming.
- [ ] No console warnings about unknown edge type.

## Out of scope
Arrowhead direction logic (TASK-022 sets markers), flow stepping state (TASK-023).
