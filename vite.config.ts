import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { devCollabPlugin } from './src/sync/devServer';
import { devCalendarPlugin } from './src/calendar/devServer';
import { goatcounter } from './scripts/goatcounter';

export default defineConfig(({ command, isPreview, mode }) => ({
  // GitHub Pages serves the site from /note-board/; dev and tests stay at /.
  base: command === 'build' || isPreview ? '/note-board/' : '/',
  // A pretend sharing server and a pretend Google Calendar, for `npm run dev` only (?demo-user=Alice).
  plugins: [
    react(),
    devCollabPlugin(),
    devCalendarPlugin(),
    goatcounter(),
    // The published site (VITE_SYNC=on) starts from mainPublished.tsx, so its sign-in screen doesn't carry the board's code; dev and the tests start from main.tsx.
    {
      name: 'published-entry',
      transformIndexHtml: {
        order: 'pre',
        handler: (html: string) => (loadEnv(mode, process.cwd(), 'VITE_').VITE_SYNC === 'on' ? html.replace('/src/main.tsx', '/src/mainPublished.tsx') : html),
      },
    },
  ],
  // Firebase (sign-in and sync) is about 180 KB zipped, loaded only on the published site.
  // The website pages (SPEC "Website") are built beside the app, which stays at the site's address.
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      input: ['index.html', 'about/index.html', 'faq/index.html', 'terms/index.html', 'privacy/index.html', 'delete-account/index.html'],
    },
  },
  server: { port: 5173, strictPort: true },
  // pdf.js is only imported when a PDF is picked; prepared up front so `npm run dev` doesn't
  // reload the page the first time that happens.
  optimizeDeps: { include: ['pdfjs-dist'] },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'mcp/**/*.test.ts'],
    environment: 'node',
  },
}));
