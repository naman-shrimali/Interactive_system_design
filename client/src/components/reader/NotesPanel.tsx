import { useEffect, useState } from 'react';
import { StickyNote } from 'lucide-react';
import { MarkdownView } from './MarkdownView';
import { fetchNotes, createNote, updateNote, deleteNote } from '../../api/client';
import type { Note } from '../../types';

type NotesAnchor = { sectionId: number } | { topicId: number };

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
    <section id="notes" className="mt-6 scroll-mt-20 rounded-md border border-line bg-raised p-5">
      <div className="mb-4 flex items-center gap-2">
        <StickyNote size={15} className="text-ink-faint" />
        <h2 className="font-semibold tracking-tight">My notes</h2>
        <span className="ml-auto text-[12px] tabular-nums text-ink-faint">{notes.length}</span>
      </div>

      <div className="mb-5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="Write a note in markdown…"
          className="w-full rounded-md border border-line bg-canvas p-3 font-mono text-[13px] text-ink placeholder:text-ink-faint"
        />
        <button
          onClick={add}
          disabled={busy || draft.trim() === ''}
          className="mt-2 rounded bg-ink px-4 py-1.5 font-mono text-[12.5px] font-medium text-canvas disabled:opacity-50"
        >
          Add note
        </button>
      </div>

      <ul className="space-y-4">
        {notes.map((note) => (
          <li key={note.id} className="border-t border-line pt-3">
            {editingId === note.id ? (
              <>
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-line bg-canvas p-3 font-mono text-[13px] text-ink placeholder:text-ink-faint"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => save(note.id)}
                    disabled={busy || editDraft.trim() === ''}
                    className="rounded bg-ok px-3 py-1 text-[12px] text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded border border-line px-3 py-1 text-[12px] text-ink-muted"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <MarkdownView markdown={note.contentMarkdown} />
                <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-faint">
                  <span>{new Date(note.updatedAt.replace(' ', 'T') + 'Z').toLocaleString()}</span>
                  <button
                    onClick={() => {
                      setEditingId(note.id);
                      setEditDraft(note.contentMarkdown);
                    }}
                    className="hover:text-ink"
                  >
                    Edit
                  </button>
                  <button onClick={() => remove(note.id)} className="hover:text-red-500">
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
