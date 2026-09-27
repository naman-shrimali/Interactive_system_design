import { useState } from 'react';
import { setSectionProgress } from '../../api/client';
import { cn } from '../../lib/cn';
import type { ProgressStatus } from '../../types';

const OPTIONS: { value: ProgressStatus; label: string }[] = [
  { value: 'not_started', label: 'To do' },
  { value: 'in_progress', label: 'Reading' },
  { value: 'completed', label: 'Done' },
];

/** Segmented control. Done is the only state that earns colour. */
export function ProgressControls({
  sectionId,
  status,
  onChanged,
}: {
  sectionId: number;
  status: ProgressStatus;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  const onSet = async (next: ProgressStatus) => {
    if (next === status || busy) return;
    setBusy(true);
    try {
      await setSectionProgress(sectionId, next);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="inline-flex shrink-0 overflow-hidden rounded border border-line font-mono text-[11.5px]"
      role="radiogroup"
      aria-label="Section progress"
    >
      {OPTIONS.map((o, i) => {
        const active = o.value === status;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            disabled={busy}
            onClick={() => onSet(o.value)}
            className={cn(
              'px-2.5 py-1 disabled:opacity-60',
              i > 0 && 'border-l border-line',
              !active && 'text-ink-faint hover:bg-surface hover:text-ink',
              active && o.value === 'completed' && 'bg-ok text-white',
              active && o.value !== 'completed' && 'bg-surface text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
