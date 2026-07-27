import { create } from 'zustand';

type Theme = 'light' | 'dark';
const KEY = 'isd-theme';

function initial(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, next);
    apply(next);
    set({ theme: next });
  },
}));

/** Called once at boot, before first paint of themed content. */
export function initTheme(): void {
  const theme = initial();
  apply(theme);
  useThemeStore.setState({ theme });
}
