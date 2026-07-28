import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { fetchAllNotes } from '../api/client';
import { MarkdownView } from '../components/reader/MarkdownView';
import type { NoteWithAnchor } from '../types';

function formatUpdatedAt(updatedAt: string): string {
  return new Date(updatedAt.replace(' ', 'T') + 'Z').toLocaleString();
}

function exportNotesAsMarkdown(notes: NoteWithAnchor[]): void {
  const today = new Date().toISOString().slice(0, 10);
  const body = notes
    .map(
      (n) =>
        `## ${n.anchorTitle}\n\n${n.contentMarkdown.trim()}\n\n_Last updated: ${formatUpdatedAt(n.updatedAt)}_\n`,
    )
    .join('\n---\n\n');
  const doc = `# My notes — Interactive System Design\n\nExported ${today}\n\n---\n\n${body}`;

  const blob = new Blob([doc], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `my-notes-${today}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">My notes</h1>
        {notes.length > 0 && (
          <button
            onClick={() => exportNotesAsMarkdown(notes)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] text-ink-muted hover:bg-surface hover:text-ink"
          >
            <Download size={13} />
            Export
          </button>
        )}
      </div>
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
                {formatUpdatedAt(note.updatedAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
