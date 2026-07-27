import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAllNotes } from '../api/client';
import { MarkdownView } from '../components/reader/MarkdownView';
import type { NoteWithAnchor } from '../types';

export function NotesPage() {
  const [notes, setNotes] = useState<NoteWithAnchor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllNotes()
      .then(setNotes)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!notes) return <div className="p-8 text-ink-faint">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">My notes</h1>
      {notes.length === 0 ? (
        <p className="text-ink-faint">No notes yet — open any section and write one.</p>
      ) : (
        <ul className="space-y-6">
          {notes.map((note) => (
            <li key={note.id} className="rounded-2xl border border-line bg-raised p-5">
              <Link
                to={`/topics/${note.anchorTopicSlug}`}
                className="text-[13px] text-sky-500 hover:underline"
              >
                {note.anchorTitle}
              </Link>
              <div className="mt-2">
                <MarkdownView markdown={note.contentMarkdown} />
              </div>
              <div className="mt-2 text-[11px] text-ink-faint">
                {new Date(note.updatedAt.replace(' ', 'T') + 'Z').toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
