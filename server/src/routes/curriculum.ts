import { Router } from 'express';
import { db, USER_ID } from '../db';
import type { CurriculumSection, CurriculumChapter, CurriculumSource, ProgressStatus } from '../types';

export const curriculumRouter = Router();

interface SourceRow { id: number; slug: string; title: string; kind: 'repo' | 'book'; description: string }
interface ChapterRow { id: number; source_id: number; slug: string; title: string; description: string; sort_order: number }
interface SectionRow {
  id: number;
  chapter_id: number;
  slug: string;
  title: string;
  sort_order: number;
  progress_status: ProgressStatus;
  link_count: number;
  links_completed: number;
  diagram_count: number;
  diagrams_viewed: number;
}

curriculumRouter.get('/curriculum', (_req, res) => {
  const sources = db
    .prepare(`SELECT id, slug, title, kind, description FROM sources ORDER BY sort_order`)
    .all() as SourceRow[];
  const chapters = db
    .prepare(`SELECT id, source_id, slug, title, description, sort_order FROM chapters ORDER BY sort_order`)
    .all() as ChapterRow[];
  const sections = db
    .prepare(
      `SELECT
         sec.id, sec.chapter_id, sec.slug, sec.title, sec.sort_order,
         COALESCE(sp.status, 'not_started') AS progress_status,
         (SELECT COUNT(*) FROM external_links el WHERE el.section_id = sec.id) AS link_count,
         (SELECT COUNT(*) FROM external_links el
            JOIN link_progress lp ON lp.link_id = el.id AND lp.user_id = ? AND lp.completed = 1
          WHERE el.section_id = sec.id) AS links_completed,
         (SELECT COUNT(*) FROM diagrams d WHERE d.section_id = sec.id) AS diagram_count,
         (SELECT COUNT(*) FROM diagrams d
            JOIN diagram_progress dp ON dp.diagram_id = d.id AND dp.user_id = ? AND dp.viewed = 1
          WHERE d.section_id = sec.id) AS diagrams_viewed
       FROM sections sec
       LEFT JOIN section_progress sp ON sp.section_id = sec.id AND sp.user_id = ?
       ORDER BY sec.sort_order`,
    )
    .all(USER_ID, USER_ID, USER_ID) as SectionRow[];

  const sectionsByChapter = new Map<number, CurriculumSection[]>();
  for (const s of sections) {
    const list = sectionsByChapter.get(s.chapter_id) ?? [];
    list.push({
      id: s.id,
      slug: s.slug,
      title: s.title,
      sortOrder: s.sort_order,
      progressStatus: s.progress_status,
      linkCount: s.link_count,
      linksCompleted: s.links_completed,
      diagramCount: s.diagram_count,
      diagramsViewed: s.diagrams_viewed,
    });
    sectionsByChapter.set(s.chapter_id, list);
  }

  const chaptersBySource = new Map<number, CurriculumChapter[]>();
  for (const c of chapters) {
    const list = chaptersBySource.get(c.source_id) ?? [];
    list.push({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      sortOrder: c.sort_order,
      sections: sectionsByChapter.get(c.id) ?? [],
    });
    chaptersBySource.set(c.source_id, list);
  }

  const result: CurriculumSource[] = sources.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    kind: s.kind,
    description: s.description,
    chapters: chaptersBySource.get(s.id) ?? [],
  }));

  res.json({ sources: result });
});
