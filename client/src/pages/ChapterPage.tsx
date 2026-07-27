import { useMemo } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { NotesPanel } from '../components/reader/NotesPanel';
import type { CurriculumSection } from '../types';

function StatusBadge({ status }: { status: CurriculumSection['progressStatus'] }) {
  if (status === 'completed') return <CheckCircle2 size={14} className="text-green-600" />;
  if (status === 'in_progress') return <Circle size={10} className="text-blue-500 fill-blue-500" />;
  return <Circle size={12} className="text-slate-300" />;
}

export function ChapterPage() {
  const { id } = useParams<{ id: string }>();
  const chapterId = Number(id);
  const curriculum = useAppStore((s) => s.curriculum);

  const found = useMemo(() => {
    for (const src of curriculum ?? [])
      for (const ch of src.chapters) if (ch.id === chapterId) return { src, ch };
    return null;
  }, [curriculum, chapterId]);

  if (!curriculum) return <div className="p-8 text-slate-400">Loading…</div>;
  if (!found) return <div className="p-8 text-slate-500">Chapter not found.</div>;

  const { src, ch } = found;
  return (
    <div className="max-w-3xl mx-auto p-8">
      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
        {src.kind === 'repo' ? 'Primer' : 'Book'}
      </span>
      <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-2">{ch.title}</h1>
      {ch.description && <p className="text-slate-500 mb-6">{ch.description}</p>}

      <h2 className="text-sm font-semibold text-slate-700 mb-2">Sections</h2>
      <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100">
        {ch.sections.map((section) => (
          <li key={section.id}>
            <NavLink
              to={`/sections/${section.id}`}
              className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-slate-700"
            >
              <StatusBadge status={section.progressStatus} />
              <span>{section.title}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <NotesPanel anchor={{ chapterId }} />
    </div>
  );
}
