import { Router } from 'express';
import { z } from 'zod';
import { db, USER_ID } from '../db';
import type { ProgressSummaryTrack } from '../types';

export const progressRouter = Router();

const EXISTS_TABLE = { section: 'sections', link: 'external_links', diagram: 'diagrams' } as const;

function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}
function exists(kind: keyof typeof EXISTS_TABLE, id: number): boolean {
  const table = EXISTS_TABLE[kind]; // whitelisted table name — never user input
  return db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id) !== undefined;
}

const upsertSection = db.prepare(`
  INSERT INTO section_progress (user_id, section_id, status, updated_at)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT(user_id, section_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
`);
const upsertLink = db.prepare(`
  INSERT INTO link_progress (user_id, link_id, completed, updated_at)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT(user_id, link_id) DO UPDATE SET completed = excluded.completed, updated_at = excluded.updated_at
`);
const upsertDiagram = db.prepare(`
  INSERT INTO diagram_progress (user_id, diagram_id, viewed, updated_at)
  VALUES (?, ?, 1, datetime('now'))
  ON CONFLICT(user_id, diagram_id) DO UPDATE SET viewed = 1, updated_at = excluded.updated_at
`);

const sectionSchema = z.object({ status: z.enum(['not_started', 'in_progress', 'completed']) });
const linkSchema = z.object({ completed: z.boolean() });
const diagramSchema = z.object({ viewed: z.literal(true) });

progressRouter.put('/progress/section/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'invalid id' });
  const body = sectionSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  if (!exists('section', id)) return res.status(404).json({ error: 'section not found' });
  upsertSection.run(USER_ID, id, body.data.status);
  res.json({ ok: true });
});

progressRouter.put('/progress/link/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'invalid id' });
  const body = linkSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  if (!exists('link', id)) return res.status(404).json({ error: 'link not found' });
  upsertLink.run(USER_ID, id, body.data.completed ? 1 : 0);
  res.json({ ok: true });
});

progressRouter.put('/progress/diagram/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'invalid id' });
  const body = diagramSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0].message });
  if (!exists('diagram', id)) return res.status(404).json({ error: 'diagram not found' });
  upsertDiagram.run(USER_ID, id);
  res.json({ ok: true });
});

interface SummaryRow {
  slug: string;
  title: string;
  accent: string;
  topics_total: number;
  topics_completed: number;
  sections_total: number;
  sections_completed: number;
  links_total: number;
  links_completed: number;
  diagrams_total: number;
  diagrams_viewed: number;
}

progressRouter.get('/progress/summary', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT tr.slug, tr.title, tr.accent,
        (SELECT COUNT(*) FROM topics tp WHERE tp.track_id = tr.id) AS topics_total,
        -- a topic counts as complete when it has sections and all of them are complete
        (SELECT COUNT(*) FROM topics tp
          WHERE tp.track_id = tr.id
            AND (SELECT COUNT(*) FROM sections s WHERE s.topic_id = tp.id) > 0
            AND (SELECT COUNT(*) FROM sections s WHERE s.topic_id = tp.id)
              = (SELECT COUNT(*) FROM sections s
                   JOIN section_progress sp ON sp.section_id = s.id
                    AND sp.user_id = ? AND sp.status = 'completed'
                 WHERE s.topic_id = tp.id)) AS topics_completed,
        (SELECT COUNT(*) FROM sections s JOIN topics tp ON s.topic_id = tp.id
          WHERE tp.track_id = tr.id) AS sections_total,
        (SELECT COUNT(*) FROM sections s JOIN topics tp ON s.topic_id = tp.id
          JOIN section_progress sp ON sp.section_id = s.id AND sp.user_id = ? AND sp.status = 'completed'
          WHERE tp.track_id = tr.id) AS sections_completed,
        (SELECT COUNT(*) FROM external_links el JOIN topics tp ON el.topic_id = tp.id
          WHERE tp.track_id = tr.id) AS links_total,
        (SELECT COUNT(*) FROM external_links el JOIN topics tp ON el.topic_id = tp.id
          JOIN link_progress lp ON lp.link_id = el.id AND lp.user_id = ? AND lp.completed = 1
          WHERE tp.track_id = tr.id) AS links_completed,
        (SELECT COUNT(*) FROM diagrams d JOIN topics tp ON d.topic_id = tp.id
          WHERE tp.track_id = tr.id) AS diagrams_total,
        (SELECT COUNT(*) FROM diagrams d JOIN topics tp ON d.topic_id = tp.id
          JOIN diagram_progress dp ON dp.diagram_id = d.id AND dp.user_id = ? AND dp.viewed = 1
          WHERE tp.track_id = tr.id) AS diagrams_viewed
      FROM tracks tr ORDER BY tr.sort_order`,
    )
    .all(USER_ID, USER_ID, USER_ID, USER_ID) as SummaryRow[];

  const tracks: ProgressSummaryTrack[] = rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    accent: r.accent,
    topicsTotal: r.topics_total,
    topicsCompleted: r.topics_completed,
    sectionsTotal: r.sections_total,
    sectionsCompleted: r.sections_completed,
    linksTotal: r.links_total,
    linksCompleted: r.links_completed,
    diagramsTotal: r.diagrams_total,
    diagramsViewed: r.diagrams_viewed,
  }));
  res.json({ tracks });
});
