import { expect, test, type Page } from '@playwright/test';

// Job 29 (owner request 2026-10-06): a small public website next to the app. The app stays at the
// site's address (so installed apps, bookmarks and share links keep working); the pages live at
// about/, faq/, terms/ and privacy/ beside it.

const PAGES = [
  { path: '/about/', title: 'BusyAnts: a calm, free visual board', h1: 'BusyAnts' },
  { path: '/faq/', title: 'BusyAnts: questions and answers', h1: 'Questions and answers' },
  { path: '/terms/', title: 'BusyAnts: terms of use', h1: 'Terms of use' },
  { path: '/privacy/', title: 'BusyAnts: privacy policy', h1: 'Privacy policy' },
];

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

for (const p of PAGES) {
  test(`${p.path} loads with its own title, description and one main heading`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(p.path);
    await expect(page).toHaveTitle(p.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\w{20,}|.{40,}/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(p.h1);
    // Not the app: no board on these pages.
    await expect(page.getByTestId('canvas')).toHaveCount(0);
    // Headings in order: never skip a level going down.
    const levels = await page.locator('h1, h2, h3, h4').evaluateAll((hs) => hs.map((h) => Number(h.tagName[1])));
    levels.forEach((l, i) => i > 0 && expect(l - levels[i - 1]).toBeLessThanOrEqual(1));
    expect(errors).toEqual([]);
  });

  test(`${p.path} links to the other pages and to the app`, async ({ page }) => {
    for (const q of PAGES) {
      await page.goto(p.path);
      const name = { '/about/': 'About', '/faq/': 'FAQ', '/terms/': 'Terms', '/privacy/': 'Privacy' }[q.path]!;
      await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(q.path);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(q.h1);
    }
    await page.goto(p.path);
    await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Open BusyAnts' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('canvas')).toBeVisible();
  });

  test(`${p.path} has the coffee link, and links leaving the site open safely`, async ({ page }) => {
    await page.goto(p.path);
    await expect(page.getByRole('link', { name: 'Buy me a coffee' }).first()).toHaveAttribute('href', 'https://buymeacoffee.com/ezcookie');
    for (const a of await page.locator('a[href^="http"]').all()) {
      await expect(a).toHaveAttribute('rel', /noopener/);
    }
  });

  test(`${p.path} fits a phone screen without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(p.path);
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
    // 16px side margins around the text.
    const box = (await page.locator('main h1').boundingBox())!;
    expect(Math.round(box.x)).toBeGreaterThanOrEqual(16);
  });

  test(`${p.path} follows the computer's dark setting, like the app`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(p.path);
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(light).toBe('rgb(250, 246, 236)');
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(dark).toBe('rgb(29, 27, 23)');
  });
}

test('the landing page says what BusyAnts is, shows a picture of a board and has one big start button', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.getByText('A calm, free visual board for notes and checklists. Plan together in real time.')).toBeVisible();
  const shot = page.getByRole('img', { name: /BusyAnts board/ });
  await expect(shot).toBeVisible();
  expect(await shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const start = page.getByRole('link', { name: 'Start your board, free' });
  await expect(start).toHaveCount(1);
  await start.click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('canvas')).toBeVisible();
});

test('the app still opens at its own address, and a share link in the existing format still opens the app', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.goto('/?join=sabc123.k3y');
  await expect(page.getByTestId('canvas')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('join')).toBe('sabc123.k3y');
  expect(errors).toEqual([]);
});

test('the keyboard shortcuts panel links to the website pages', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  const panel = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  for (const [name, path] of [
    ['About BusyAnts', '/about/'],
    ['FAQ', '/faq/'],
    ['Terms of use', '/terms/'],
    ['Privacy policy', '/privacy/'],
  ]) {
    await expect(panel.getByRole('link', { name, exact: true })).toHaveAttribute('href', path);
  }
});

test.describe('on a phone-sized screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the ⋯ menu links to the About page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    const link = page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'About BusyAnts' });
    await expect(link).toHaveAttribute('href', '/about/');
  });
});
