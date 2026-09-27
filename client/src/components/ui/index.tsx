import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Small mono tag. Tone is semantic only; there is no per-track colour. */
export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warn' | 'success';
  className?: string;
}) {
  const tones = {
    neutral: 'border-line text-ink-muted',
    accent: 'border-accent/40 text-accent',
    warn: 'border-cp/40 text-cp',
    success: 'border-ok/40 text-ok',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-px font-mono text-[11px] leading-5',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Thin progress rule. Complete runs are the only ones that turn green. */
export function ProgressBar({ value, total, className }: { value: number; total: number; className?: string }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div
      className={cn('h-1 w-full overflow-hidden rounded-sm bg-line', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn('h-full', pct === 100 ? 'bg-ok' : 'bg-ink')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-line/60', className)} />;
}

/** A bordered region. Use for things that are genuinely separate objects. */
export function Card({ children, className, style }: { children: ReactNode; className?: string; interactive?: boolean; style?: CSSProperties }) {
  return (
    <div className={cn('rounded-md border border-line bg-raised', className)} style={style}>
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-md border border-dashed border-line px-6 py-10">
      <p className="text-ink-muted">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-faint">{hint}</p>}
    </div>
  );
}
