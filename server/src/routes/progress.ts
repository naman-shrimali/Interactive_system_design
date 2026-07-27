import { Router } from 'express';
import { z } from 'zod';
import { db, USER_ID } from '../db';
import type { ProgressSummarySource } from '../types';

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
      `SELECT so.slug, so.title,
        (SELECT COUNT(*) FROM sections sec JOIN chapters c ON sec.chapter_id = c.id
          WHERE c.source_id = so.id) AS sections_total,
        (SELECT COUNT(*) FROM sections sec JOIN chapters c ON sec.chapter_id = c.id
          JOIN section_progress sp ON sp.section_id = sec.id AND sp.user_id = ${USER_ID} AND sp.status = 'completed'
          WHERE c.source_id = so.id) AS sections_completed,
        (SELECT COUNT(*) FROM external_links el JOIN sections sec ON el.section_id = sec.id
          JOIN chapters c ON sec.chapter_id = c.id WHERE c.source_id = so.id) AS links_total,
        (SELECT COUNT(*) FROM external_links el JOIN sections sec ON el.section_id = sec.id
          JOIN chapters c ON sec.chapter_id = c.id
          JOIN link_progress lp ON lp.link_id = el.id AND lp.user_id = ${USER_ID} AND lp.completed = 1
          WHERE c.source_id = so.id) AS links_completed,
        (SELECT COUNT(*) FROM diagrams d JOIN sections sec ON d.section_id = sec.id
          JOIN chapters c ON sec.chapter_id = c.id WHERE c.source_id = so.id) AS diagrams_total,
        (SELECT COUNT(*) FROM diagrams d JOIN sections sec ON d.section_id = sec.id
          JOIN chapters c ON sec.chapter_id = c.id
          JOIN diagram_progress dp ON dp.diagram_id = d.id AND dp.user_id = ${USER_ID} AND dp.viewed = 1
          WHERE c.source_id = so.id) AS diagrams_viewed
      FROM sources so ORDER BY so.sort_order`,
    )
    .all() as SummaryRow[];

  const sources: ProgressSummarySource[] = rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    sectionsTotal: r.sections_total,
    sectionsCompleted: r.sections_completed,
    linksTotal: r.links_total,
    linksCompleted: r.links_completed,
    diagramsTotal: r.diagrams_total,
    diagramsViewed: r.diagrams_viewed,
  }));
  res.json({ sources });
});
