import { Router } from 'express';
import { db, USER_ID } from '../db';
import type { CurriculumTrack, CurriculumTopic, Difficulty } from '../types';

export const curriculumRouter = Router();

interface TrackRow {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  accent: string;
  sort_order: number;
}
interface TopicRow {
  id: number;
  track_id: number;
  slug: string;
  title: string;
  summary: string;
  difficulty: Difficulty;
  estimated_minutes: number;
  accent: string;
  status: 'published' | 'stub';
  sort_order: number;
  section_count: number;
  sections_completed: number;
  link_count: number;
  links_completed: number;
  diagram_count: number;
  diagrams_viewed: number;
}

curriculumRouter.get('/curriculum', (_req, res) => {
  const tracks = db
    .prepare(`SELECT id, slug, title, subtitle, accent, sort_order FROM tracks ORDER BY sort_order`)
    .all() as TrackRow[];

  const topics = db
    .prepare(
      `SELECT t.id, t.track_id, t.slug, t.title, t.summary, t.difficulty,
              t.estimated_minutes, t.accent, t.status, t.sort_order,
         (SELECT COUNT(*) FROM sections s WHERE s.topic_id = t.id) AS section_count,
         (SELECT COUNT(*) FROM sections s
            JOIN section_progress sp ON sp.section_id = s.id AND sp.user_id = ? AND sp.status = 'completed'
          WHERE s.topic_id = t.id) AS sections_completed,
         (SELECT COUNT(*) FROM external_links el WHERE el.topic_id = t.id) AS link_count,
         (SELECT COUNT(*) FROM external_links el
            JOIN link_progress lp ON lp.link_id = el.id AND lp.user_id = ? AND lp.completed = 1
          WHERE el.topic_id = t.id) AS links_completed,
         (SELECT COUNT(*) FROM diagrams d WHERE d.topic_id = t.id) AS diagram_count,
         (SELECT COUNT(*) FROM diagrams d
            JOIN diagram_progress dp ON dp.diagram_id = d.id AND dp.user_id = ? AND dp.viewed = 1
          WHERE d.topic_id = t.id) AS diagrams_viewed
       FROM topics t
       ORDER BY t.sort_order, t.slug`,
    )
    .all(USER_ID, USER_ID, USER_ID) as TopicRow[];

  const byTrack = new Map<number, CurriculumTopic[]>();
  for (const t of topics) {
    const list = byTrack.get(t.track_id) ?? [];
    list.push({
      id: t.id,
      slug: t.slug,
      title: t.title,
      summary: t.summary,
      difficulty: t.difficulty,
      estimatedMinutes: t.estimated_minutes,
      accent: t.accent,
      status: t.status,
      sortOrder: t.sort_order,
      sectionCount: t.section_count,
      sectionsCompleted: t.sections_completed,
      linkCount: t.link_count,
      linksCompleted: t.links_completed,
      diagramCount: t.diagram_count,
      diagramsViewed: t.diagrams_viewed,
    });
    byTrack.set(t.track_id, list);
  }

  const result: CurriculumTrack[] = tracks.map((tr) => ({
    id: tr.id,
    slug: tr.slug,
    title: tr.title,
    subtitle: tr.subtitle,
    accent: tr.accent,
    sortOrder: tr.sort_order,
    topics: byTrack.get(tr.id) ?? [],
  }));

  res.json({ tracks: result });
});
