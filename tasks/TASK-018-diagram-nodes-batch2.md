# TASK-018: React Flow node components — batch 2 (dns, cdn, cache, nosql, message_queue)

## Objective
Add five more typed diagram nodes following the batch-1 pattern, including the arrow-shaped message-queue box.

## Prerequisites
TASK-015 (BaseNode, registry, preview page exist).

## Context
Same anatomy as batch 1: each node is ~10 lines delegating to `BaseNode`. One extension is needed: `BaseNode` must accept an optional class override for the icon box so the message queue can be wider and arrow-shaped.

## Files to create
```
client/src/components/diagram/nodes/DnsNode.tsx
client/src/components/diagram/nodes/CdnNode.tsx
client/src/components/diagram/nodes/CacheNode.tsx
client/src/components/diagram/nodes/NosqlNode.tsx
client/src/components/diagram/nodes/MessageQueueNode.tsx
```
## Files to modify
```
client/src/components/diagram/nodes/BaseNode.tsx    (add prop)
client/src/components/diagram/nodes/index.ts        (register 5 types)
client/src/pages/DiagramPreviewPage.tsx             (add a showcase row)
```

## Data contract
`BaseNode` gains one optional prop (default keeps batch-1 rendering identical):
```ts
interface BaseNodeProps {
  data: DiagramNodeData;
  icon: React.ReactNode;
  accent: string;
  iconBoxClassName?: string;   // REPLACES the default "w-14 h-14" sizing classes when provided
}
```

| Node file | registry key | lucide icon | accent classes | iconBoxClassName |
|---|---|---|---|---|
| DnsNode | `dns` | `Globe` | `bg-slate-50 text-slate-600 border-slate-500` | — |
| CdnNode | `cdn` | `Cloud` | `bg-sky-50 text-sky-600 border-sky-400` | — |
| CacheNode | `cache` | `Zap` | `bg-blue-50 text-blue-600 border-blue-500` | — |
| NosqlNode | `nosql` | `Braces` | `bg-blue-50 text-blue-800 border-blue-700` | — |
| MessageQueueNode | `message_queue` | `Mail` | `bg-blue-50 text-blue-700 border-blue-600` | `w-24 h-12 [clip-path:polygon(0%_0%,85%_0%,100%_50%,85%_100%,0%_100%)]` |

## Steps
1. `BaseNode`: split the icon box classes so sizing (`w-14 h-14`) comes from `iconBoxClassName ?? 'w-14 h-14'` while the shared classes (`flex items-center justify-center rounded-lg border-2` + accent) always apply. Verify batch-1 nodes render unchanged.
2. Create the five components (copy `ServerNode.tsx`, swap icon/accent per the table).
3. Extend `nodeTypes` in `index.ts` with the five keys above (keys must match the `NodeKind` strings exactly).
4. Preview page: add a third row (y = 400) with one of each new node, all with labels matching the book vocabulary ("DNS", "CDN", "Cache", "NoSQL", "Message Queue"), the message queue with `badge: 1`.

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes.
- [ ] `/diagram-preview` shows the new row: globe, cloud, bolt, braces icons and an arrow-shaped queue box with a right-pointing tip.
- [ ] Batch-1 nodes are pixel-identical to before (BaseNode change is backward-compatible).
- [ ] Every new node shows all four handle positions connectable in principle (add one edge dns→cdn in the preview to prove handles resolve).
- [ ] No React Flow console warnings about unknown node types.

## Out of scope
Stacked variants, service/text_box/table (TASK-019), custom edges (TASK-020).
