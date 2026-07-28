import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { EDGE_COLORS } from './edges/LabeledEdge';
import type { InteractiveDiagram } from '../../types';

/**
 * The single translation point between the stored diagram schema and React Flow.
 *
 * `highlightedEdgeIds` drives flow mode: those edges are emphasised, every other
 * edge and every node not touched by them is dimmed. Pass null for explore mode.
 */
export function specToFlow(
  spec: InteractiveDiagram,
  highlightedEdgeIds?: Set<string> | null,
): { nodes: Node[]; edges: Edge[] } {
  const flowMode = highlightedEdgeIds != null;

  // Nodes at either end of a highlighted edge stay lit.
  const touched = new Set<string>();
  if (flowMode) {
    for (const e of spec.edges) {
      if (highlightedEdgeIds!.has(e.id)) {
        touched.add(e.source);
        touched.add(e.target);
      }
    }
  }

  // Groups first so children can reference them as parents.
  const groupNodes: Node[] = (spec.groups ?? []).map((g) => ({
    id: g.id,
    type: 'group_box',
    position: g.position,
    style: { width: g.size.width, height: g.size.height },
    data: { label: g.label, boxStyle: g.style, labelPosition: g.labelPosition },
    zIndex: -1,
    draggable: false,
    selectable: false,
    connectable: false,
  }));

  const nodes: Node[] = spec.nodes.map((n) => {
    const authored = n.state ?? 'normal';
    const state = !flowMode || authored === 'failed' ? authored : touched.has(n.id) ? authored : 'dimmed';
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      ...(n.groupId ? { parentId: n.groupId, extent: 'parent' as const } : {}),
      data: {
        label: n.label,
        sublabel: n.sublabel,
        badge: n.badge,
        state,
        tableData: n.tableData,
      },
      draggable: false,
      connectable: false,
      selectable: false,
    };
  });

  const edges: Edge[] = spec.edges.map((e) => {
    const color = EDGE_COLORS[e.color ?? 'blue'];
    const arrow = { type: MarkerType.ArrowClosed, width: 16, height: 16, color };
    const direction = e.direction ?? 'forward';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: 'labeled',
      ...(direction !== 'none' ? { markerEnd: arrow } : {}),
      ...(direction === 'both' ? { markerStart: arrow } : {}),
      data: {
        label: e.label,
        step: e.step,
        color: e.color,
        lineStyle: e.lineStyle,
        emphasis: !flowMode ? 'normal' : highlightedEdgeIds!.has(e.id) ? 'highlighted' : 'dimmed',
      },
    };
  });

  return { nodes: [...groupNodes, ...nodes], edges };
}
