import { cn } from '../../../lib/cn';

export interface GroupNodeData {
  label?: string;
  boxStyle: 'dashed' | 'solid' | 'filled';
  labelPosition?: 'top-left' | 'top-right' | 'right' | 'bottom';
  [key: string]: unknown;
}

const BOX = {
  dashed: 'border-2 border-dashed border-sky-400/70 bg-sky-400/5',
  solid: 'border-2 border-sky-500/70',
  filled: 'border border-line bg-surface',
} as const;

const LABEL = {
  'top-left': 'left-3 top-2',
  'top-right': 'right-3 top-2',
  right: 'top-1/2 -right-2 translate-x-full -translate-y-1/2',
  bottom: '-bottom-6 left-1/2 -translate-x-1/2',
} as const;

/**
 * Container behind its child nodes — the tier and region boxes. Registered as
 * `group_box` rather than React Flow's built-in `group` so all styling stays here.
 */
export function GroupNode({ data }: { data: GroupNodeData }) {
  return (
    <div className={cn('relative h-full w-full rounded-2xl', BOX[data.boxStyle])}>
      {data.label && (
        <span
          className={cn(
            'absolute whitespace-nowrap rounded bg-canvas/85 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted',
            LABEL[data.labelPosition ?? 'top-left'],
          )}
        >
          {data.label}
        </span>
      )}
    </div>
  );
}
