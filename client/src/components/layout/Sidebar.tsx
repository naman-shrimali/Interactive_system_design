import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { scenariosFor } from '../../sim/registry';
import { cn } from '../../lib/cn';
import { Skeleton } from '../ui';
import type { CurriculumTopic } from '../../types';

function topicDone(t: CurriculumTopic): boolean {
  return t.sectionCount > 0 && t.sectionsCompleted === t.sectionCount;
}

/** Status as shape, not colour alone: empty, half, full. */
export function StatusMark({ topic }: { topic: CurriculumTopic }) {
  const done = topicDone(topic);
  const started = topic.sectionsCompleted > 0;
  return (
    <span
      className={cn(
        'relative inline-block h-2 w-2 shrink-0 overflow-hidden rounded-[1px] border',
        done ? 'border-ok bg-ok' : started ? 'border-ink-muted' : 'border-ink-faint/60',
      )}
      aria-label={done ? 'complete' : started ? 'in progress' : 'not started'}
      role="img"
    >
      {!done && started && <span className="absolute inset-y-0 left-0 w-1/2 bg-ink-muted" />}
    </span>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const curriculum = useAppStore((s) => s.curriculum);
  const error = useAppStore((s) => s.curriculumError);
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggle = (slug: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-[17rem] shrink-0 overflow-y-auto border-r border-line bg-canvas',
          'transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Curriculum"
      >
        <div className="flex items-center justify-between px-4 py-3 lg:hidden">
          <span className="label">Curriculum</span>
          <button onClick={onClose} aria-label="Close navigation" className="p-1 text-ink-muted">
            <X size={18} />
          </button>
        </div>

        {error && <p className="px-4 py-3 text-sm text-fail">{error}</p>}

        {!curriculum && !error && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        )}

        <div className="py-3">
          {curriculum?.map((track) => {
            const isOpen = !collapsed.has(track.slug);
            const done = track.topics.filter(topicDone).length;
            return (
              <section key={track.id} className="mb-2 px-2">
                <button
                  onClick={() => toggle(track.slug)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left hover:bg-surface"
                >
                  <ChevronRight size={12} className={cn('shrink-0 text-ink-faint transition-transform', isOpen && 'rotate-90')} />
                  <span className="label flex-1 truncate text-ink-muted">{track.title}</span>
                  <span className="font-mono text-[11px] tabular-nums text-ink-faint">
                    {done}/{track.topics.length}
                  </span>
                </button>

                {isOpen && (
                  <ul className="mt-0.5">
                    {track.topics.map((topic) => {
                      const hasScenario = scenariosFor(topic.slug).length > 0;
                      return (
                        <li key={topic.id}>
                          <NavLink
                            to={`/topics/${topic.slug}`}
                            className={({ isActive }) =>
                              cn(
                                'flex items-center gap-2.5 border-l-2 py-[5px] pl-[18px] pr-2 text-[13.5px]',
                                isActive ? 'border-ink bg-surface font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink',
                              )
                            }
                          >
                            <StatusMark topic={topic} />
                            <span className="min-w-0 flex-1 truncate">{topic.title}</span>
                            {hasScenario && (
                              <span className="font-mono text-[9.5px] font-semibold tracking-[0.08em] text-accent" title="Has a step-through scenario">
                                RUN
                              </span>
                            )}
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
        <p className="px-5 pb-6 pt-2 text-[11px] leading-relaxed text-ink-faint">
          Primer text: MIT © Donne Martin. Original prose, scenarios and diagrams by this project.
        </p>
      </aside>
    </>
  );
}
