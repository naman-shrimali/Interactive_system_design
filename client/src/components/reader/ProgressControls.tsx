import { useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { setSectionProgress } from '../../api/client';
import type { ProgressStatus } from '../../types';

const OPTIONS: { value: ProgressStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

function activeClasses(status: ProgressStatus): string {
  if (status === 'in_progress') return 'bg-blue-600 text-white';
  if (status === 'completed') return 'bg-green-600 text-white';
  return 'bg-slate-200 text-slate-700';
}

export function ProgressControls({ sectionId }: { sectionId: number }) {
  const curriculum = useAppStore((s) => s.curriculum);
  const refresh = useAppStore((s) => s.refreshCurriculum);
  const [busy, setBusy] = useState(false);

  const current = useMemo<ProgressStatus>(() => {
    for (const src of curriculum ?? [])
      for (const ch of src.chapters)
        for (const sec of ch.sections) if (sec.id === sectionId) return sec.progressStatus;
    return 'not_started';
  }, [curriculum, sectionId]);

  const onSet = async (status: ProgressStatus) => {
    if (status === current || busy) return;
    setBusy(true);
    try {
      await setSectionProgress(sectionId, status);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
      {OPTIONS.map((o) => {
        const isActive = o.value === current;
        return (
          <button
            key={o.value}
            disabled={busy}
            onClick={() => onSet(o.value)}
            className={`px-3 py-1.5 border-r border-slate-200 last:border-r-0 disabled:opacity-60 ${
              isActive ? activeClasses(o.value) : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
