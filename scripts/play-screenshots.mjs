// Takes the Google Play listing screenshots (docs/play-store/screenshots/) and the feature graphic.
//
//   node scripts/play-screenshots.mjs
//
// It starts the app itself (vite, on port 5199), fills it with a small demo board ("Weekend in Lisbon",
// no personal data), skips the welcome tour, and saves PNGs: phone 1080x1920, 7-inch tablet 1200x1920,
// 10-inch tablet 2560x1600, and the 1024x500 feature graphic. Light mode, plus some dark.
// Not part of `npm test` or `npm run test:e2e`. Retake them when the app's look changes much.
// If the installed Chromium is a different version from Playwright's, set PW_CHROMIUM=/path/to/chromium.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = 5199;
const out = fileURLToPath(new URL('../docs/play-store/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });

// --- the demo board (saved the way the app saves it: key note-board:v1, version 2) ---
const item = (id, text, done = false, children = []) => ({ id, text, done, children });
const todo = (color, title, items) => ({ kind: 'todo', color, title, items, completedOpen: true, collapsed: false, x: 0, y: 0, w: null, h: null });
const note = (color, text) => ({ kind: 'note', color, text, collapsed: false, x: 0, y: 0, w: null, h: null });
const col = (id, title, x, color, cardIds) => ({ id, title, x, y: 40, w: 280, h: null, color, collapsed: false, cardIds });

const board = {
  name: 'Weekend in Lisbon',
  snap: true,
  cards: {
    n1: note('butter', 'Flight lands Friday 9:40 am. Metro to the hotel, then a slow first walk.'),
    t1: todo('butter', 'Before we go', [
      item('t1a', 'Book the hotel', true),
      item('t1b', 'Download offline maps', true),
      item('t1c', 'Pack a light rain jacket'),
      item('t1d', 'Buy tram tickets', false, [item('t1e', 'Day pass for Saturday'), item('t1f', 'Airport metro card', true)]),
    ]),
    n2: note('butter', 'Saturday: Alfama in the morning, then the river at sunset.'),
    t2: todo('butter', 'Saturday plan', [
      item('t2a', 'Breakfast near the hotel', true),
      item('t2b', 'Castle viewpoint'),
      item('t2c', 'Tram 28 to Alfama'),
      item('t2d', 'Dinner by the river'),
    ]),
    n3: note('butter', 'Sunday: Belem, then the airport by 6 pm.'),
    t3: todo('butter', 'Food to try', [
      item('t3a', 'Pastel de nata'),
      item('t3b', 'Grilled sardines'),
      item('t3c', 'Bacalhau'),
      item('t3d', 'Ginjinha, a small glass'),
    ]),
    l1: { kind: 'link', color: 'butter', title: 'Tram 28 timetable', url: 'https://example.com/tram-28', collapsed: false, x: 0, y: 0, w: null, h: null },
  },
  columns: {
    c1: col('c1', 'Friday', 40, 'sky', ['n1', 't1']),
    c2: col('c2', 'Saturday', 360, 'sunflower', ['n2', 't2']),
    c3: col('c3', 'Sunday', 680, 'mint', ['n3', 't3', 'l1']),
  },
  order: ['c1', 'c2', 'c3'],
};

// Devices. The phone layout starts under 600 CSS px wide.
const phone = { name: 'phone', viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }; // 1080x1920
const tab7 = { name: 'tablet-7in', viewport: { width: 600, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }; // 1200x1920
const tab10 = { name: 'tablet-10in', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }; // 2560x1600

// Each shot: file name, device, theme, how the board is shown (pan and zoom), and what to click first.
const shots = [
  { file: 'phone-1-board', device: phone, theme: 'light', view: { panX: 12, panY: 20, zoom: 0.62 } },
  { file: 'phone-2-checklist', device: phone, theme: 'light', view: { panX: 10, panY: 30, zoom: 1.1 } },
  { file: 'phone-3-saturday', device: phone, theme: 'light', view: { panX: -330, panY: 30, zoom: 1.1 } },
  { file: 'phone-4-dark', device: phone, theme: 'dark', view: { panX: 12, panY: 20, zoom: 0.62 } },
  { file: 'phone-5-menu', device: phone, theme: 'light', view: { panX: 12, panY: 20, zoom: 0.62 }, click: 'More' },
  { file: 'tablet-7in-1-board', device: tab7, theme: 'light', view: { panX: 20, panY: 90, zoom: 0.62 } },
  { file: 'tablet-7in-2-dark', device: tab7, theme: 'dark', view: { panX: -300, panY: 110, zoom: 0.95 } },
  { file: 'tablet-10in-1-board', device: tab10, theme: 'light', view: { panX: 140, panY: 90, zoom: 1.1 } },
  { file: 'tablet-10in-2-dark', device: tab10, theme: 'dark', view: { panX: 140, panY: 90, zoom: 1.1 } },
];

// Start the app and wait for it.
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
const base = `http://localhost:${PORT}/`;
for (let i = 0; ; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {}
  if (i > 120) throw new Error('The app did not start');
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
try {
  for (const s of shots) {
    const { name, ...device } = s.device;
    const context = await browser.newContext({ ...device, reducedMotion: 'reduce', colorScheme: s.theme });
    await context.addInitScript(
      ({ board, view, theme }) => {
        localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
        localStorage.setItem('note-board:view:v1', JSON.stringify(view));
        localStorage.setItem('note-board:theme', theme);
        localStorage.setItem('note-board:tour-done', '1');
      },
      { board, view: s.view, theme: s.theme },
    );
    const page = await context.newPage();
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    if (s.click) await page.getByRole('button', { name: s.click, exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}${s.file}.png` });
    await context.close();
    console.log('saved', `${s.file}.png`, name);
  }

  // Feature graphic 1024x500: the icon, the name and one line on the site's honey background.
  const icon = readFileSync(fileURLToPath(new URL('../public/busyants-512.png', import.meta.url))).toString('base64');
  const context = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; width: 1024px; height: 500px; background: #ffcf3f; color: #3a2614; display: flex; align-items: center; justify-content: center; gap: 48px; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    img { width: 260px; height: 260px; border-radius: 56px; }
    h1 { margin: 0; font-size: 92px; font-weight: 700; letter-spacing: -2px; line-height: 1; }
    p { margin: 18px 0 0; font-size: 34px; font-weight: 500; max-width: 520px; line-height: 1.25; }
  </style><img src="data:image/png;base64,${icon}" alt=""><div><h1>BusyAnts</h1><p>A calm visual board for notes and checklists.</p></div>`);
  await page.screenshot({ path: `${out}feature-graphic-1024x500.png` });
  console.log('saved feature-graphic-1024x500.png');
  await context.close();
} finally {
  await browser.close();
  server.kill();
}
