import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronRight, CheckCircle2, Circle, Workflow, Link as LinkIcon } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { CurriculumSection } from '../../types';

function StatusBadge({ status }: { status: CurriculumSection['progressStatus'] }) {
  if (status === 'completed') return <CheckCircle2 size={14} className="text-green-600 shrink-0" />;
  if (status === 'in_progress')
    return <Circle size={10} className="text-blue-500 fill-blue-500 shrink-0" />;
  return <Circle size={12} className="text-slate-300 shrink-0" />;
}

export function Sidebar() {
  const curriculum = useAppStore((s) => s.curriculum);
  const error = useAppStore((s) => s.curriculumError);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['src-1', 'src-2']),
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  if (error) return <aside className="w-80 shrink-0 border-r p-4 text-sm text-red-600">{error}</aside>;
  if (!curriculum)
    return <aside className="w-80 shrink-0 border-r p-4 text-sm text-slate-400">Loading…</aside>;

  return (
    <aside className="w-80 shrink-0 border-r border-slate-200 h-full overflow-y-auto bg-slate-50/50">
      {curriculum.map((source) => {
        const srcKey = `src-${source.id}`;
        const srcOpen = expanded.has(srcKey);
        return (
          <div key={source.id} className="py-1">
            <button
              onClick={() => toggle(srcKey)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
            >
              <ChevronRight
                size={14}
                className={`shrink-0 transition-transform ${srcOpen ? 'rotate-90' : ''}`}
              />
              <span className="font-semibold text-slate-800 text-sm flex-1">{source.title}</span>
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                {source.kind}
              </span>
            </button>
            {srcOpen &&
              source.chapters.map((chapter) => {
                const chKey = `ch-${chapter.id}`;
                const chOpen = expanded.has(chKey);
                const done = chapter.sections.filter((s) => s.progressStatus === 'completed').length;
                const total = chapter.sections.length;
                const pct = total === 0 ? 0 : (done / total) * 100;
                return (
                  <div key={chapter.id}>
                    <div className="flex items-center pl-6 pr-3">
                      <button
                        onClick={() => toggle(chKey)}
                        className="p-1 shrink-0"
                        aria-label="toggle chapter"
                      >
                        <ChevronRight
                          size={13}
                          className={`transition-transform text-slate-400 ${chOpen ? 'rotate-90' : ''}`}
                        />
                      </button>
                      <NavLink
                        to={`/chapters/${chapter.id}`}
                        className={({ isActive }) =>
                          `flex-1 min-w-0 py-1.5 text-sm ${isActive ? 'text-blue-800 font-medium' : 'text-slate-700'}`
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate">{chapter.title}</span>
                          <span className="ml-auto text-[10px] text-slate-400 shrink-0">
                            {done}/{total}
                          </span>
                        </div>
                        <div className="h-1 rounded bg-slate-200 mt-1">
                          <div className="h-1 rounded bg-green-500" style={{ width: `${pct}%` }} />
                        </div>
                      </NavLink>
                    </div>
                    {chOpen &&
                      chapter.sections.map((section) => (
                        <NavLink
                          key={section.id}
                          to={`/sections/${section.id}`}
                          className={({ isActive }) =>
                            `flex items-center gap-2 pl-14 pr-3 py-1.5 text-sm ${
                              isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-100'
                            }`
                          }
                        >
                          <StatusBadge status={section.progressStatus} />
                          <span className="truncate flex-1">{section.title}</span>
                          {section.diagramCount > 0 && (
                            <Workflow size={12} className="text-blue-400 shrink-0" />
                          )}
                          {section.linkCount > 0 && (
                            <LinkIcon size={12} className="text-slate-400 shrink-0" />
                          )}
                        </NavLink>
                      ))}
                  </div>
                );
              })}
          </div>
        );
      })}
    </aside>
  );
}
