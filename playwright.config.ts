import { defineConfig, devices } from '@playwright/test';
import { isGitWorktree, testPorts } from './scripts/test-ports.mjs';

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

// Each worktree tests on its own ports, so workers testing at the same time never share a dev server.
const ports = testPorts({ isWorktree: isGitWorktree(), folder: process.cwd(), env: process.env });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A failed or flaky test is retried once; its trace (every step, with snapshots of the page),
  // screenshot and video are kept in test-results/ and shown in the report (npm run test:e2e:report).
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${ports.dev}`,
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
    { name: 'published', use: { ...desktop, baseURL: `http://localhost:${ports.preview}/note-board/` }, testMatch: /published/ },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${ports.dev}`,
      url: `http://localhost:${ports.dev}`,
      reuseExistingServer: true,
    },
    {
      command: `npm run build && npx vite preview --port ${ports.preview} --strictPort`,
      url: `http://localhost:${ports.preview}/note-board/`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
