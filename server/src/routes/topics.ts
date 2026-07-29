import { Router } from 'express';
import { db, USER_ID } from '../db';
import type {
  TopicDetail,
  TopicSection,
  ExternalLink,
  DiagramMeta,
  CodeWalkthroughMeta,
  ProgressStatus,
  SectionKind,
  Difficulty,
} from '../types';

export const topicsRouter = Router();

interface TopicRow {
  id: number;
  slug: string;
  title: string;
  summary: string;
  difficulty: Difficulty;
  estimated_minutes: number;
  accent: string;
  status: 'published' | 'stub';
  sort_order: number;
  track_slug: string;
  track_title: string;
  track_sort: number;
}
interface SectionRow {
  id: number;
  slug: string;
  title: string;
  kind: SectionKind;
  content_markdown: string;
  provenance: 'primer' | 'authored';
  attribution_url: string | null;
  attribution_note: string | null;
  sort_order: number;
  progress_status: ProgressStatus;
}
interface DiagramRow {
  id: number;
  section_id: number | null;
  slug: string;
  title: string;
  viewed: number;
}

/** Look up by numeric id or by slug — the slug is the canonical URL key. */
function findTopic(idOrSlug: string): TopicRow | undefined {
  const numeric = Number.parseInt(idOrSlug, 10);
  const sql = `
    SELECT tp.id, tp.slug, tp.title, tp.summary, tp.difficulty, tp.estimated_minutes,
           tp.accent, tp.status, tp.sort_order,
           tr.slug AS track_slug, tr.title AS track_title, tr.sort_order AS track_sort
    FROM topics tp JOIN tracks tr ON tr.id = tp.track_id
    WHERE `;
  if (String(numeric) === idOrSlug) {
    return db.prepare(sql + `tp.id = ?`).get(numeric) as TopicRow | undefined;
  }
  return db.prepare(sql + `tp.slug = ?`).get(idOrSlug) as TopicRow | undefined;
}

topicsRouter.get('/topics/:idOrSlug', (req, res) => {
  const topic = findTopic(req.params.idOrSlug);
  if (!topic) return res.status(404).json({ error: 'topic not found' });

  const sections = db
    .prepare(
      `SELECT s.id, s.slug, s.title, s.kind, s.content_markdown, s.provenance,
              s.attribution_url, s.attribution_note, s.sort_order,
              COALESCE(sp.status, 'not_started') AS progress_status
       FROM sections s
       LEFT JOIN section_progress sp ON sp.section_id = s.id AND sp.user_id = ?
       WHERE s.topic_id = ?
       ORDER BY s.sort_order`,
    )
    .all(USER_ID, topic.id) as SectionRow[];

  const links = db
    .prepare(
      `SELECT el.id, el.url, el.title, COALESCE(lp.completed, 0) AS completed
       FROM external_links el
       LEFT JOIN link_progress lp ON lp.link_id = el.id AND lp.user_id = ?
       WHERE el.topic_id = ? ORDER BY el.sort_order`,
    )
    .all(USER_ID, topic.id) as { id: number; url: string; title: string; completed: number }[];

  const diagrams = db
    .prepare(
      `SELECT d.id, d.section_id, d.slug, d.title, COALESCE(dp.viewed, 0) AS viewed
       FROM diagrams d
       LEFT JOIN diagram_progress dp ON dp.diagram_id = d.id AND dp.user_id = ?
       WHERE d.topic_id = ? ORDER BY d.sort_order`,
    )
    .all(USER_ID, topic.id) as DiagramRow[];

  const codeRows = db
    .prepare(
      `SELECT id, slug, title FROM code_walkthroughs
       WHERE topic_id = ? ORDER BY sort_order`,
    )
    .all(topic.id) as CodeWalkthroughMeta[];

  const toMeta = (d: DiagramRow): DiagramMeta => ({
    id: d.id,
    slug: d.slug,
    title: d.title,
    viewed: d.viewed === 1,
  });
  const bySection = new Map<number, DiagramMeta[]>();
  const topicDiagrams: DiagramMeta[] = [];
  for (const d of diagrams) {
    if (d.section_id === null) topicDiagrams.push(toMeta(d));
    else bySection.set(d.section_id, [...(bySection.get(d.section_id) ?? []), toMeta(d)]);
  }

  // Prev/next across the whole curriculum in reading order.
  const order = db
    .prepare(
      `SELECT tp.slug, tp.title FROM topics tp JOIN tracks tr ON tr.id = tp.track_id
       ORDER BY tr.sort_order, tp.sort_order, tp.slug`,
    )
    .all() as { slug: string; title: string }[];
  const idx = order.findIndex((t) => t.slug === topic.slug);

  const detail: TopicDetail = {
    id: topic.id,
    slug: topic.slug,
    title: topic.title,
    summary: topic.summary,
    difficulty: topic.difficulty,
    estimatedMinutes: topic.estimated_minutes,
    accent: topic.accent,
    status: topic.status,
    trackSlug: topic.track_slug,
    trackTitle: topic.track_title,
    sections: sections.map(
      (s): TopicSection => ({
        id: s.id,
        slug: s.slug,
        title: s.title,
        kind: s.kind,
        contentMarkdown: s.content_markdown,
        provenance: s.provenance,
        attributionUrl: s.attribution_url,
        attributionNote: s.attribution_note,
        sortOrder: s.sort_order,
        progressStatus: s.progress_status,
        diagrams: bySection.get(s.id) ?? [],
      }),
    ),
    links: links.map(
      (l): ExternalLink => ({ id: l.id, url: l.url, title: l.title, completed: l.completed === 1 }),
    ),
    topicDiagrams,
    codeWalkthroughs: codeRows,
    prev: idx > 0 ? order[idx - 1] : null,
    next: idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null,
  };
  res.json(detail);
});
