import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// GitHub Pages serves the repo at /<repo>/. Override with BASE_PATH when
// deploying elsewhere (a custom domain wants '/').
const base = process.env.BASE_PATH ?? '/Interactive_system_design/';

/**
 * GitHub Pages has no SPA rewrite. It serves 404.html for any unknown path, so
 * shipping a copy of the app shell there lets deep links like /topics/caching
 * boot the router instead of showing a 404 page.
 */
function spaFallback() {
  return {
    name: 'spa-404-fallback',
    closeBundle() {
      const dist = path.resolve(__dirname, 'dist');
      const index = path.join(dist, 'index.html');
      if (fs.existsSync(index)) fs.copyFileSync(index, path.join(dist, '404.html'));
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), spaFallback()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  server: {
    port: 5173,
  },
});
