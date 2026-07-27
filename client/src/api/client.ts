import type {
  CurriculumTrack,
  TopicDetail,
  InteractiveDiagram,
  ProgressStatus,
  ProgressSummaryTrack,
  Note,
  NoteWithAnchor,
} from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchCurriculum(): Promise<CurriculumTrack[]> {
  return request<{ tracks: CurriculumTrack[] }>('/api/curriculum').then((d) => d.tracks);
}
/** Accepts a topic slug (canonical) or numeric id. */
export function fetchTopic(idOrSlug: string | number): Promise<TopicDetail> {
  return request<TopicDetail>(`/api/topics/${idOrSlug}`);
}
export function fetchDiagram(
  id: number,
): Promise<{ id: number; slug: string; title: string; spec: InteractiveDiagram }> {
  return request(`/api/diagrams/${id}`);
}
export function setSectionProgress(id: number, status: ProgressStatus): Promise<void> {
  return request<void>(`/api/progress/section/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}
export function setLinkCompleted(id: number, completed: boolean): Promise<void> {
  return request<void>(`/api/progress/link/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ completed }),
  });
}
export function markDiagramViewed(id: number): Promise<void> {
  return request<void>(`/api/progress/diagram/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ viewed: true }),
  });
}
export function fetchProgressSummary(): Promise<ProgressSummaryTrack[]> {
  return request<{ tracks: ProgressSummaryTrack[] }>('/api/progress/summary').then((d) => d.tracks);
}
export function fetchNotes(anchor: { sectionId: number } | { topicId: number }): Promise<Note[]> {
  const qs =
    'sectionId' in anchor ? `sectionId=${anchor.sectionId}` : `topicId=${anchor.topicId}`;
  return request<{ notes: Note[] }>(`/api/notes?${qs}`).then((d) => d.notes);
}
export function fetchAllNotes(): Promise<NoteWithAnchor[]> {
  return request<{ notes: NoteWithAnchor[] }>('/api/notes/all').then((d) => d.notes);
}
export function createNote(input: {
  sectionId?: number;
  topicId?: number;
  contentMarkdown: string;
}): Promise<Note> {
  return request<Note>('/api/notes', { method: 'POST', body: JSON.stringify(input) });
}
export function updateNote(id: number, contentMarkdown: string): Promise<Note> {
  return request<Note>(`/api/notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ contentMarkdown }),
  });
}
export function deleteNote(id: number): Promise<void> {
  return request<void>(`/api/notes/${id}`, { method: 'DELETE' });
}

// Dev-only: raw diagram files for the authoring preview (TASK-024)
export function fetchDiagramFiles(): Promise<string[]> {
  return request<{ files: string[] }>('/api/dev/diagram-files').then((d) => d.files);
}
export function fetchDiagramFile(name: string): Promise<InteractiveDiagram> {
  return request<InteractiveDiagram>(`/api/dev/diagram-file?name=${encodeURIComponent(name)}`);
}
