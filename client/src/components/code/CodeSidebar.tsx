import { useEffect, useMemo, useState } from 'react';
import { Code2, X, ChevronLeft, ChevronRight, Server, Quote } from 'lucide-react';
import { fetchCodeWalkthrough } from '../../api/client';
import { Skeleton } from '../ui';
import { cn } from '../../lib/cn';
import type { CodeWalkthrough, CodeWalkthroughMeta } from '../../types';

/**
 * Minimal JS/TS highlighter. Deliberately regex-based and dependency-free — these
 * are short whiteboard snippets, not an editor. Comments and strings are matched
 * first so keywords inside them are not re-coloured.
 */
function highlight(code: string): string {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /(\/\/[^\n]*|(?<!\w)--[^\n]*)|(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|\b(const|let|function|return|if|else|async|await|new|for|of|throw|try|catch)\b|\b(\d+(?:\.\d+)?)\b/g,
    (m, comment, str, kw, num) => {
      if (comment) return `<span class="text-ink-faint italic">${comment}</span>`;
      if (str) return `<span class="text-emerald-500">${str}</span>`;
      if (kw) return `<span class="text-violet-500 font-medium">${kw}</span>`;
      if (num) return `<span class="text-amber-500">${num}</span>`;
      return m;
    },
  );
}

export function CodeSidebar({
  meta,
  open,
  onClose,
}: {
  meta: CodeWalkthroughMeta;
  open: boolean;
  onClose: () => void;
}) {
  const [spec, setSpec] = useState<CodeWalkthrough | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open || spec || error) return;
    fetchCodeWalkthrough(meta.id)
      .then((d) => setSpec(d.spec))
      .catch((e) => setError((e as Error).message));
  }, [open, meta.id, spec, error]);

  const total = spec?.steps.length ?? 0;
  const step = spec?.steps[idx];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setIdx((i) => Math.min(i + 1, total - 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, total, onClose]);

  const lang = useMemo(() => step?.language ?? spec?.language ?? 'javascript', [step, spec]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-line bg-raised"
        role="dialog"
        aria-label="Code walkthrough"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <Code2 size={17} className="mt-0.5 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold leading-snug">{spec?.title ?? meta.title}</h2>
            {spec?.intro && <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{spec.intro}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-faint hover:text-ink">
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!spec && !error && (
            <div className="space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-40" />
            </div>
          )}

          {step && (
            <div key={idx} className="">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line font-mono text-[11px] font-semibold text-ink"
                >
                  {idx + 1}
                </span>
                <h3 className="text-[14px] font-semibold leading-snug">{step.title}</h3>
              </div>

              {step.kind === 'infra' ? (
                <div className="mb-4 flex gap-3 rounded-md border border-dashed border-line bg-surface p-4">
                  <Server size={15} className="mt-0.5 shrink-0 text-ink-faint" />
                  <p className="text-[13px] leading-relaxed text-ink-muted">
                    <span className="font-medium text-ink">No code here.</span> {step.explain}
                  </p>
                </div>
              ) : (
                <>
                  <pre className="mb-3 overflow-x-auto rounded-md border border-line bg-surface p-4 text-[12px] leading-relaxed">
                    <code
                      className="font-mono text-ink"
                      dangerouslySetInnerHTML={{ __html: highlight(step.code ?? '') }}
                    />
                  </pre>
                  <p className="text-[13px] leading-relaxed text-ink-muted">{step.explain}</p>
                </>
              )}

              {step.saysOutLoud && (
                <div
                  className="mt-3 flex gap-2 rounded-md p-3"
                  style={{ background: 'rgb(var(--accent) / 0.08)' }}
                >
                  <Quote size={13} className="mt-0.5 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
                  <p className="text-[13px] italic leading-relaxed text-ink">“{step.saysOutLoud}”</p>
                </div>
              )}

              {idx === total - 1 && spec?.closing && (
                <div className="mt-4 rounded-md border border-line p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    If they push further
                  </p>
                  <p className="text-[13px] leading-relaxed text-ink-muted">{spec.closing}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {spec && (
          <footer className="flex items-center gap-2 border-t border-line px-5 py-3">
            <button
              disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(i - 1, 0))}
              className="inline-flex items-center gap-1 rounded border border-line px-3 py-1.5 font-mono text-[12px] text-ink-muted disabled:opacity-40"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <div className="flex flex-1 items-center gap-1" aria-hidden="true">
              {spec.steps.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  title={s.title}
                  className={cn('h-1 flex-1 rounded-sm transition-colors')}
                  style={{ background: i <= idx ? 'rgb(var(--ink))' : 'rgb(var(--line))' }}
                />
              ))}
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
              {idx + 1}/{total}
            </span>
            <button
              disabled={idx >= total - 1}
              onClick={() => setIdx((i) => Math.min(i + 1, total - 1))}
              className="inline-flex items-center gap-1 rounded bg-ink px-3 py-1.5 font-mono text-[12px] font-medium text-canvas disabled:opacity-40"
            >
              Next <ChevronRight size={12} />
            </button>
          </footer>
        )}
        <span className="sr-only">{lang}</span>
      </aside>
    </>
  );
}
