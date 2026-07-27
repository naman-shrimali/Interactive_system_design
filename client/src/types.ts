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

// ---- Interactive diagram spec (mirrors scripts/diagram.schema.json) ----
export type NodeKind =
  | 'client' | 'client_mobile' | 'dns' | 'cdn' | 'load_balancer'
  | 'server' | 'server_stack' | 'database' | 'database_stack' | 'nosql'
  | 'cache' | 'cache_stack' | 'message_queue' | 'worker_stack'
  | 'service' | 'text_box' | 'table';
export type EdgeColor = 'blue' | 'green' | 'purple' | 'red' | 'gray';
export type HandleSide = 'top' | 'bottom' | 'left' | 'right';
export type NodeState = 'normal' | 'highlighted' | 'failed' | 'dimmed';

export interface DiagramNode {
  id: string;
  type: NodeKind;
  label: string;
  sublabel?: string;
  position: { x: number; y: number };
  groupId?: string;
  badge?: number;
  state?: NodeState;
  tableData?: { columns: string[]; rows: string[][] };
}
export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  step?: number;
  lineStyle?: 'solid' | 'dashed';
  color?: EdgeColor;
  direction?: 'forward' | 'both' | 'none';
  sourceHandle?: HandleSide;
  targetHandle?: HandleSide;
}
export interface DiagramGroup {
  id: string;
  label?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  style: 'dashed' | 'solid' | 'filled';
  labelPosition?: 'top-left' | 'top-right' | 'right' | 'bottom';
}
export interface FlowStep {
  edgeIds: string[];
  text: string;
}
export interface DiagramFlow {
  id: string;
  name: string;
  description?: string;
  steps: FlowStep[];
}
export interface InteractiveDiagram {
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  groups?: DiagramGroup[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  flows?: DiagramFlow[];
}
