/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Radius is deliberately short: 4px for controls, 6px for the player and
    // other large regions. Replacing the scale (not extending it) means a stray
    // rounded-2xl can't reintroduce the old look.
    borderRadius: {
      none: '0',
      sm: '2px',
      DEFAULT: '4px',
      md: '6px',
      full: '9999px',
    },
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['"IBM Plex Sans Condensed"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Theme-following surfaces, driven by CSS variables.
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        'ink-faint': 'rgb(var(--ink-faint) / <alpha-value>)',
        // One accent sitewide: "the thing you are following".
        accent: 'rgb(var(--accent) / <alpha-value>)',
        // Semantic colours, each reserved for one meaning.
        ok: 'rgb(var(--ok) / <alpha-value>)',
        fail: 'rgb(var(--fail) / <alpha-value>)',
        cp: 'rgb(var(--cp) / <alpha-value>)',
        // The player is a dark instrument in both themes.
        scope: {
          DEFAULT: 'rgb(var(--scope) / <alpha-value>)',
          2: 'rgb(var(--scope-2) / <alpha-value>)',
          line: '#242C38',
          ink: '#D8DEE7',
          'ink-2': '#8C96A5',
          'ink-3': '#5D6776',
          accent: '#7593FF',
          ok: '#3FC78E',
          fail: '#FF6B70',
          cp: '#F2B632',
        },
      },
      boxShadow: {
        // Only layers that genuinely float get a shadow.
        float: '0 12px 32px rgb(0 0 0 / 0.18), 0 2px 6px rgb(0 0 0 / 0.08)',
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
