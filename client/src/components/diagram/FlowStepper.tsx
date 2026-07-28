import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import type { DiagramFlow } from '../../types';

export interface ActiveFlow {
  flowId: string;
  stepIndex: number;
}

export function FlowStepper({
  flows,
  active,
  onChange,
  onFlowCompleted,
}: {
  flows: DiagramFlow[];
  active: ActiveFlow | null;
  onChange: (next: ActiveFlow | null) => void;
  onFlowCompleted: (flowId: string) => void;
}) {
  const flow = active ? flows.find((f) => f.id === active.flowId) : undefined;
  const isLast = flow ? active!.stepIndex >= flow.steps.length - 1 : false;

  useEffect(() => {
    if (!flow || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (isLast) {
          onFlowCompleted(flow.id);
          onChange(null);
        } else {
          onChange({ flowId: flow.id, stepIndex: active.stepIndex + 1 });
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (active.stepIndex > 0) onChange({ flowId: flow.id, stepIndex: active.stepIndex - 1 });
      } else if (e.key === 'Escape') {
        onChange(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flow, active, isLast, onChange, onFlowCompleted]);

  if (flows.length === 0) return null;

  if (!active || !flow) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {flows.map((f) => (
          <button
            key={f.id}
            onClick={() => onChange({ flowId: f.id, stepIndex: 0 })}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <Play size={11} style={{ color: 'var(--accent)' }} />
            {f.name}
          </button>
        ))}
      </div>
    );
  }

  const step = flow.steps[active.stepIndex];

  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12px] font-semibold text-ink">{flow.name}</span>
        <span className="text-[11px] tabular-nums text-ink-faint">
          Step {active.stepIndex + 1} / {flow.steps.length}
        </span>
        <button
          onClick={() => onChange(null)}
          aria-label="Exit walkthrough"
          className="ml-auto rounded p-1 text-ink-faint hover:text-ink"
        >
          <X size={13} />
        </button>
      </div>

      <p className="min-h-10 text-[13px] leading-relaxed text-ink-muted">{step.text}</p>

      <div className="mt-2 flex items-center gap-2">
        <button
          disabled={active.stepIndex === 0}
          onClick={() => onChange({ flowId: flow.id, stepIndex: active.stepIndex - 1 })}
          className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-[12px] text-ink-muted disabled:opacity-40"
        >
          <ChevronLeft size={12} /> Prev
        </button>
        <button
          onClick={() => {
            if (isLast) {
              onFlowCompleted(flow.id);
              onChange(null);
            } else {
              onChange({ flowId: flow.id, stepIndex: active.stepIndex + 1 });
            }
          }}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          {isLast ? 'Finish ✓' : <>Next <ChevronRight size={12} /></>}
        </button>
        <span className="ml-auto hidden text-[10px] text-ink-faint sm:inline">← → to step</span>
      </div>
    </div>
  );
}
