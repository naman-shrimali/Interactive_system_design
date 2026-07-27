export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface CurriculumSection {
  id: number;
  slug: string;
  title: string;
  sortOrder: number;
  progressStatus: ProgressStatus;
  linkCount: number;
  linksCompleted: number;
  diagramCount: number;
  diagramsViewed: number;
}
export interface CurriculumChapter {
  id: number;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  sections: CurriculumSection[];
}
export interface CurriculumSource {
  id: number;
  slug: string;
  title: string;
  kind: 'repo' | 'book';
  description: string;
  chapters: CurriculumChapter[];
}

export interface ExternalLink {
  id: number;
  url: string;
  title: string;
  completed: boolean;
}
export interface DiagramMeta {
  id: number;
  slug: string;
  title: string;
  viewed: boolean;
}

export interface SectionDetail {
  id: number;
  slug: string;
  title: string;
  contentMarkdown: string;
  sourceUrl: string | null;
  chapterId: number;
  chapterTitle: string;
  sourceSlug: string;
  links: ExternalLink[];
  diagrams: DiagramMeta[];
}

export interface Note {
  id: number;
  chapterId: number | null;
  sectionId: number | null;
  contentMarkdown: string;
  createdAt: string;
  updatedAt: string;
}
export interface NoteWithAnchor extends Note {
  anchorType: 'chapter' | 'section';
  anchorTitle: string;
  anchorId: number;
}

export interface ProgressSummarySource {
  slug: string;
  title: string;
  sectionsTotal: number;
  sectionsCompleted: number;
  linksTotal: number;
  linksCompleted: number;
  diagramsTotal: number;
  diagramsViewed: number;
}
