/**
 * Per-browser persistence for progress and notes.
 *
 * The deployed app is static, so there is no server to hold user state — it
 * lives in localStorage and is therefore per-device and not synced. Content
 * ids come from the static export and are stable across re-exports.
 */
import type { Note, ProgressStatus } from '../types';

const KEY = 'isd-user-state-v1';

interface UserState {
  sections: Record<number, ProgressStatus>;
  links: Record<number, boolean>;
  diagrams: Record<number, boolean>;
  /** Reading-list state is keyed by url, so a source shared by several topics
   *  is marked read in all of them at once. */
  reading: Record<string, boolean>;
  notes: Note[];
  nextNoteId: number;
}

const EMPTY: UserState = {
  sections: {},
  links: {},
  diagrams: {},
  reading: {},
  notes: [],
  nextNoteId: 1,
};

function read(): UserState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<UserState>) };
  } catch {
    return { ...EMPTY };
  }
}

function write(state: UserState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function sectionStatus(id: number): ProgressStatus {
  return read().sections[id] ?? 'not_started';
}
export function linkCompleted(id: number): boolean {
  return read().links[id] === true;
}
export function diagramViewed(id: number): boolean {
  return read().diagrams[id] === true;
}

export function countCompletedSections(ids: number[]): number {
  const { sections } = read();
  return ids.filter((id) => sections[id] === 'completed').length;
}
export function countCompletedLinks(ids: number[]): number {
  const { links } = read();
  return ids.filter((id) => links[id] === true).length;
}
export function countViewedDiagrams(ids: number[]): number {
  const { diagrams } = read();
  return ids.filter((id) => diagrams[id] === true).length;
}

export function saveSectionStatus(id: number, status: ProgressStatus): void {
  const state = read();
  state.sections[id] = status;
  write(state);
}
export function saveLinkCompleted(id: number, completed: boolean): void {
  const state = read();
  state.links[id] = completed;
  write(state);
}
export function saveDiagramViewed(id: number): void {
  const state = read();
  state.diagrams[id] = true;
  write(state);
}

export function readingRead(url: string): boolean {
  return read().reading[url] === true;
}
export function saveReadingRead(url: string, isRead: boolean): void {
  const state = read();
  state.reading[url] = isRead;
  write(state);
}

export function allNotes(): Note[] {
  return read().notes;
}
export function notesFor(anchor: { sectionId: number } | { topicId: number }): Note[] {
  return read().notes.filter((n) =>
    'sectionId' in anchor ? n.sectionId === anchor.sectionId : n.topicId === anchor.topicId,
  );
}

export function addNote(input: {
  sectionId?: number;
  topicId?: number;
  contentMarkdown: string;
}): Note {
  const state = read();
  const now = new Date().toISOString();
  const note: Note = {
    id: state.nextNoteId,
    topicId: input.topicId ?? null,
    sectionId: input.sectionId ?? null,
    contentMarkdown: input.contentMarkdown,
    createdAt: now,
    updatedAt: now,
  };
  state.nextNoteId += 1;
  state.notes = [note, ...state.notes];
  write(state);
  return note;
}

export function editNote(id: number, contentMarkdown: string): Note {
  const state = read();
  const note = state.notes.find((n) => n.id === id);
  if (!note) throw new Error('note not found');
  note.contentMarkdown = contentMarkdown;
  note.updatedAt = new Date().toISOString();
  state.notes = [note, ...state.notes.filter((n) => n.id !== id)];
  write(state);
  return note;
}

export function removeNote(id: number): void {
  const state = read();
  state.notes = state.notes.filter((n) => n.id !== id);
  write(state);
}
