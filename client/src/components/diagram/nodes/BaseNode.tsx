import type { ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '../../../lib/cn';

/**
 * Node data as it reaches React Flow. Mirrors DiagramNode in types.ts minus the
 * fields the canvas consumes itself (type, position, groupId).
 */
export interface DiagramNodeData {
  label: string;
  sublabel?: string;
  badge?: number;
  state?: 'normal' | 'highlighted' | 'failed' | 'dimmed';
  tableData?: { columns: string[]; rows: string[][] };
  [key: string]: unknown;
}

/**
 * Every node exposes the same four connection points: sources on bottom/right,
 * targets on top/left. Diagram authors must respect that (the validator enforces
 * it) — it keeps edge routing predictable without per-node handle config.
 */
export function NodeHandles() {
  const style = '!h-1 !w-1 !min-w-0 !min-h-0 !border-0 !bg-transparent';
  return (
    <>
      <Handle id="top" type="target" position={Position.Top} className={style} />
      <Handle id="left" type="target" position={Position.Left} className={style} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={style} />
      <Handle id="right" type="source" position={Position.Right} className={style} />
    </>
  );
}

export function stateWrapperClass(state: DiagramNodeData['state']): string {
  return cn(
    'transition-opacity',
    state === 'dimmed' && 'opacity-20',
    state === 'highlighted' && 'drop-shadow-[0_0_10px_rgb(var(--accent))]',
  );
}

export function Badge({ n }: { n: number }) {
  return (
    <span className="absolute -left-1.5 -top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-raised text-[9px] font-semibold tabular-nums text-ink">
      {n}
    </span>
  );
}

export interface BaseNodeProps {
  data: DiagramNodeData;
  icon: ReactNode;
  /** Tailwind colour classes for the icon box, e.g. 'border-emerald-500 text-emerald-500'. */
  accent: string;
  /** Replaces the default w-14 h-14 sizing when set. */
  iconBoxClassName?: string;
  /** Draws two offset ghost boxes behind the icon — the "cluster" idiom. */
  stacked?: boolean;
}

export function BaseNode({ data, icon, accent, iconBoxClassName, stacked }: BaseNodeProps) {
  const state = data.state ?? 'normal';
  const failed = state === 'failed';

  return (
    <div className={cn('relative flex w-28 flex-col items-center', stateWrapperClass(state))}>
      {data.badge !== undefined && <Badge n={data.badge} />}
      <NodeHandles />

      <div className="relative">
        {stacked && (
          <>
            <span
              aria-hidden="true"
              className={cn(
                'absolute rounded-md border-2 bg-raised opacity-40',
                iconBoxClassName ?? 'h-14 w-14',
                accent,
              )}
              style={{ transform: 'translate(10px, -10px)' }}
            />
            <span
              aria-hidden="true"
              className={cn(
                'absolute rounded-md border-2 bg-raised opacity-70',
                iconBoxClassName ?? 'h-14 w-14',
                accent,
              )}
              style={{ transform: 'translate(5px, -5px)' }}
            />
          </>
        )}
        <div
          className={cn(
            'relative flex items-center justify-center rounded-md border-2 bg-raised',
            iconBoxClassName ?? 'h-14 w-14',
            failed ? 'border-red-500 text-red-500' : accent,
          )}
        >
          {icon}
          {failed && (
            <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-red-500">
              ✕
            </span>
          )}
        </div>
      </div>

      <span className="mt-1.5 text-center text-[11px] font-semibold leading-tight text-ink">
        {data.label}
      </span>
      {data.sublabel && (
        <span className="text-center text-[10px] leading-tight text-ink-faint">{data.sublabel}</span>
      )}
    </div>
  );
}
