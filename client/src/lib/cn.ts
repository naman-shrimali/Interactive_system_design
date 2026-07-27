/** Join class names, dropping falsy values. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Mix an accent hex with the current surface — used for tinted accent chips. */
export function accentTint(accent: string, pct: number): string {
  return `color-mix(in srgb, ${accent} ${pct}%, transparent)`;
}

export const DIFFICULTY_LABEL: Record<string, string> = {
  foundation: 'Foundation',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const KIND_LABEL: Record<string, string> = {
  overview: 'Overview',
  concepts: 'Concepts',
  'deep-dive': 'Deep dive',
  tradeoffs: 'Trade-offs',
  checklist: 'Checklist',
};
