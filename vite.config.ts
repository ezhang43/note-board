import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { devCollabPlugin } from './src/sync/devServer';
import { devCalendarPlugin } from './src/calendar/devServer';

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the site from /note-board/; dev and tests stay at /.
  base: command === 'build' || isPreview ? '/note-board/' : '/',
  // A pretend sharing server and a pretend Google Calendar, for `npm run dev` only (?demo-user=Alice).
  plugins: [react(), devCollabPlugin(), devCalendarPlugin()],
  // Firebase (sign-in and sync) is about 180 KB zipped, loaded only on the published site.
  build: { chunkSizeWarningLimit: 700 },
  server: { port: 5173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
}));
