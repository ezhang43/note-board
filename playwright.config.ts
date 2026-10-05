import { defineConfig, devices } from '@playwright/test';

// A session working in another copy of the project can run its tests at the same time on other
// ports: E2E_PORT (default 5173) and E2E_PREVIEW_PORT (default 4173).
const port = Number(process.env.E2E_PORT ?? 5173);
const previewPort = Number(process.env.E2E_PREVIEW_PORT ?? 4173);

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A failed or flaky test is retried once; its trace (every step, with snapshots of the page),
  // screenshot and video are kept in test-results/ and shown in the report (npm run test:e2e:report).
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    // Tests measure where blocks end up, so turn the gliding off (as "reduce motion" does);
    // the gliding itself has its own test with motion on.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'chromium', use: desktop, testIgnore: /published/ },
    // The published build (sign-in, offline copy), served as GitHub Pages serves it.
    { name: 'published', use: { ...desktop, baseURL: `http://localhost:${previewPort}/note-board/` }, testMatch: /published/ },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${port} --strictPort`,
      url: `http://localhost:${port}`,
      reuseExistingServer: true,
    },
    {
      command: `npm run build && npx vite preview --port ${previewPort} --strictPort`,
      url: `http://localhost:${previewPort}/note-board/`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
