import { Router } from 'express';
import { z } from 'zod';
import { db, USER_ID } from '../db';
import type { Note, NoteWithAnchor } from '../types';

export const notesRouter = Router();

interface NoteRow {
  id: number;
  topic_id: number | null;
  section_id: number | null;
  content_markdown: string;
  created_at: string;
  updated_at: string;
}
function toNote(r: NoteRow): Note {
  return {
    id: r.id,
    topicId: r.topic_id,
    sectionId: r.section_id,
    contentMarkdown: r.content_markdown,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const createSchema = z
  .object({
    sectionId: z.number().int().positive().optional(),
    topicId: z.number().int().positive().optional(),
    contentMarkdown: z.string().min(1),
  })
  .refine((b) => (b.sectionId === undefined) !== (b.topicId === undefined), {
    message: 'provide exactly one of sectionId / topicId',
  });
const updateSchema = z.object({ contentMarkdown: z.string().min(1) });

// --- GET /notes/all (must be registered before parameterized routes) ---
interface AllRow extends NoteRow {
  topic_title: string | null;
  topic_slug: string | null;
  section_title: string | null;
  section_topic_title: string | null;
  section_topic_slug: string | null;
}
notesRouter.get('/notes/all', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT n.id, n.topic_id, n.section_id, n.content_markdown, n.created_at, n.updated_at,
              tp.title  AS topic_title,
              tp.slug   AS topic_slug,
              sec.title AS section_title,
              stp.title AS section_topic_title,
              stp.slug  AS section_topic_slug
       FROM notes n
       LEFT JOIN topics tp    ON tp.id  = n.topic_id
       LEFT JOIN sections sec ON sec.id = n.section_id
       LEFT JOIN topics stp   ON stp.id = sec.topic_id
       WHERE n.user_id = ?
       ORDER BY n.updated_at DESC`,
    )
    .all(USER_ID) as AllRow[];

  const notes: NoteWithAnchor[] = rows.map((r) => {
    if (r.section_id !== null) {
      return {
        ...toNote(r),
        anchorType: 'section',
        anchorTitle: `${r.section_topic_title} › ${r.section_title}`,
        anchorTopicSlug: r.section_topic_slug ?? '',
      };
    }
    return {
      ...toNote(r),
      anchorType: 'topic',
      anchorTitle: r.topic_title ?? '',
      anchorTopicSlug: r.topic_slug ?? '',
    };
  });
  res.json({ notes });
});

// --- GET /notes?sectionId= | ?topicId= ---
notesRouter.get('/notes', (req, res) => {
  const hasSection = req.query.sectionId !== undefined;
  const hasTopic = req.query.topicId !== undefined;
  if (hasSection === hasTopic) {
    return res.status(400).json({ error: 'provide exactly one of sectionId / topicId' });
  }
  const raw = (hasSection ? req.query.sectionId : req.query.topicId) as string;
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  const col = hasSection ? 'section_id' : 'topic_id';
  const rows = db
    .prepare(`SELECT * FROM notes WHERE user_id = ? AND ${col} = ? ORDER BY updated_at DESC`)
    .all(USER_ID, id) as NoteRow[];
  res.json({ notes: rows.map(toNote) });
});

// --- POST /notes ---
notesRouter.post('/notes', (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  const { sectionId, topicId, contentMarkdown } = body.data;

  if (sectionId !== undefined && db.prepare(`SELECT 1 FROM sections WHERE id = ?`).get(sectionId) === undefined) {
    return res.status(404).json({ error: 'section not found' });
  }
  if (topicId !== undefined && db.prepare(`SELECT 1 FROM topics WHERE id = ?`).get(topicId) === undefined) {
    return res.status(404).json({ error: 'topic not found' });
  }

  const info = db
    .prepare(
      `INSERT INTO notes (user_id, topic_id, section_id, content_markdown)
       VALUES (?, ?, ?, ?)`,
    )
    .run(USER_ID, topicId ?? null, sectionId ?? null, contentMarkdown);
  const row = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(info.lastInsertRowid) as NoteRow;
  res.status(201).json(toNote(row));
});

// --- PUT /notes/:id ---
notesRouter.put('/notes/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const body = updateSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });

  const info = db
    .prepare(`UPDATE notes SET content_markdown = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(body.data.contentMarkdown, id, USER_ID);
  if (info.changes === 0) return res.status(404).json({ error: 'note not found' });
  const row = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as NoteRow;
  res.json(toNote(row));
});

// --- DELETE /notes/:id ---
notesRouter.delete('/notes/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const info = db.prepare(`DELETE FROM notes WHERE id = ? AND user_id = ?`).run(id, USER_ID);
  if (info.changes === 0) return res.status(404).json({ error: 'note not found' });
  res.json({ ok: true });
});
