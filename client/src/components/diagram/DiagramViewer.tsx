import { useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { DiagramCanvas } from './DiagramCanvas';
import { FlowStepper, type ActiveFlow } from './FlowStepper';
import { markDiagramViewed } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { InteractiveDiagram } from '../../types';

export function DiagramViewer({
  spec,
  diagramId,
  viewed = false,
}: {
  spec: InteractiveDiagram;
  /** When set, finishing a walkthrough marks the diagram viewed. Omit in preview. */
  diagramId?: number;
  viewed?: boolean;
}) {
  const [active, setActive] = useState<ActiveFlow | null>(null);
  const [isViewed, setIsViewed] = useState(viewed);
  const marked = useRef(viewed);

  const flows = spec.flows ?? [];

  const highlightedEdgeIds = useMemo(() => {
    if (!active) return null;
    const flow = flows.find((f) => f.id === active.flowId);
    const step = flow?.steps[active.stepIndex];
    return step ? new Set(step.edgeIds) : null;
  }, [active, flows]);

  const onFlowCompleted = () => {
    if (diagramId === undefined || marked.current) return;
    marked.current = true;
    setIsViewed(true);
    markDiagramViewed(diagramId)
      .then(() => useAppStore.getState().refreshCurriculum())
      .catch((e) => console.error('failed to mark diagram viewed', e));
  };

  return (
    <figure className="my-6">
      <figcaption className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">{spec.title}</span>
        {isViewed && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <Check size={10} /> Viewed
          </span>
        )}
      </figcaption>

      <DiagramCanvas spec={spec} highlightedEdgeIds={highlightedEdgeIds} />

      <FlowStepper
        flows={flows}
        active={active}
        onChange={setActive}
        onFlowCompleted={onFlowCompleted}
      />

      {spec.description && !active && (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">{spec.description}</p>
      )}
    </figure>
  );
}
