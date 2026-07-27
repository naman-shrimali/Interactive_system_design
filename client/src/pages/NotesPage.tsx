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

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!notes) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">My notes</h1>
      {notes.length === 0 ? (
        <p className="text-slate-400">No notes yet — open any section and write one.</p>
      ) : (
        <ul className="space-y-6">
          {notes.map((note) => (
            <li key={note.id} className="border border-slate-200 rounded-lg p-4">
              <Link
                to={note.anchorType === 'chapter' ? `/chapters/${note.anchorId}` : `/sections/${note.anchorId}`}
                className="text-sm text-blue-700 hover:underline"
              >
                {note.anchorTitle}
              </Link>
              <div className="mt-2">
                <MarkdownView markdown={note.contentMarkdown} />
              </div>
              <div className="mt-2 text-xs text-slate-400">
                {new Date(note.updatedAt.replace(' ', 'T') + 'Z').toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
