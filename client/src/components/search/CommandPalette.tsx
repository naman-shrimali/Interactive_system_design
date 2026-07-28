import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, CornerDownLeft } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../lib/cn';
import type { CurriculumTopic, CurriculumTrack } from '../../types';

interface Hit {
  topic: CurriculumTopic;
  track: CurriculumTrack;
}

function score(topic: CurriculumTopic, track: CurriculumTrack, query: string): number {
  const q = query.toLowerCase();
  const title = topic.title.toLowerCase();
  const summary = topic.summary.toLowerCase();
  const trackTitle = track.title.toLowerCase();
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (trackTitle.includes(q)) return 30;
  if (summary.includes(q)) return 20;
  return 0;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const curriculum = useAppStore((s) => s.curriculum);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      // Focus after the modal has mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    if (!curriculum) return [];
    const all: Hit[] = curriculum.flatMap((track) =>
      track.topics.map((topic) => ({ topic, track })),
    );
    if (query.trim() === '') return all.slice(0, 8);
    return all
      .map((hit) => ({ hit, s: score(hit.topic, hit.track, query.trim()) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.hit);
  }, [curriculum, query]);

  useEffect(() => setActiveIdx(0), [query]);

  const go = (hit: Hit) => {
    navigate(`/topics/${hit.topic.slug}`);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits[activeIdx]) go(hits[activeIdx]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-raised shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={16} className="shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a topic…"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close search"
            className="rounded p-1 text-ink-faint hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {!curriculum && <div className="px-3 py-6 text-center text-sm text-ink-faint">Loading…</div>}
          {curriculum && hits.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-ink-faint">
              No topics match "{query}"
            </div>
          )}
          {hits.map((hit, i) => (
            <button
              key={hit.topic.id}
              onClick={() => go(hit)}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left',
                i === activeIdx ? 'bg-surface' : 'hover:bg-surface',
              )}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: hit.track.accent }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">
                  {hit.topic.title}
                </span>
                <span className="block truncate text-[11px] text-ink-faint">{hit.track.title}</span>
              </span>
              {i === activeIdx && <CornerDownLeft size={12} className="shrink-0 text-ink-faint" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
