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
export type CodeStepKind = 'code' | 'infra';
export interface CodeStep {
  title: string;
  kind: CodeStepKind;
  code?: string;
  language?: string;
  explain: string;
  saysOutLoud?: string;
}
export interface CodeWalkthrough {
  schemaVersion: 1;
  id: string;
  title: string;
  intro?: string;
  language?: string;
  closing?: string;
  steps: CodeStep[];
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

export type ReadingKind = 'rfc' | 'paper' | 'docs' | 'book' | 'article' | 'critique' | 'reference';
/** normative = the standard itself; authoritative = primary implementer; interview = framing. */
export type ReadingTier = 'normative' | 'authoritative' | 'interview';

/** A curated source, stored in the repo so the list is the same on every device. */
export interface ReadingEntry {
  url: string;
  title: string;
  publisher: string;
  kind: ReadingKind;
  tier: ReadingTier;
  why: string;
  lastVerified: string;
  /** Local, per-browser: whether this has been read. Keyed by url, not id. */
  read: boolean;
}

/** question = asked directly; misconception = a plausible belief that is wrong;
 *  trap = a question where the obvious answer fails. */
export type QuestionKind = 'question' | 'misconception' | 'trap';

export interface TopicQuestion {
  kind: QuestionKind;
  prompt: string;
  answer: string;
  source?: string;
  followUp?: string;
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
  /** 'path' (default) is stepped through; 'notes' is commentary listed under the figure. */
  kind?: 'path' | 'notes';
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
