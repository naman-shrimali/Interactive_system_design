import { useState } from 'react';
import { setSectionProgress } from '../../api/client';
import { cn } from '../../lib/cn';
import type { ProgressStatus } from '../../types';

const OPTIONS: { value: ProgressStatus; label: string }[] = [
  { value: 'not_started', label: 'To do' },
  { value: 'in_progress', label: 'Reading' },
  { value: 'completed', label: 'Done' },
];

export function ProgressControls({
  sectionId,
  status,
  accent,
  onChanged,
}: {
  sectionId: number;
  status: ProgressStatus;
  accent: string;
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
    <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-line text-[12px]">
      {OPTIONS.map((o) => {
        const active = o.value === status;
        return (
          <button
            key={o.value}
            disabled={busy}
            onClick={() => onSet(o.value)}
            className={cn(
              'px-3 py-1 transition-colors disabled:opacity-60',
              !active && 'text-ink-muted hover:bg-surface',
            )}
            style={
              active
                ? o.value === 'completed'
                  ? { background: accent, color: '#fff' }
                  : { background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }
                : undefined
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
