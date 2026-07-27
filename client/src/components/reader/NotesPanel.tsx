import { useEffect, useState } from 'react';
import { StickyNote } from 'lucide-react';
import { MarkdownView } from './MarkdownView';
import { fetchNotes, createNote, updateNote, deleteNote } from '../../api/client';
import type { Note } from '../../types';

type NotesAnchor = { sectionId: number } | { chapterId: number };

export function NotesPanel({ anchor }: { anchor: NotesAnchor }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const anchorKey = JSON.stringify(anchor);
  useEffect(() => {
    let alive = true;
    fetchNotes(anchor)
      .then((n) => alive && setNotes(n))
      .catch(() => alive && setNotes([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey]);

  const guard = async (fn: () => Promise<void>) => {
    try {
      setBusy(true);
      await fn();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    guard(async () => {
      const created = await createNote({ ...anchor, contentMarkdown: draft });
      setNotes((prev) => [created, ...prev]);
      setDraft('');
    });

  const save = (id: number) =>
    guard(async () => {
      const updated = await updateNote(id, editDraft);
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      setEditingId(null);
    });

  const remove = (id: number) =>
    guard(async () => {
      if (!window.confirm('Delete this note?')) return;
      await deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    });

  return (
    <section className="border border-slate-200 rounded-lg p-4 mt-8">
      <div className="flex items-center gap-2 mb-3">
        <StickyNote size={16} className="text-slate-500" />
        <h2 className="font-semibold text-slate-800">My notes</h2>
        <span className="ml-auto text-sm text-slate-500">{notes.length}</span>
      </div>

      <div className="mb-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="Write a note in markdown…"
          className="w-full border border-slate-300 rounded p-2 font-mono text-sm"
        />
        <button
          onClick={add}
          disabled={busy || draft.trim() === ''}
          className="mt-2 px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          Add note
        </button>
      </div>

      <ul className="space-y-4">
        {notes.map((note) => (
          <li key={note.id} className="border-t border-slate-100 pt-3">
            {editingId === note.id ? (
              <>
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={4}
                  className="w-full border border-slate-300 rounded p-2 font-mono text-sm"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => save(note.id)}
                    disabled={busy || editDraft.trim() === ''}
                    className="px-2 py-1 rounded bg-green-600 text-white text-xs disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-2 py-1 rounded border text-xs text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <MarkdownView markdown={note.contentMarkdown} />
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                  <span>{new Date(note.updatedAt.replace(' ', 'T') + 'Z').toLocaleString()}</span>
                  <button
                    onClick={() => {
                      setEditingId(note.id);
                      setEditDraft(note.contentMarkdown);
                    }}
                    className="hover:text-slate-700"
                  >
                    Edit
                  </button>
                  <button onClick={() => remove(note.id)} className="hover:text-red-600">
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
