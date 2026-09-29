import { useEffect, useState } from 'react';
import { DiagramFigure } from './DiagramFigure';
import { fetchDiagram } from '../../api/client';
import { Skeleton } from '../ui';
import type { DiagramMeta, InteractiveDiagram } from '../../types';

/** Fetches one diagram's spec on mount, then hands it to the viewer. */
export function SectionDiagram({ meta }: { meta: DiagramMeta }) {
  const [spec, setSpec] = useState<InteractiveDiagram | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchDiagram(meta.id)
      .then((d) => alive && setSpec(d.spec))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [meta.id]);

  if (error) {
    return (
      <div className="my-8 rounded border border-fail/30 bg-fail/5 p-3 text-[13px] text-fail">
        Could not load diagram “{meta.title}”: {error}
      </div>
    );
  }
  if (!spec) return <Skeleton className="my-8 h-[420px]" />;

  return <DiagramFigure spec={spec} diagramId={meta.id} viewed={meta.viewed} />;
}
