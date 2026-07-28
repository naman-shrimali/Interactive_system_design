import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Badge({
  children,
  tone = 'neutral',
  accent,
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warn' | 'success';
  accent?: string;
  className?: string;
}) {
  const base =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap';
  if (tone === 'accent' && accent) {
    return (
      <span
        className={cn(base, className)}
        style={{
          background: `color-mix(in srgb, ${accent} 14%, transparent)`,
          color: accent,
          border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
        }}
      >
        {children}
      </span>
    );
  }
  const tones = {
    neutral: 'bg-surface text-ink-muted border border-line',
    warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25',
    accent: 'bg-surface text-ink-muted border border-line',
  } as const;
  return <span className={cn(base, tones[tone], className)}>{children}</span>;
}

export function ProgressBar({
  value,
  total,
  accent,
  className,
}: {
  value: number;
  total: number;
  accent?: string;
  className?: string;
}) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div
      className={cn('h-1.5 w-full rounded-full bg-line/70 overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, background: accent ?? 'rgb(var(--ink-faint))' }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-line/60', className)} />;
}

export function Card({
  children,
  className,
  interactive,
  style,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-raised',
        interactive && 'transition-shadow hover:shadow-lift',
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="text-ink-muted">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-faint">{hint}</p>}
    </div>
  );
}
