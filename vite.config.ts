import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the site from /note-board/; dev and tests stay at /.
  base: command === 'build' || isPreview ? '/note-board/' : '/',
  plugins: [react()],
  // Firebase (sign-in and sync) is about 180 KB zipped, loaded only on the published site.
  build: { chunkSizeWarningLimit: 700 },
  server: { port: 5173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
