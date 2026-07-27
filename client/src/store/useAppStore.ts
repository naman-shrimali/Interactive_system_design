import { create } from 'zustand';
import type { CurriculumTrack } from '../types';
import { fetchCurriculum } from '../api/client';

interface AppState {
  curriculum: CurriculumTrack[] | null;
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
      const tracks = await fetchCurriculum();
      set({ curriculum: tracks, curriculumError: null });
    } catch (e) {
      set({ curriculumError: (e as Error).message });
    }
  },
}));
