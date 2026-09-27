import { useEffect, useState } from 'react';
import { DiagramViewer } from './DiagramViewer';
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
      <div className="my-6 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-[13px] text-red-500">
        Could not load diagram “{meta.title}”: {error}
      </div>
    );
  }
  if (!spec) return <Skeleton className="my-6 h-[420px]" />;

  return <DiagramViewer spec={spec} diagramId={meta.id} viewed={meta.viewed} />;
}
