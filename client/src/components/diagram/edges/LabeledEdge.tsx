import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

export const EDGE_COLORS = {
  blue: '#3b82f6',
  green: '#10b981',
  purple: '#8b5cf6',
  red: '#ef4444',
  gray: '#94a3b8',
} as const;

export type EdgeColor = keyof typeof EDGE_COLORS;

export interface LabeledEdgeData {
  label?: string;
  step?: number;
  color?: EdgeColor;
  lineStyle?: 'solid' | 'dashed';
  emphasis?: 'normal' | 'highlighted' | 'dimmed';
  [key: string]: unknown;
}

export function LabeledEdge(props: EdgeProps) {
  const data = (props.data ?? {}) as LabeledEdgeData;
  const emphasis = data.emphasis ?? 'normal';
  const stroke = EDGE_COLORS[data.color ?? 'blue'];

  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  const highlighted = emphasis === 'highlighted';
  const dimmed = emphasis === 'dimmed';

  const style: React.CSSProperties = {
    stroke,
    strokeWidth: highlighted ? 2.5 : 1.5,
    opacity: dimmed ? 0.12 : 1,
    ...(data.lineStyle === 'dashed' || highlighted
      ? { strokeDasharray: '6 4', ...(highlighted ? { animation: 'dash 0.5s linear infinite' } : {}) }
      : {}),
  };

  const hasLabel = Boolean(data.label) || data.step !== undefined;

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={style}
        markerEnd={props.markerEnd}
        markerStart={props.markerStart}
      />
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute flex items-center gap-1 rounded-full border border-line bg-canvas/90 px-1.5 py-0.5 text-[9px] text-ink-muted backdrop-blur-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity: dimmed ? 0.12 : 1,
              ...(highlighted ? { borderColor: stroke, color: stroke } : {}),
            }}
          >
            {data.step !== undefined && (
              <span
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                style={{ background: stroke }}
              >
                {data.step}
              </span>
            )}
            {data.label && <span className="whitespace-nowrap">{data.label}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { labeled: LabeledEdge };
