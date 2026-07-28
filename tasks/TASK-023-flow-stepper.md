# TASK-023: FlowStepper + DiagramViewer (step-through walkthroughs, viewed tracking)

> ⚠️ **SHIPPED — historical record, not a specification.** The diagram engine is built. Node
> components are grouped by shape rather than one file per kind; see
> [docs/01-architecture.md](../docs/01-architecture.md) and [tasks/README.md](README.md).


## Objective
Build the walkthrough UI: pick a flow, step through it with highlighted edges and narration text, and mark the diagram viewed on completion.

## Prerequisites
TASK-022 (DiagramCanvas with `highlightedEdgeIds`), TASK-010 (`markDiagramViewed`).

## Context
`spec.flows` encodes the book's numbered request narratives. The stepper drives `DiagramCanvas` purely through the `highlightedEdgeIds` prop. `DiagramViewer` is the composition used everywhere from now on (TopicPage, preview).

## Files to create
```
client/src/components/diagram/FlowStepper.tsx
client/src/components/diagram/DiagramViewer.tsx
```
## Files to modify
```
client/src/pages/DiagramPreviewPage.tsx   (replace raw DiagramCanvas usages with DiagramViewer)
```

## Data contracts
```ts
interface FlowStepperProps {
  flows: DiagramFlow[];
  active: { flowId: string; stepIndex: number } | null;   // null = explore mode
  onChange(next: { flowId: string; stepIndex: number } | null): void;
  onFlowCompleted(flowId: string): void;   // fired when Next is pressed on the last step
}

interface DiagramViewerProps {
  spec: InteractiveDiagram;
  diagramId?: number;        // when set, completion triggers markDiagramViewed(diagramId)
  viewed?: boolean;          // initial viewed state (renders the ✓ chip)
}
```

## Steps
1. **FlowStepper** (renders `null` when `flows.length === 0`):
   - Explore mode (`active === null`): row of buttons, one per flow (`Play` icon + `flow.name`), `text-sm border rounded-full px-3 py-1 hover:bg-blue-50`.
   - Active mode: panel `border rounded-lg p-3 bg-slate-50` with:
     - header: flow `name` + "Step {i+1} / {steps.length}" + an ✕ button → `onChange(null)`
     - the current step's `text` (`text-sm text-slate-700 min-h-10`)
     - buttons: "‹ Prev" (disabled at step 0), "Next ›" — on last step the button reads "Finish ✓" and clicking it calls `onFlowCompleted(flowId)` then `onChange(null)`.
   - Keyboard: `useEffect` keydown listener while active — ArrowRight = Next/Finish, ArrowLeft = Prev, Escape = exit. Remove listener on cleanup.
2. **DiagramViewer**: owns `active` state; computes
   `highlightedEdgeIds = active ? new Set(flows.find(f => f.id === active.flowId).steps[active.stepIndex].edgeIds) : null`;
   renders title row (`spec.title`, a green `viewed ✓` chip when viewed), `<DiagramCanvas spec highlightedEdgeIds />`, `<FlowStepper />` beneath, and `spec.description` as small gray text.
   - `onFlowCompleted`: if `diagramId` is set and not already marked this session → `markDiagramViewed(diagramId)` (fire-and-forget with `.catch(console.error)`), set local `viewed` true, call `useAppStore.getState().refreshCurriculum()`.
3. Preview page: both instances become `<DiagramViewer spec={...} />` (no `diagramId` — preview never writes progress). Delete the hard-coded `highlightedEdgeIds` demo.

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes.
- [ ] The example diagram shows a "A user reads data" flow button; starting it highlights `e_dns` only and shows the DNS narration.
- [ ] Next/Prev and ←/→ move through all 5 steps; step 3 highlights BOTH lb→server edges; everything else dims including untouched nodes.
- [ ] Finish exits to explore mode; Escape exits mid-flow; ✕ exits; all restore full brightness.
- [ ] With a real `diagramId` (verify later on the topic page, or via a temporary id): finishing fires exactly one `PUT /api/progress/diagram/:id` (check the network tab), and repeated finishes in one session don't re-fire.
- [ ] A spec without flows renders the canvas with no stepper UI at all.

## Out of scope
Embedding on the topic page and spec fetching (TASK-024), per-step camera panning, autoplay.
