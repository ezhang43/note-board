import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site from /note-board/; dev and tests stay at /.
  base: command === 'build' ? '/note-board/' : '/',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
