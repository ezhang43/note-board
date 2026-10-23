// Takes the Google Play listing screenshots (docs/play-store/screenshots/) and the feature graphic.
//
//   node scripts/play-screenshots.mjs              (all of them)
//   PLAY_ONLY=phone-6 node scripts/play-screenshots.mjs   (only the files whose name starts with this)
//
// It starts the app itself (vite, on this folder's test port) and uses the real app the way a person would:
// the "Weekend in Lisbon" example board from the empty board's template tiles, the Habits panel with a few
// made-up habits and weights, and a comment thread between two demo people (the pretend server in
// `npm run dev`). No real data and no sign-in. It skips the welcome tour and saves PNGs: phone 1080x1920,
// 7-inch tablet 1200x1920, 10-inch tablet 2560x1600, and the 1024x500 feature graphic. Light mode, plus some dark.
// Not part of `npm test` or `npm run test:e2e`. Retake them when the app's look changes much.
// If the installed Chromium is a different version from Playwright's, set PW_CHROMIUM=/path/to/chromium.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isGitWorktree, testPorts } from './test-ports.mjs';

// This folder's own dev port (as the browser tests use), so another worker's server is never reused.
const PORT = testPorts({ isWorktree: isGitWorktree(), folder: process.cwd(), env: process.env }).dev;
const out = fileURLToPath(new URL('../docs/play-store/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });
const only = process.env.PLAY_ONLY ?? '';

// Devices. The phone layout starts under 600 CSS px wide.
const phone = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }; // 1080x1920
const tab7 = { viewport: { width: 600, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }; // 1200x1920
const tab10 = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }; // 2560x1600
const desktop = { viewport: { width: 1440, height: 900 } }; // only to share a board and write a comment

// "Today" for the Habits panel: Wednesday 21 October 2026, so the week reads Mon 19 to Sun 25 and the shots don't depend on the day they are taken.
const NOW = new Date(2026, 9, 21, 10, 0);

// --- the server ---
// Node runs vite directly (not through npx), so killing it at the end stops the server itself.
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const server = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort'], { stdio: process.env.PLAY_DEBUG ? 'inherit' : 'ignore' });
const base = `http://localhost:${PORT}/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- small helpers ---
async function newPage(browser, device, theme, { user, clock } = {}) {
  const context = await browser.newContext({ ...device, reducedMotion: 'reduce', colorScheme: theme });
  await context.addInitScript((theme) => {
    localStorage.setItem('note-board:theme', theme);
    localStorage.setItem('note-board:tour-done', '1');
  }, theme);
  const page = await context.newPage();
  if (clock) await page.clock.setFixedTime(clock);
  await load(page, user ? `?demo-user=${user}` : '');
  return page;
}
async function load(page, path) {
  await page.goto(base + path);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await wait(400);
}
const reload = async (page) => {
  await page.reload();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await wait(500);
};
const save = async (page, file) => {
  await wait(300);
  await page.screenshot({ path: `${out}${file}.png` });
  console.log('saved', `${file}.png`);
};
const wanted = (file) => file.startsWith(only);

/** Pans the board with one finger, as a person would (a touch drag on empty board; the app has no pan buttons on a phone). */
async function pan(page, dx, dy, from = [page.viewportSize().width / 2, 110]) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const [x, y] = from;
  await touch('touchStart', x, y);
  for (let i = 1; i <= 8; i++) await touch('touchMove', x + (dx * i) / 8, y + (dy * i) / 8);
  await touch('touchEnd');
  await wait(400);
}

/** A point on bare board (no container, card or button), for a swipe to start from. */
const emptySpot = (page) =>
  page.evaluate(() => {
    const { innerWidth: w, innerHeight: h } = window;
    for (let y = h - 120; y > 140; y -= 40)
      for (let x = 20; x < w - 20; x += 40) {
        const el = document.elementFromPoint(x, y);
        if (el && !el.closest('[data-col-id], [data-card-id], header, button, aside, .corner-controls, [role="toolbar"]')) return [x, y];
      }
    return null;
  });

/** Zooms in with the zoom control's + until it reads at least this percent (the app opens a touch screen fitted, and ignores a saved view). */
async function zoomTo(page, percent) {
  const zoom = page.getByRole('group', { name: 'Zoom' });
  for (let i = 0; i < 20 && parseInt(await zoom.getByRole('button', { name: /^Reset zoom/ }).innerText(), 10) < percent; i++) {
    await zoom.getByRole('button', { name: 'Zoom in' }).click();
    await wait(150);
  }
}

/** The empty board's "Weekend in Lisbon" tile: the example opens as a board of its own, then the toast goes. */
async function openLisbon(page) {
  await page.getByRole('button', { name: /^Weekend in Lisbon/ }).click();
  await page.getByLabel('Board name').and(page.locator('[value="Weekend in Lisbon"]')).waitFor();
  await page.getByText('Opened “Weekend in Lisbon”').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await wait(800); // saved (the app saves a moment after a change)
}

const moreButton = (page) => page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true });
const isPhone = (page) => page.viewportSize().width < 600;

/** Opens the Habits panel: the corner button, or on a phone the Habits tile in the ⋯ menu. */
async function openHabits(page) {
  if (isPhone(page)) {
    await moreButton(page).click();
    await page.getByRole('dialog', { name: 'More' }).locator('.phone-tiles').getByRole('button', { name: 'Habits', exact: true }).click();
  } else if (page.viewportSize().width < 1180) {
    await page.getByRole('button', { name: 'Habits', exact: true }).click();
  } else {
    await page.locator('.corner-controls').getByRole('button', { name: 'Habits', exact: true }).click();
  }
  await page.getByRole('complementary', { name: 'Habits' }).waitFor();
  await wait(400);
}

// Made-up habits, with which days of this week each was ticked, and a color for some.
const HABITS = [
  ['Read 20 minutes', ['Mon 19 Oct', 'Tue 20 Oct', 'Wed 21 Oct'], 'Ocean'],
  ['Walk 8,000 steps', ['Mon 19 Oct', 'Tue 20 Oct', 'Wed 21 Oct'], null],
  ['No phone after 10pm', ['Mon 19 Oct', 'Tue 20 Oct'], 'Violet'],
  ['Stretch 10 minutes', ['Tue 20 Oct', 'Wed 21 Oct'], 'Tangerine'],
  ['Drink 2 liters of water', ['Mon 19 Oct', 'Tue 20 Oct'], 'Emerald'],
];
// Three weights this week (kg); today's is typed in the real box, the earlier ones are added to the saved Habits board.
const WEIGHTS = [
  ['2026-10-19', '73.1'],
  ['2026-10-20', '72.8'],
];

/** Fills the Habits panel through the real controls, with Lisbon already open behind it. Leaves the panel open on Week. */
async function fillHabits(page) {
  await openHabits(page);
  const panel = page.getByRole('complementary', { name: 'Habits' });
  await panel.getByRole('button', { name: 'Add a habit' }).click();
  const box = panel.getByRole('textbox', { name: 'New habit' });
  for (const [name] of HABITS) {
    await box.fill(name);
    await box.press('Enter');
  }
  const rows = panel.locator('.habit');
  for (const [i, [, days, color]] of HABITS.entries()) {
    for (const d of days) await rows.nth(i).getByRole('button', { name: new RegExp(`, ${d}$`) }).click();
    if (color) {
      await rows.nth(i).getByRole('button', { name: /^More for/ }).click();
      await rows.nth(i).getByRole('radio', { name: color }).click();
    }
  }
  const kg = panel.getByRole('textbox', { name: 'Weight in kg' });
  await kg.fill('72.4');
  await kg.press('Enter');
  await wait(900);
  // The earlier days: copy the saved weight item for each, then reload so the panel reads them.
  await page.evaluate((weights) => {
    const raw = JSON.parse(localStorage.getItem('note-board:v1'));
    const board = Object.values(raw.boards).find((b) => b.name === 'Habits');
    const card = Object.values(board.cards).find((c) => c.title === 'Weight');
    const first = card.items.find((i) => /^\d{4}-\d\d-\d\d \d+\.\d$/.test(i.text));
    weights.forEach(([day, kg], n) => card.items.unshift({ ...first, id: `w${n}`, text: `${day} ${kg}` }));
    localStorage.setItem('note-board:v1', JSON.stringify(raw));
  }, WEIGHTS);
  await reload(page);
  await openHabits(page);
  await wait(300);
}

/** Scrolls the Habits panel until this part sits just under the view bar (the bar stays in view). */
async function scrollPanelTo(page, selector, gap = 6) {
  await page.evaluate(([selector, gap]) => {
    const bar = document.querySelector('.habit-viewbar');
    const target = document.querySelector(selector);
    let box = bar.parentElement;
    while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;
    box.scrollTop += target.getBoundingClientRect().top - bar.getBoundingClientRect().bottom - gap;
  }, [selector, gap]);
  await wait(300);
}

// Starts a session on the "Weekend in Lisbon" board and hands the page to `then`.
async function lisbon(browser, device, theme, then) {
  const page = await newPage(browser, device, theme, { clock: NOW });
  try {
    await openLisbon(page);
    await then(page);
  } finally {
    await page.context().close();
  }
}

// --- the shots ---
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (i > 120) throw new Error('The app did not start');
    await wait(500);
  }

  // Phone: the whole board, the checklist with its item bar, dark, the ⋯ menu.
  // The app opens the example a little low on a phone; one swipe up gives the containers the room.
  if (wanted('phone-1-board'))
    await lisbon(browser, phone, 'light', async (p) => {
      await pan(p, 0, -70);
      await save(p, 'phone-1-board');
    });
  if (wanted('phone-2-checklist'))
    await lisbon(browser, phone, 'light', async (p) => {
      await p.evaluate(() => localStorage.setItem('note-board:view:v1', JSON.stringify({ panX: 10, panY: 20, zoom: 1 })));
      await reload(p);
      await p.getByText('Find a flat near Alfama').first().click();
      await save(p, 'phone-2-checklist');
    });
  if (wanted('phone-4-dark'))
    await lisbon(browser, phone, 'dark', async (p) => {
      await pan(p, 0, -70);
      await save(p, 'phone-4-dark');
    });
  if (wanted('phone-5-menu'))
    await lisbon(browser, phone, 'light', async (p) => {
      await moreButton(p).click();
      await p.getByRole('dialog', { name: 'More' }).waitFor();
      await save(p, 'phone-5-menu');
    });
  if (wanted('phone-6-habits'))
    await lisbon(browser, phone, 'light', async (p) => {
      await fillHabits(p);
      await save(p, 'phone-6-habits');
    });
  if (wanted('phone-7-ledger'))
    await lisbon(browser, phone, 'light', async (p) => {
      await fillHabits(p);
      await scrollPanelTo(p, '.habit', 90); // the habits, with the foot of the Weight card above them
      await save(p, 'phone-7-ledger');
    });
  if (wanted('phone-8-templates')) {
    const p = await newPage(browser, phone, 'light');
    await p.getByRole('heading', { name: 'Start from a template' }).waitFor();
    await save(p, 'phone-8-templates');
    await p.context().close();
  }

  // Phone: comments. Sam shares the example with a comment link and starts a thread; Alice opens the link on her phone and answers.
  if (wanted('phone-3-saturday')) {
    const sam = await newPage(browser, desktop, 'light', { user: 'Sam' });
    await openLisbon(sam);
    await sam.locator('header.toolbar').getByRole('button', { name: 'Share' }).click();
    const share = sam.getByRole('dialog', { name: /Share/ });
    await share.getByRole('button', { name: 'Share this board' }).click();
    await share.getByRole('button', { name: /^Link role:/ }).click();
    await share.getByRole('menu', { name: /^Link role/ }).getByRole('menuitemradio', { name: /^Can comment/ }).click();
    await share.getByRole('button', { name: 'Make a comment link' }).click();
    const link = share.getByLabel('Share link');
    await sam.waitForFunction(() => /\?join=/.test(document.querySelector('[aria-label="Share link"]')?.value ?? ''));
    const url = new URL(await link.inputValue());
    await sam.keyboard.press('Escape');
    const places = sam.locator('article[data-kind="todo"]').nth(2); // "Places to eat" (the title is a text box, so no text to find it by)
    await places.hover();
    await places.getByRole('button', { name: 'Add comment' }).click();
    const thread = sam.getByRole('dialog', { name: /^Comments on/ });
    await thread.getByLabel('Add a comment').fill('Should we book a table for Saturday night?');
    await thread.getByRole('button', { name: 'Comment', exact: true }).click();
    await thread.getByText('Should we book a table').waitFor();

    url.searchParams.set('demo-user', 'Alice');
    const alice = await newPage(browser, phone, 'light');
    await load(alice, url.pathname + url.search);
    await alice.getByLabel('Board name').and(alice.locator('[value="Weekend in Lisbon"]')).waitFor();
    await alice.getByRole('button', { name: 'Dismiss' }).click({ timeout: 3000 }).catch(() => {}); // the "you can comment" note
    await pan(alice, 0, -70); // the board opens a little low; keep the card in view above the thread
    await alice.getByRole('button', { name: /^1 comment/ }).click();
    const sheet = alice.getByRole('dialog', { name: /^Comments on/ });
    await sheet.getByLabel('Add a comment').fill('Good idea. Time Out Market is open until midnight, so I booked 8 pm.');
    await sheet.getByRole('button', { name: 'Comment', exact: true }).click();
    await sheet.getByText('I booked 8 pm', { exact: false }).waitFor();
    await thread.getByLabel('Add a comment').fill('Perfect, thank you!');
    await thread.getByRole('button', { name: 'Comment', exact: true }).click();
    await sheet.getByText('Perfect, thank you!').waitFor({ timeout: 10000 });
    await save(alice, 'phone-3-saturday');
    await alice.context().close();
    await sam.context().close();
  }

  // Tablets: the board in light and dark, and the Habits panel beside the board.
  for (const [name, device] of [['tablet-7in', tab7], ['tablet-10in', tab10]]) {
    const n = name === 'tablet-7in' ? '7in' : '10in';
    // The tall 7-inch screen opens the four containers small and low; show the first two or three larger, from the top.
    const view = async (p) => {
      if (name !== 'tablet-7in') return;
      await zoomTo(p, 100);
      const first = await p.locator('[data-col-id]').first().boundingBox();
      await pan(p, 24 - first.x, 90 - first.y, await emptySpot(p)); // a swipe on bare board: the first container to the top left
    };
    if (wanted(`${name}-1-board`))
      await lisbon(browser, device, 'light', async (p) => {
        await view(p);
        await save(p, `${name}-1-board`);
      });
    if (wanted(`${name}-2-dark`))
      await lisbon(browser, device, 'dark', async (p) => {
        await view(p);
        await save(p, `${name}-2-dark`);
      });
    if (wanted(`${name}-3-habits`))
      await lisbon(browser, device, 'light', async (p) => {
        await fillHabits(p);
        await view(p); // after the reload inside fillHabits
        await save(p, `${name}-3-habits`);
      });
  }

  // Feature graphic 1024x500: the icon, the name and one line on the site's honey background.
  if (wanted('feature-graphic')) {
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
  }
} finally {
  await browser.close();
  server.kill();
}
