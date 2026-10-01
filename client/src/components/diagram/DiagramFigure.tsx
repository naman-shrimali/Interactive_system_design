import { useEffect, useMemo, useRef, useState } from 'react';
import { ScenarioPlayer } from '../../sim/Player';
import { Stage } from '../../sim/Stage';
import { diagramScenario } from '../../sim/fromDiagram';
import { markDiagramViewed } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { DiagramFlow, InteractiveDiagram } from '../../types';

/**
 * An authored diagram, drawn by the scenario engine at a fixed, legible scale.
 *
 * Path flows (a request followed hop by hop) are step-throughs. Notes flows
 * (commentary about the picture) are listed under it, because stepping through
 * an argument teaches nothing that reading it doesn't. A diagram with no path
 * flows is a still figure: no transport, since there is nothing to play.
 *
 * Reaching the last step of a walkthrough — or, for a still figure, seeing it —
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
  const paths = (spec.flows ?? []).filter((f) => f.kind !== 'notes');
  const notes = (spec.flows ?? []).filter((f) => f.kind === 'notes');
  const [isViewed, setIsViewed] = useState(viewed);
  const marked = useRef(viewed);

  const markViewed = () => {
    if (diagramId === undefined || marked.current) return;
    marked.current = true;
    setIsViewed(true);
    markDiagramViewed(diagramId)
      .then(() => useAppStore.getState().refreshCurriculum())
      .catch((e) => console.error('failed to mark diagram viewed', e));
  };

  const onStep = (step: number, total: number) => {
    if (total >= 2 && step === total - 1) markViewed();
  };

  const title = (
    <span className="text-scope-ink">
      {spec.title}
      {isViewed && <span className="ml-2 text-scope-ok">· viewed</span>}
    </span>
  );

  return (
    <figure className="my-8">
      {paths.length > 0 ? (
        <ScenarioPlayer scenario={scenario} onStep={onStep} minScale={0.85} maxScale={1.1} crumb={title} />
      ) : (
        <StillFigure scenario={scenario} title={title} onSeen={markViewed} />
      )}
      <figcaption className="mt-2.5 flex flex-wrap gap-x-3 text-[13px] text-ink-faint">
        {spec.description && <span className="max-w-prose">{spec.description}</span>}
        {paths.length > 0 && (
          <span className="font-mono text-[12px]">
            {paths.length} {paths.length === 1 ? 'walkthrough' : 'walkthroughs'}
          </span>
        )}
      </figcaption>
      {notes.length > 0 && <Notes flows={notes} />}
    </figure>
  );
}

/** The diagram as a picture: same stage and frame styling as the player, without the transport. */
function StillFigure({
  scenario,
  title,
  onSeen,
}: {
  scenario: ReturnType<typeof diagramScenario>;
  title: React.ReactNode;
  onSeen: () => void;
}) {
  const frame = useMemo(() => scenario.run({})[0], [scenario]);
  const ref = useRef<HTMLDivElement | null>(null);
  const seen = useRef(onSeen);
  seen.current = onSeen;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // Counts as viewed once most of it has been on screen.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.intersectionRatio >= 0.6)) {
          seen.current();
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="overflow-hidden rounded-md border border-scope-line bg-scope text-[13px] text-scope-ink">
      <div className="border-b border-scope-line bg-scope-2 px-3 py-2.5 font-mono text-[12px]">{title}</div>
      <div className="relative overflow-x-auto">
        <Stage spec={scenario.stage} frame={frame} animate={false} speed={1} minScale={0.85} maxScale={1.1} />
      </div>
    </div>
  );
}

/** Commentary flows, read rather than stepped: one short numbered list per flow. */
function Notes({ flows }: { flows: DiagramFlow[] }) {
  return (
    <div className="mt-5 grid gap-5">
      {flows.map((f) => (
        <section key={f.id} aria-label={f.name}>
          <h4 className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink-faint">{f.name}</h4>
          <ol className="mt-2 max-w-prose list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-muted marker:font-mono marker:text-[12px] marker:text-ink-faint">
            {f.steps.map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
