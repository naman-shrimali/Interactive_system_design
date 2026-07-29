export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';
export type SectionKind = 'overview' | 'concepts' | 'deep-dive' | 'tradeoffs' | 'checklist';
export type Difficulty = 'foundation' | 'intermediate' | 'advanced';
export type Provenance = 'primer' | 'authored';

/** Topic as it appears in the curriculum tree (no section bodies). */
export interface CurriculumTopic {
  id: number;
  slug: string;
  title: string;
  summary: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  accent: string;
  status: 'published' | 'stub';
  sortOrder: number;
  sectionCount: number;
  sectionsCompleted: number;
  linkCount: number;
  linksCompleted: number;
  diagramCount: number;
  diagramsViewed: number;
}
export interface CurriculumTrack {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  accent: string;
  sortOrder: number;
  topics: CurriculumTopic[];
}

export interface TopicSection {
  id: number;
  slug: string;
  title: string;
  kind: SectionKind;
  contentMarkdown: string;
  provenance: Provenance;
  attributionUrl: string | null;
  attributionNote: string | null;
  sortOrder: number;
  progressStatus: ProgressStatus;
  diagrams: DiagramMeta[];
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
export interface CodeWalkthroughMeta {
  id: number;
  slug: string;
  title: string;
}
export interface TopicNeighbor {
  slug: string;
  title: string;
}
export interface TopicDetail {
  id: number;
  slug: string;
  title: string;
  summary: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  accent: string;
  status: 'published' | 'stub';
  trackSlug: string;
  trackTitle: string;
  sections: TopicSection[];
  links: ExternalLink[];
  /** Diagrams not anchored to a specific section. */
  topicDiagrams: DiagramMeta[];
  /** Step-by-step code dry runs for this topic. */
  codeWalkthroughs: CodeWalkthroughMeta[];
  prev: TopicNeighbor | null;
  next: TopicNeighbor | null;
}

export interface Note {
  id: number;
  topicId: number | null;
  sectionId: number | null;
  contentMarkdown: string;
  createdAt: string;
  updatedAt: string;
}
export interface NoteWithAnchor extends Note {
  anchorType: 'topic' | 'section';
  anchorTitle: string;
  /** Topic slug to link to; section notes link to the owning topic. */
  anchorTopicSlug: string;
}

export interface ProgressSummaryTrack {
  slug: string;
  title: string;
  accent: string;
  topicsTotal: number;
  topicsCompleted: number;
  sectionsTotal: number;
  sectionsCompleted: number;
  linksTotal: number;
  linksCompleted: number;
  diagramsTotal: number;
  diagramsViewed: number;
}
