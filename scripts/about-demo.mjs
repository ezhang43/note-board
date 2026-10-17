// Records the About page's demo video (about/demo.webm, demo.mp4, demo-dark.webm, demo-dark.mp4).
//
//   node scripts/about-demo.mjs          (needs ffmpeg on the PATH)
//
// It starts the app itself (vite, on this folder's test port), fills it with the small "Weekend in Lisbon" demo board
// (made up, no personal data), skips the welcome tour, and records a silent clip in a real browser: tick
// an item so it moves to Completed, fold a container and open it again, drag a card out with snapping on,
// type a new item. The recorder draws a small arrow so the pointer shows. The same steps run in light and
// in dark, then ffmpeg cuts and shrinks each recording to 960x600 and writes a WebM and an MP4.
// Not part of `npm test` or `npm run test:e2e`. Retake it when the app's look changes much.
// If the installed Chromium is a different version from Playwright's, set PW_CHROMIUM=/path/to/chromium.
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isGitWorktree, testPorts } from './test-ports.mjs';

// This folder's own dev port (as the browser tests use), so another worker's server is never reused.
const PORT = testPorts({ isWorktree: isGitWorktree(), folder: process.cwd(), env: process.env }).dev;
const out = fileURLToPath(new URL('../about/', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'about-demo-'));

// --- the demo board (saved the way the app saves it: key note-board:v1, version 2) ---
const item = (id, text, done = false, children = []) => ({ id, text, done, children });
const todo = (title, items) => ({ kind: 'todo', color: 'butter', title, items, completedOpen: true, collapsed: false, x: 0, y: 0, w: null, h: null });
const note = (text) => ({ kind: 'note', color: 'butter', text, collapsed: false, x: 0, y: 0, w: null, h: null });
const col = (id, title, x, color, cardIds) => ({ id, title, x, y: 0, w: 240, h: null, color, collapsed: false, cardIds });

const board = {
  name: 'Weekend in Lisbon',
  snap: true,
  cards: {
    book: todo('To book', [
      item('b1', 'Book the flights'),
      item('b2', 'Find a flat near Alfama', false, [item('b2a', 'Check the reviews'), item('b2b', 'Ask Sam about dates', true)]),
      item('b3', 'Renew passport', true),
      item('b4', 'Buy travel adapter', true),
    ]),
    pack: todo('Packing', [item('p1', 'Walking shoes'), item('p2', 'Sunscreen'), item('p3', 'Light jacket'), item('p4', 'Camera charger', true)]),
    eat: todo('Places to eat', [item('e1', 'Pastéis de nata in Belém'), item('e2', 'Time Out Market'), item('e3', 'Seafood in Cais do Sodré'), item('e4', 'Sunset drinks at the Miradouro', true)]),
    tram: note('Take tram 28 early, before the crowds.'),
    trip: todo('Day trip', [item('t1', 'Sintra palaces'), item('t2', 'Cascais beach'), item('t3', 'Train back by 6', true)]),
    maybe: todo('Maybe', [item('m1', 'Fado night in Alfama'), item('m2', 'Day at the aquarium')]),
    host: note('Ask the flat host about a late checkout.'),
  },
  columns: {
    c1: col('c1', 'Before we go', 0, 'periwinkle', ['book', 'pack']),
    c2: col('c2', 'Saturday', 270, 'sunflower', ['eat', 'tram']),
    c3: col('c3', 'Sunday', 540, 'mint', ['trip']),
    c4: col('c4', 'Ideas', 810, 'peach', ['maybe', 'host']),
  },
  order: ['c1', 'c2', 'c3', 'c4'],
};
const view = { panX: 270, panY: 70, zoom: 0.86 };

// --- the pointer the recording draws (a recording shows no mouse) ---
// It glides by a CSS transition, so the browser does the animating even on a busy computer; real mouse
// events are only sent where the app needs them (the click, the drag).
const pointerScript = () => {
  addEventListener('DOMContentLoaded', () => {
    const el = document.createElement('div');
    el.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30"><path d="M2 2v22l6-5.5 4.5 9.5 4-2-4.5-9H20z" fill="#1c1b19" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
    el.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;pointer-events:none;display:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))';
    document.body.append(el);
    window.__pointerTo = (x, y, ms) => {
      el.style.display = 'block';
      el.style.transition = ms ? `transform ${ms}ms cubic-bezier(.45,0,.25,1)` : 'none';
      el.style.transform = `translate(${x - 2}px, ${y - 2}px)`;
    };
  });
};

// --- the server ---
// Node runs vite directly (not through npx), so killing it at the end stops the server itself.
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const server = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort'], { stdio: process.env.DEMO_DEBUG ? 'inherit' : 'ignore' });
const base = `http://localhost:${PORT}/`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => t * t * (3 - 2 * t);

async function record(theme) {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
    recordVideo: { dir: join(work, theme), size: { width: 960, height: 600 } },
  });
  await context.addInitScript(
    ({ board, view, theme }) => {
      localStorage.setItem('note-board:v1', JSON.stringify({ version: 2, board }));
      localStorage.setItem('note-board:view:v1', JSON.stringify(view));
      localStorage.setItem('note-board:theme', theme);
      localStorage.setItem('note-board:tour-done', '1');
    },
    { board, view, theme },
  );
  await context.addInitScript(pointerScript);
  const pageCreated = Date.now();
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await wait(600);
  const start = (Date.now() - pageCreated) / 1000; // where the clip begins in the recording

  let at = { x: 1000, y: 760 };
  await page.evaluate(({ x, y }) => window.__pointerTo(x, y, 0), at);
  // Glide the drawn pointer (the browser animates it), then put the real mouse there.
  const glide = async (to, ms = 700) => {
    await page.evaluate(({ x, y, ms }) => window.__pointerTo(x, y, ms), { ...to, ms });
    await wait(ms);
    await page.mouse.move(to.x, to.y);
    at = to;
  };
  // Drag with real mouse moves a few at a time; the drawn pointer follows each in a short glide.
  const drag = async (to, ms = 1000) => {
    const from = at;
    const steps = Math.round(ms / 50);
    for (let i = 1; i <= steps; i++) {
      const k = ease(i / steps);
      const p = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      await page.evaluate(({ x, y }) => window.__pointerTo(x, y, 60), p);
      await page.mouse.move(p.x, p.y);
      await wait(40);
    }
    at = to;
  };
  const centre = async (locator, dy = 0) => {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 + dy };
  };
  const item = (id) => page.locator(`[data-item-id="${id}"]`);

  await wait(600);

  // 1. Tick an item: it moves down to Completed.
  await glide(await centre(item('p3').getByRole('checkbox')));
  await wait(250);
  await page.mouse.down();
  await page.mouse.up();
  await wait(1200);

  // 2. Fold a container, then open it again.
  const folding = page.locator('[data-col-id="c1"]');
  const header = await folding.locator('.column-header').boundingBox();
  await glide({ x: header.x + header.width / 2, y: header.y + header.height / 2 });
  await wait(250);
  const toggle = folding.getByRole('button', { name: 'Collapse container' });
  await glide(await centre(toggle), 450);
  await page.mouse.down();
  await page.mouse.up();
  await wait(1100);
  await page.mouse.down();
  await page.mouse.up();
  await wait(1000);

  // 3. Drag a card out of its container onto the open board; it snaps to the grid.
  const card = page.locator('[data-card-id="host"]');
  const grab = await card.boundingBox();
  await glide({ x: grab.x + 40, y: grab.y + 18 });
  await wait(250);
  await page.mouse.down();
  await wait(150);
  const target = { x: (await page.locator('[data-col-id="c3"]').boundingBox()).x + 52, y: 560 };
  await drag(target, 1100);
  await wait(500);
  await page.mouse.up();
  await wait(900);

  // 4. Type a new item.
  const sunscreen = item('p2').locator('textarea');
  await glide(await centre(sunscreen, 0), 800);
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await wait(300);
  await page.keyboard.type('Rain poncho', { delay: 85 });
  await wait(1200);

  const length = (Date.now() - pageCreated) / 1000 - start;
  await context.close(); // finishes the recording file
  await browser.close();
  const file = readdirSync(join(work, theme)).find((f) => f.endsWith('.webm'));
  return { file: join(work, theme, file), start, length };
}

try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (i > 120) throw new Error('The app did not start');
    await wait(500);
  }
  mkdirSync(out, { recursive: true });
  for (const theme of process.env.DEMO_ONLY ? [process.env.DEMO_ONLY] : ['light', 'dark']) {
    const { file, start, length } = await record(theme);
    const name = theme === 'dark' ? 'demo-dark' : 'demo';
    console.log(`${theme}: clip starts at ${start.toFixed(2)} s and runs ${length.toFixed(1)} s`);
    const input = ['-y', '-loglevel', 'error', '-ss', start.toFixed(2), '-t', length.toFixed(2), '-i', file, '-an', '-vf', 'scale=960:600:flags=lanczos,fps=24'];
    execFileSync('ffmpeg', [...input, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-pix_fmt', 'yuv420p', `${out}${name}.webm`]);
    execFileSync('ffmpeg', [...input, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}${name}.mp4`]);
    for (const ext of ['webm', 'mp4']) console.log(`saved about/${name}.${ext}`, Math.round(statSync(`${out}${name}.${ext}`).size / 1024), 'KB');
  }
} finally {
  server.kill();
  rmSync(work, { recursive: true, force: true });
}
