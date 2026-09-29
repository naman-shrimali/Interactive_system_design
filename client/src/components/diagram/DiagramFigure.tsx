import { useMemo, useRef, useState } from 'react';
import { ScenarioPlayer } from '../../sim/Player';
import { diagramScenario } from '../../sim/fromDiagram';
import { markDiagramViewed } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { InteractiveDiagram } from '../../types';

/**
 * An authored diagram, drawn by the scenario engine at a fixed, legible scale.
 * Each walkthrough is a step-through; reaching the last step of any of them
 * marks the diagram viewed (omit diagramId, as the preview page does, to skip).
 */
export function DiagramFigure({
  spec,
  diagramId,
  viewed = false,
}: {
  spec: InteractiveDiagram;
  diagramId?: number;
  viewed?: boolean;
}) {
  const scenario = useMemo(() => diagramScenario(spec), [spec]);
  const [isViewed, setIsViewed] = useState(viewed);
  const marked = useRef(viewed);
  const flows = spec.flows?.length ?? 0;

  const onStep = (step: number, total: number) => {
    if (diagramId === undefined || marked.current || total < 2 || step !== total - 1) return;
    marked.current = true;
    setIsViewed(true);
    markDiagramViewed(diagramId)
      .then(() => useAppStore.getState().refreshCurriculum())
      .catch((e) => console.error('failed to mark diagram viewed', e));
  };

  return (
    <figure className="my-8">
      <ScenarioPlayer
        scenario={scenario}
        onStep={onStep}
        minScale={0.85}
        maxScale={1.1}
        crumb={
          <span className="text-scope-ink">
            {spec.title}
            {isViewed && <span className="ml-2 text-scope-ok">· viewed</span>}
          </span>
        }
      />
      <figcaption className="mt-2.5 flex flex-wrap gap-x-3 text-[13px] text-ink-faint">
        {spec.description && <span className="max-w-prose">{spec.description}</span>}
        {flows > 0 && (
          <span className="font-mono text-[12px]">
            {flows} {flows === 1 ? 'walkthrough' : 'walkthroughs'}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
