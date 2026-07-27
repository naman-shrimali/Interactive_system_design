import type {
  CurriculumSource,
  SectionDetail,
  InteractiveDiagram,
  ProgressStatus,
  ProgressSummarySource,
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

export function fetchCurriculum(): Promise<CurriculumSource[]> {
  return request<{ sources: CurriculumSource[] }>('/api/curriculum').then((d) => d.sources);
}
export function fetchSection(id: number): Promise<SectionDetail> {
  return request<SectionDetail>(`/api/sections/${id}`);
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
export function fetchProgressSummary(): Promise<ProgressSummarySource[]> {
  return request<{ sources: ProgressSummarySource[] }>('/api/progress/summary').then((d) => d.sources);
}
export function fetchNotes(anchor: { sectionId: number } | { chapterId: number }): Promise<Note[]> {
  const qs =
    'sectionId' in anchor ? `sectionId=${anchor.sectionId}` : `chapterId=${anchor.chapterId}`;
  return request<{ notes: Note[] }>(`/api/notes?${qs}`).then((d) => d.notes);
}
export function fetchAllNotes(): Promise<NoteWithAnchor[]> {
  return request<{ notes: NoteWithAnchor[] }>('/api/notes/all').then((d) => d.notes);
}
export function createNote(input: {
  sectionId?: number;
  chapterId?: number;
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
