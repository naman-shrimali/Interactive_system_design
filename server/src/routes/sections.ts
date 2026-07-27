import { Router } from 'express';
import { db, USER_ID } from '../db';
import type { SectionDetail, ExternalLink, DiagramMeta } from '../types';

export const sectionsRouter = Router();

interface SectionRow {
  id: number;
  slug: string;
  title: string;
  content_markdown: string;
  source_url: string | null;
  chapter_id: number;
  chapter_title: string;
  source_slug: string;
}
interface LinkRow { id: number; url: string; title: string; completed: number }
interface DiagramRow { id: number; slug: string; title: string; viewed: number }

sectionsRouter.get('/sections/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid section id' });

  const row = db
    .prepare(
      `SELECT sec.id, sec.slug, sec.title, sec.content_markdown, sec.source_url,
              c.id AS chapter_id, c.title AS chapter_title, s.slug AS source_slug
       FROM sections sec
       JOIN chapters c ON c.id = sec.chapter_id
       JOIN sources s  ON s.id = c.source_id
       WHERE sec.id = ?`,
    )
    .get(id) as SectionRow | undefined;
  if (!row) return res.status(404).json({ error: 'section not found' });

  const links = db
    .prepare(
      `SELECT el.id, el.url, el.title, COALESCE(lp.completed, 0) AS completed
       FROM external_links el
       LEFT JOIN link_progress lp ON lp.link_id = el.id AND lp.user_id = ?
       WHERE el.section_id = ? ORDER BY el.sort_order`,
    )
    .all(USER_ID, id) as LinkRow[];

  const diagrams = db
    .prepare(
      `SELECT d.id, d.slug, d.title, COALESCE(dp.viewed, 0) AS viewed
       FROM diagrams d
       LEFT JOIN diagram_progress dp ON dp.diagram_id = d.id AND dp.user_id = ?
       WHERE d.section_id = ? ORDER BY d.sort_order`,
    )
    .all(USER_ID, id) as DiagramRow[];

  const detail: SectionDetail = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    contentMarkdown: row.content_markdown,
    sourceUrl: row.source_url,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    sourceSlug: row.source_slug,
    links: links.map((l): ExternalLink => ({ id: l.id, url: l.url, title: l.title, completed: l.completed === 1 })),
    diagrams: diagrams.map((d): DiagramMeta => ({ id: d.id, slug: d.slug, title: d.title, viewed: d.viewed === 1 })),
  };
  res.json(detail);
});
