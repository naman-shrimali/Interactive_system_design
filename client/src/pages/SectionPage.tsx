import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchSection } from '../api/client';
import type { SectionDetail } from '../types';
import { MarkdownView } from '../components/reader/MarkdownView';
import { ProgressControls } from '../components/reader/ProgressControls';
import { LinksPanel } from '../components/reader/LinksPanel';
import { NotesPanel } from '../components/reader/NotesPanel';

type Phase =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; section: SectionDetail };

export function SectionPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<Phase>({ phase: 'loading' });

  useEffect(() => {
    const sectionId = Number(id);
    setState({ phase: 'loading' });
    let alive = true;
    fetchSection(sectionId)
      .then((section) => alive && setState({ phase: 'ready', section }))
      .catch((e) => alive && setState({ phase: 'error', message: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.phase === 'loading')
    return <div className="p-8 text-slate-400">Loading…</div>;
  if (state.phase === 'error')
    return <div className="p-8"><div className="border border-red-200 bg-red-50 text-red-700 rounded p-3">{state.message}</div></div>;

  const { section } = state;
  return (
    <article className="max-w-3xl mx-auto p-8">
      <div className="text-xs text-slate-400 mb-2">
        {section.sourceSlug === 'primer' ? 'Primer' : 'Book'} › {section.chapterTitle} › {section.title}
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-3">{section.title}</h1>
      <div className="mb-6">
        <ProgressControls sectionId={section.id} />
      </div>

      {section.contentMarkdown.trim() ? (
        <MarkdownView markdown={section.contentMarkdown} />
      ) : (
        <p className="italic text-slate-400">
          No text content — this book section is diagram-driven. Original summaries only; see the
          interactive diagrams below.
        </p>
      )}

      {/* TASK-024: diagrams */}

      <LinksPanel links={section.links} />

      <NotesPanel anchor={{ sectionId: section.id }} />

      {section.sourceUrl && (
        <footer className="mt-10 pt-4 border-t border-slate-200 text-xs text-slate-400">
          Source:{' '}
          <a
            href={section.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            system-design-primer
          </a>{' '}
          (MIT © Donne Martin)
        </footer>
      )}
    </article>
  );
}
