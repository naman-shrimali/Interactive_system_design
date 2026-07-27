import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, CheckCircle2, Circle, Workflow, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../lib/cn';
import { Skeleton, ProgressBar } from '../ui';
import type { CurriculumTopic } from '../../types';

function topicDone(t: CurriculumTopic): boolean {
  return t.sectionCount > 0 && t.sectionsCompleted === t.sectionCount;
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
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-[19rem] shrink-0 overflow-y-auto border-r border-line bg-surface',
          'transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 lg:hidden">
          <span className="text-sm font-semibold">Curriculum</span>
          <button onClick={onClose} aria-label="Close navigation" className="p-1 text-ink-muted">
            <X size={18} />
          </button>
        </div>

        {error && <p className="px-4 py-3 text-sm text-red-500">{error}</p>}

        {!curriculum && !error && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        )}

        {curriculum?.map((track) => {
          const isOpen = !collapsed.has(track.slug);
          const done = track.topics.filter(topicDone).length;
          return (
            <section key={track.id} className="px-3 py-2">
              <button
                onClick={() => toggle(track.slug)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-raised"
              >
                <ChevronRight
                  size={13}
                  className={cn('shrink-0 text-ink-faint transition-transform', isOpen && 'rotate-90')}
                />
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: track.accent }}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate text-[13px] font-semibold tracking-tight">
                  {track.title}
                </span>
                <span className="text-[11px] tabular-nums text-ink-faint">
                  {done}/{track.topics.length}
                </span>
              </button>

              {isOpen && (
                <ul className="mt-1 space-y-0.5">
                  {track.topics.map((topic) => (
                    <li key={topic.id}>
                      <NavLink
                        to={`/topics/${topic.slug}`}
                        className={({ isActive }) =>
                          cn(
                            'group flex items-start gap-2 rounded-lg py-1.5 pl-7 pr-2 text-[13px]',
                            isActive
                              ? 'bg-raised font-medium text-ink shadow-card'
                              : 'text-ink-muted hover:bg-raised/70',
                          )
                        }
                        style={({ isActive }) =>
                          isActive
                            ? { boxShadow: `inset 2px 0 0 ${track.accent}` }
                            : undefined
                        }
                      >
                        <span className="mt-[3px] shrink-0">
                          {topicDone(topic) ? (
                            <CheckCircle2 size={13} className="text-emerald-500" />
                          ) : topic.sectionsCompleted > 0 ? (
                            <Circle size={9} className="fill-current" style={{ color: track.accent }} />
                          ) : (
                            <Circle size={11} className="text-ink-faint/50" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{topic.title}</span>
                          {topic.sectionCount > 0 && topic.sectionsCompleted > 0 && !topicDone(topic) && (
                            <ProgressBar
                              className="mt-1 h-1"
                              value={topic.sectionsCompleted}
                              total={topic.sectionCount}
                              accent={track.accent}
                            />
                          )}
                        </span>
                        {topic.diagramCount > 0 && (
                          <Workflow size={11} className="mt-1 shrink-0 text-ink-faint" />
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        <div className="px-5 pb-6 pt-2 text-[11px] leading-relaxed text-ink-faint">
          Primer text: MIT © Donne Martin. Original material and diagrams by this project.
        </div>
      </aside>
    </>
  );
}
