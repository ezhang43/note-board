import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { devCollabPlugin } from './src/sync/devServer';

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the site from /note-board/; dev and tests stay at /.
  base: command === 'build' || isPreview ? '/note-board/' : '/',
  // devCollabPlugin: a pretend sharing server for `npm run dev` only (?demo-user=Alice).
  plugins: [react(), devCollabPlugin()],
  // Firebase (sign-in and sync) is about 180 KB zipped, loaded only on the published site.
  // The website pages (SPEC "Website") are built beside the app, which stays at the site's address.
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      input: ['index.html', 'about/index.html', 'faq/index.html', 'terms/index.html', 'privacy/index.html'],
    },
  },
  server: { port: 5173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
}));
