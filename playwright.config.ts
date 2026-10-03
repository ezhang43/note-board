import { defineConfig, devices } from '@playwright/test';

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    // Tests measure where blocks end up, so turn the gliding off (as "reduce motion" does);
    // the gliding itself has its own test with motion on.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'chromium', use: desktop, testIgnore: /published/ },
    // The published build (sign-in, offline copy), served as GitHub Pages serves it.
    { name: 'published', use: { ...desktop, baseURL: 'http://localhost:4173/note-board/' }, testMatch: /published/ },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/note-board/',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
