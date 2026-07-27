import { create } from 'zustand';
import type { CurriculumSource } from '../types';
import { fetchCurriculum } from '../api/client';

interface AppState {
  curriculum: CurriculumSource[] | null;
  curriculumError: string | null;
  loadCurriculum: () => Promise<void>;
  refreshCurriculum: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  curriculum: null,
  curriculumError: null,
  loadCurriculum: async () => {
    if (get().curriculum !== null) return;
    await get().refreshCurriculum();
  },
  refreshCurriculum: async () => {
    try {
      const sources = await fetchCurriculum();
      set({ curriculum: sources, curriculumError: null });
    } catch (e) {
      set({ curriculumError: (e as Error).message });
    }
  },
}));
