import { useMemo } from 'react';
import { Background, Controls, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges/LabeledEdge';
import { specToFlow } from './specToFlow';
import { cn } from '../../lib/cn';
import type { InteractiveDiagram } from '../../types';

export function DiagramCanvas({
  spec,
  highlightedEdgeIds,
  heightClassName = 'h-[min(70vh,560px)]',
}: {
  spec: InteractiveDiagram;
  highlightedEdgeIds?: Set<string> | null;
  heightClassName?: string;
}) {
  const { nodes, edges } = useMemo(
    () => specToFlow(spec, highlightedEdgeIds),
    [spec, highlightedEdgeIds],
  );

  return (
    <div className={cn('w-full overflow-hidden rounded-2xl border border-line bg-surface', heightClassName)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: false }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Controls showInteractive={false} className="!shadow-none" />
        <Background gap={18} size={1} className="opacity-40" />
      </ReactFlow>
    </div>
  );
}
