import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { box, cards, fontsLoaded } from './helpers';

// The toolbar in medium windows (owner pick, 2026-10-22, job #165b): below 1180px wide, Arrange, File,
// Feedback, Appearance and Sign out fold into a ⋯ menu (Share stays); at 880px and below the Add and
// Color buttons show icons only. It has to fit, with nothing cut off, at tablet and small laptop widths.

const sample = fileURLToPath(new URL('./fixtures/milanote-sample.md', import.meta.url));
const toolbar = (page: Page) => page.locator('header.toolbar');
const more = (page: Page) => toolbar(page).getByRole('button', { name: 'More', exact: true });
const moreMenu = (page: Page) => page.getByRole('dialog', { name: 'More' });

/** A demo person who is "signed in": Feedback, Share and Sign out all show, as on the published site. */
async function start(page: Page, width: number) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/?signed-in&demo-user=Fold${Math.random().toString(36).slice(2, 8)}`);
  await fontsLoaded(page);
  return errors;
}

/** Nothing sticks out sideways: the toolbar, the page, and every control in the toolbar. */
async function expectFits(page: Page, width: number) {
  expect(await toolbar(page).evaluate((el) => el.scrollWidth <= el.clientWidth), `toolbar fits at ${width}px`).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `page fits at ${width}px`).toBe(true);
  const last = await toolbar(page).locator('> *').last().boundingBox();
  expect(last!.x + last!.width, `last control inside the window at ${width}px`).toBeLessThanOrEqual(width);
}

for (const width of [600, 667, 768, 834, 1024, 1179]) {
  test(`at ${width}px the toolbar fits, with Share visible and the rest in ⋯`, async ({ page }) => {
    const errors = await start(page, width);
    await expectFits(page, width);
    await expect(toolbar(page).getByRole('button', { name: 'Share', exact: true })).toBeVisible();
    for (const name of ['Arrange', 'File', 'Feedback', 'Appearance', 'Sign out']) await expect(toolbar(page).getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(more(page)).toBeVisible();
    // The Add buttons keep their names (and tooltips) whether or not their words show.
    for (const name of ['Note', 'Checklist', 'New container']) await expect(toolbar(page).getByRole('button', { name, exact: true })).toBeVisible();
    // The ⋯ menu itself stays inside the window.
    await more(page).click();
    const m = await box(moreMenu(page));
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
  });
}

for (const width of [1180, 1280]) {
  test(`at ${width}px the whole toolbar shows and there is no ⋯`, async ({ page }) => {
    await start(page, width);
    await expectFits(page, width);
    await expect(more(page)).toHaveCount(0);
    for (const name of ['Arrange', 'File', 'Feedback', 'Appearance', 'Sign out', 'Share']) await expect(toolbar(page).getByRole('button', { name, exact: true })).toBeVisible();
    await expect(toolbar(page).getByRole('button', { name: 'Note', exact: true }).locator('.tb-label')).toBeVisible();
  });
}

test('the Add buttons show their words down to 881px and only icons at 880px and below', async ({ page }) => {
  await start(page, 881);
  await expect(toolbar(page).getByRole('button', { name: 'Checklist', exact: true }).locator('.tb-label')).toBeVisible();
  await page.setViewportSize({ width: 880, height: 800 });
  const checklist = toolbar(page).getByRole('button', { name: 'Checklist', exact: true });
  await expect(checklist.locator('.tb-label')).toBeHidden();
  await expect(checklist).toHaveAttribute('title', /add a checklist/i);
  await expect(toolbar(page).getByRole('button', { name: 'Color of selected cards and containers' })).toBeVisible();
  await expectFits(page, 880);
});

test('resizing across 1180px swaps ⋯ for the full toolbar and back', async ({ page }) => {
  await start(page, 1024);
  await more(page).click();
  await expect(moreMenu(page)).toBeVisible();
  await page.setViewportSize({ width: 1300, height: 800 });
  await expect(more(page)).toHaveCount(0);
  await expect(toolbar(page).getByRole('button', { name: 'File', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(more(page)).toBeVisible();
  await expect(moreMenu(page)).toHaveCount(0);
});

test('⋯ opens and closes with a click, outside click and Escape (focus goes back to ⋯)', async ({ page }) => {
  await start(page, 768);
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false');
  await more(page).click();
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['Arrange', 'File', 'Feedback', 'Appearance', 'Sign out']) await expect(moreMenu(page).getByRole('button', { name, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(moreMenu(page)).toHaveCount(0);
  await expect(more(page)).toBeFocused();
  await more(page).click();
  await page.mouse.click(400, 500);
  await expect(moreMenu(page)).toHaveCount(0);
});

test('Arrange from ⋯ works: Snap to grid switches on and off', async ({ page }) => {
  await start(page, 768);
  await more(page).click();
  await moreMenu(page).getByRole('button', { name: 'Arrange', exact: true }).click();
  const snap = page.getByRole('button', { name: 'Snap to grid' });
  const before = await snap.getAttribute('aria-pressed');
  await snap.click();
  await expect(snap).not.toHaveAttribute('aria-pressed', before!);
  // Escape closes only the Arrange menu first, then ⋯.
  await page.keyboard.press('Escape');
  await expect(snap).toHaveCount(0);
  await expect(moreMenu(page)).toBeVisible();
});

test('Appearance from ⋯ switches Dark mode', async ({ page }) => {
  await start(page, 768);
  await more(page).click();
  await moreMenu(page).getByRole('button', { name: 'Appearance', exact: true }).click();
  await moreMenu(page).getByRole('button', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('File from ⋯ keeps working: Import file… still gets its file and adds the cards', async ({ page }) => {
  await start(page, 768);
  await more(page).click();
  await moreMenu(page).getByRole('button', { name: 'File', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Import file…' }).click();
  await (await chooser).setFiles(sample);
  await expect(cards(page).first()).toBeVisible();
  expect(await cards(page).count()).toBeGreaterThan(3);
});

test('Sign out from ⋯ does what the toolbar button does', async ({ page }) => {
  await start(page, 768);
  // (`?signed-in` shows the button locally; it only says Sign out works on the published site.)
  const said: string[] = [];
  page.on('dialog', (d) => {
    said.push(d.message());
    void d.dismiss();
  });
  await more(page).click();
  await moreMenu(page).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect.poll(() => said.join()).toContain('Sign out');
});

test('Feedback from ⋯ opens the feedback form and closes ⋯', async ({ page }) => {
  await start(page, 768);
  await more(page).click();
  await moreMenu(page).getByRole('button', { name: 'Feedback', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /feedback/i })).toBeVisible();
  await expect(moreMenu(page)).toHaveCount(0);
});

test('the Share panel still opens from the toolbar, below the fold', async ({ page }) => {
  await start(page, 768);
  await toolbar(page).getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Share/ })).toBeVisible();
  const p = await box(page.getByRole('dialog', { name: /Share/ }));
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(768);
});

test('an open side panel doesn’t narrow the toolbar: it still fits at 1200px with the widest panel', async ({ page }) => {
  await start(page, 1200);
  await page.locator('.corner-controls').getByRole('button', { name: 'Journal' }).first().click();
  const h = await box(page.getByRole('separator', { name: 'Resize journal' }));
  await page.mouse.move(h.x + h.width / 2, h.y + 200);
  await page.mouse.down();
  await page.mouse.move(310, h.y + 200, { steps: 6 });
  await page.mouse.up();
  await expectFits(page, 1200);
  expect((await box(toolbar(page))).width).toBe(1200);
});

test('the rows in ⋯ are 40px tall (the phone’s own sheet has 48px rows)', async ({ page }) => {
  await start(page, 768);
  await more(page).click();
  for (const name of ['Arrange', 'File', 'Feedback', 'Appearance', 'Sign out']) {
    expect((await box(moreMenu(page).getByRole('button', { name, exact: true }))).height, name).toBe(40);
  }
});

test('Sign out from ⋯ closes the menu', async ({ page }) => {
  await start(page, 768);
  page.on('dialog', (d) => void d.dismiss());
  await more(page).click();
  await moreMenu(page).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(moreMenu(page)).toHaveCount(0);
});
