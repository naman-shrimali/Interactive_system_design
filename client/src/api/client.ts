/**
 * Data access for the static build.
 *
 * Content comes from JSON emitted by `scripts/export-static.ts` and served as
 * plain files; progress and notes are per-browser and come from localStorage.
 * There is no backend, so every function here resolves locally.
 */
import type {
  CurriculumTrack,
  CurriculumTopic,
  TopicDetail,
  InteractiveDiagram,
  ProgressStatus,
  ProgressSummaryTrack,
  Note,
  NoteWithAnchor,
  CodeWalkthrough,
  DiagramMeta,
  ReadingEntry,
  TopicQuestion,
} from '../types';
import * as local from './localStore';

const DATA = `${import.meta.env.BASE_URL}data`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA}/${path}`);
  if (!res.ok) throw new Error(res.status === 404 ? 'not found' : `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** Curriculum topics carry the id lists the client needs to count progress. */
interface RawTopic extends Omit<
  CurriculumTopic,
  'sectionCount' | 'sectionsCompleted' | 'linkCount' | 'linksCompleted' | 'diagramCount' | 'diagramsViewed'
> {
  sectionIds: number[];
  linkIds: number[];
  diagramIds: number[];
}
interface RawTrack extends Omit<CurriculumTrack, 'topics'> {
  topics: RawTopic[];
}

let curriculumCache: RawTrack[] | null = null;
async function rawCurriculum(): Promise<RawTrack[]> {
  if (!curriculumCache) {
    curriculumCache = (await getJson<{ tracks: RawTrack[] }>('curriculum.json')).tracks;
  }
  return curriculumCache;
}

function withCounts(t: RawTopic): CurriculumTopic {
  const { sectionIds, linkIds, diagramIds, ...rest } = t;
  return {
    ...rest,
    sectionCount: sectionIds.length,
    sectionsCompleted: local.countCompletedSections(sectionIds),
    linkCount: linkIds.length,
    linksCompleted: local.countCompletedLinks(linkIds),
    diagramCount: diagramIds.length,
    diagramsViewed: local.countViewedDiagrams(diagramIds),
  };
}

export async function fetchCurriculum(): Promise<CurriculumTrack[]> {
  const tracks = await rawCurriculum();
  return tracks.map((tr) => ({ ...tr, topics: tr.topics.map(withCounts) }));
}

/** Accepts a topic slug (canonical) or numeric id. */
export async function fetchTopic(idOrSlug: string | number): Promise<TopicDetail> {
  let slug = String(idOrSlug);
  if (/^\d+$/.test(slug)) {
    const id = Number(slug);
    const match = (await rawCurriculum()).flatMap((t) => t.topics).find((t) => t.id === id);
    if (!match) throw new Error('topic not found');
    slug = match.slug;
  }

  type RawSection = Omit<TopicDetail['sections'][number], 'progressStatus' | 'diagrams'> & {
    diagrams: Omit<DiagramMeta, 'viewed'>[];
  };
  type RawDetail = Omit<TopicDetail, 'sections' | 'links' | 'topicDiagrams'> & {
    sections: RawSection[];
    links: Omit<TopicDetail['links'][number], 'completed'>[];
    topicDiagrams: Omit<DiagramMeta, 'viewed'>[];
  };

  const raw = await getJson<RawDetail>(`topics/${slug}.json`);
  const withViewed = (d: Omit<DiagramMeta, 'viewed'>): DiagramMeta => ({
    ...d,
    viewed: local.diagramViewed(d.id),
  });

  return {
    ...raw,
    sections: raw.sections.map((s) => ({
      ...s,
      progressStatus: local.sectionStatus(s.id),
      diagrams: s.diagrams.map(withViewed),
    })),
    links: raw.links.map((l) => ({ ...l, completed: local.linkCompleted(l.id) })),
    topicDiagrams: raw.topicDiagrams.map(withViewed),
  };
}

export function fetchDiagram(
  id: number,
): Promise<{ id: number; slug: string; title: string; spec: InteractiveDiagram }> {
  return getJson(`diagrams/${id}.json`);
}

export function fetchCodeWalkthrough(
  id: number,
): Promise<{ id: number; slug: string; title: string; spec: CodeWalkthrough }> {
  return getJson(`code/${id}.json`);
}

let readingCache: Record<string, Omit<ReadingEntry, 'read'>[]> | null = null;

/** Curated sources for a topic, from the repo — identical on every device. */
export async function fetchReadingList(topicSlug: string): Promise<ReadingEntry[]> {
  if (!readingCache) {
    readingCache = await getJson<Record<string, Omit<ReadingEntry, 'read'>[]>>('reading-list.json')
      .catch(() => ({}));
  }
  return (readingCache[topicSlug] ?? []).map((e) => ({ ...e, read: local.readingRead(e.url) }));
}

export async function setReadingRead(url: string, isRead: boolean): Promise<void> {
  local.saveReadingRead(url, isRead);
}

let questionsCache: Record<string, TopicQuestion[]> | null = null;

/** Questions, misconceptions, and traps for a topic — repo content, not local. */
export async function fetchQuestions(topicSlug: string): Promise<TopicQuestion[]> {
  if (!questionsCache) {
    questionsCache = await getJson<Record<string, TopicQuestion[]>>('questions.json').catch(
      () => ({}),
    );
  }
  return questionsCache[topicSlug] ?? [];
}

export async function setSectionProgress(id: number, status: ProgressStatus): Promise<void> {
  local.saveSectionStatus(id, status);
}
export async function setLinkCompleted(id: number, completed: boolean): Promise<void> {
  local.saveLinkCompleted(id, completed);
}
export async function markDiagramViewed(id: number): Promise<void> {
  local.saveDiagramViewed(id);
}

export async function fetchProgressSummary(): Promise<ProgressSummaryTrack[]> {
  const tracks = await rawCurriculum();
  return tracks.map((tr) => {
    const topics = tr.topics.map(withCounts);
    const sum = (pick: (t: CurriculumTopic) => number): number =>
      topics.reduce((n, t) => n + pick(t), 0);
    return {
      slug: tr.slug,
      title: tr.title,
      accent: tr.accent,
      topicsTotal: topics.length,
      // A topic counts as complete when it has sections and all of them are done.
      topicsCompleted: topics.filter((t) => t.sectionCount > 0 && t.sectionsCompleted === t.sectionCount)
        .length,
      sectionsTotal: sum((t) => t.sectionCount),
      sectionsCompleted: sum((t) => t.sectionsCompleted),
      linksTotal: sum((t) => t.linkCount),
      linksCompleted: sum((t) => t.linksCompleted),
      diagramsTotal: sum((t) => t.diagramCount),
      diagramsViewed: sum((t) => t.diagramsViewed),
    };
  });
}

export async function fetchNotes(
  anchor: { sectionId: number } | { topicId: number },
): Promise<Note[]> {
  return local.notesFor(anchor);
}

interface Anchors {
  sections: Record<string, { title: string; topicSlug: string }>;
  topics: Record<string, { title: string; topicSlug: string }>;
}
let anchorsCache: Anchors | null = null;

export async function fetchAllNotes(): Promise<NoteWithAnchor[]> {
  const notes = local.allNotes();
  if (notes.length === 0) return [];
  if (!anchorsCache) anchorsCache = await getJson<Anchors>('anchors.json');

  return notes
    .map((n): NoteWithAnchor => {
      const isSection = n.sectionId !== null;
      const anchor = isSection
        ? anchorsCache!.sections[String(n.sectionId)]
        : anchorsCache!.topics[String(n.topicId)];
      return {
        ...n,
        anchorType: isSection ? 'section' : 'topic',
        anchorTitle: anchor?.title ?? '',
        anchorTopicSlug: anchor?.topicSlug ?? '',
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createNote(input: {
  sectionId?: number;
  topicId?: number;
  contentMarkdown: string;
}): Promise<Note> {
  return local.addNote(input);
}
export async function updateNote(id: number, contentMarkdown: string): Promise<Note> {
  return local.editNote(id, contentMarkdown);
}
export async function deleteNote(id: number): Promise<void> {
  local.removeNote(id);
}

/** Authoring preview: every diagram spec that shipped in the static export. */
export async function fetchDiagramFiles(): Promise<string[]> {
  const tracks = await rawCurriculum();
  return tracks.flatMap((tr) => tr.topics.flatMap((t) => t.diagramIds.map(String))).sort();
}
export async function fetchDiagramFile(name: string): Promise<InteractiveDiagram> {
  return (await fetchDiagram(Number(name))).spec;
}
