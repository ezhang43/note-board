import { defineConfig, devices } from '@playwright/test';
import { isGitWorktree, testPorts } from './scripts/test-ports.mjs';

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

// Each worktree tests on its own ports, so workers testing at the same time never share a dev server.
const ports = testPorts({ isWorktree: isGitWorktree(), folder: process.cwd(), env: process.env });

// The welcome tour starts by itself on a new device; every test but e2e/tour.spec.ts starts with it already done.
const tourDone = (port: number) => ({
  cookies: [],
  origins: [{ origin: `http://localhost:${port}`, localStorage: [{ name: 'note-board:tour-done', value: '1' }] }],
});

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // At most 4 browsers at once on a computer, so several crew workers testing together don't max out
  // the CPU (the default is half the processor threads); GitHub (CI) keeps the default.
  workers: process.env.CI ? undefined : 4,
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
    { name: 'chromium', use: { ...desktop, storageState: tourDone(ports.dev) }, testIgnore: /published/ },
    // The published build (sign-in, offline copy), served as GitHub Pages serves it.
    { name: 'published', use: { ...desktop, storageState: tourDone(ports.preview), baseURL: `http://localhost:${ports.preview}/note-board/` }, testMatch: /published/ },
    // The offline tests again on a phone (Chrome on Android) and in Safari's engine (iPhone), so the
    // offline copy is checked there too; the rest of the suite runs on desktop Chrome only.
    ...[
      { name: 'published-phone', use: devices['Pixel 7'] },
      { name: 'published-iphone', use: devices['iPhone 14'] },
    ].map((p) => ({
      ...p,
      use: { ...p.use, storageState: tourDone(ports.preview), baseURL: `http://localhost:${ports.preview}/note-board/` },
      testMatch: /published/,
      grep: /offline|without internet/,
    })),
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${ports.dev} --strictPort`,
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
