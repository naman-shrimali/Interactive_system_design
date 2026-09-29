import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DiagramFigure } from '../components/diagram/DiagramFigure';
import { fetchDiagramFile, fetchDiagramFiles } from '../api/client';
import { EmptyState, Skeleton } from '../components/ui';
import type { InteractiveDiagram } from '../types';

/**
 * Authoring loop: pick a file from content/diagrams/, render it, edit the JSON on
 * disk, reload. Never passes diagramId, so previewing never writes progress.
 */
export function DiagramPreviewPage() {
  const [files, setFiles] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [spec, setSpec] = useState<InteractiveDiagram | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDiagramFiles()
      .then((f) => {
        setFiles(f);
        if (f.length > 0) setSelected(f[0]);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const load = (name: string) => {
    if (!name) return;
    setError(null);
    setSpec(null);
    fetchDiagramFile(name)
      .then(setSpec)
      .catch((e) => setError((e as Error).message));
  };

  useEffect(() => {
    if (selected) load(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Diagram preview</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Renders files straight from <code className="font-mono text-[12px]">content/diagrams/</code>.
        Edit the JSON on disk and hit reload.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md border border-line bg-raised px-3 py-2 text-sm text-ink"
        >
          {(files ?? []).map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          onClick={() => load(selected)}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm text-ink-muted hover:bg-surface"
        >
          <RefreshCw size={13} /> Reload file
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 text-red-500">{error}</div>
      )}
      {files?.length === 0 && (
        <EmptyState
          title="No diagram files yet."
          hint="Add one at content/diagrams/<topicSlug>/<slug>.json, then run npm run validate:diagrams."
        />
      )}
      {!spec && !error && files && files.length > 0 && <Skeleton className="h-[420px]" />}
      {spec && <DiagramFigure spec={spec} />}
    </div>
  );
}
