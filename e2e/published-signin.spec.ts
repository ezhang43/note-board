import { expect, test, type Page } from '@playwright/test';

// The published site's sign-in screen (owner pick, 2026-10-22, job #165b): a centered card with the logo,
// the About page's pitch, Google's standard sign-in button (their branding guidelines: dark version in
// dark mode), a short note, and About / Privacy / Terms links. Runs against the published build.

const card = (page: Page) => page.locator('.sign-in-panel');
const googleButton = (page: Page) => page.getByRole('button', { name: 'Sign in with Google' });

async function open(page: Page, dark = false) {
  await page.goto('./');
  await expect(googleButton(page)).toBeVisible();
  // Wait for the web fonts: a late font swap changes the text height by a pixel (the "About" link measured 35, not 36).
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  if (dark) await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
}

test('the sign-in card has the logo, the pitch, the Google button, a note and the three links', async ({ page }) => {
  await open(page);
  await expect(card(page).getByRole('heading', { level: 1, name: 'BusyAnts' })).toBeVisible();
  await expect(card(page).locator('img[src$="busyants-icon.svg"]')).toBeVisible();
  await expect(card(page).getByText('Free, with no limits. Your notes stay safe.')).toBeVisible();
  await expect(card(page).getByText(/Only you can see it/)).toBeVisible();
  const links = page.getByRole('navigation', { name: 'About BusyAnts' });
  for (const [name, path] of [['About', 'about/'], ['Privacy', 'privacy/'], ['Terms', 'terms/']]) {
    await expect(links.getByRole('link', { name, exact: true })).toHaveAttribute('href', `/note-board/${path}`);
  }
  // The card sits in the middle of the window.
  const b = (await card(page).boundingBox())!;
  const view = page.viewportSize()!;
  expect(Math.abs(b.x + b.width / 2 - view.width / 2)).toBeLessThan(2);
});

test('the links open the About, Privacy and Terms pages', async ({ page }) => {
  await open(page);
  for (const [name, path] of [['Privacy', 'privacy/'], ['Terms', 'terms/'], ['About', 'about/']]) {
    await page.getByRole('navigation', { name: 'About BusyAnts' }).getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/note-board/${path}$`));
    await page.goBack();
    await expect(googleButton(page)).toBeVisible();
  }
});

test('Google’s button follows their guidelines: white with a gray edge and dark text, the G, 44px tall; the dark version in dark mode', async ({ page }) => {
  await open(page);
  const style = (prop: string) => googleButton(page).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
  expect(await style('background-color')).toBe('rgb(255, 255, 255)');
  expect(await style('border-top-color')).toBe('rgb(116, 119, 117)');
  expect(await style('color')).toBe('rgb(31, 31, 31)');
  expect(await style('font-size')).toBe('14px');
  expect(await style('font-weight')).toBe('500');
  expect(await style('font-family')).toContain('Roboto');
  expect((await googleButton(page).boundingBox())!.height).toBe(44);
  const g = (await googleButton(page).locator('svg').boundingBox())!;
  expect([g.width, g.height]).toEqual([20, 20]);

  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  expect(await style('background-color')).toBe('rgb(19, 19, 20)');
  expect(await style('border-top-color')).toBe('rgb(142, 145, 143)');
  expect(await style('color')).toBe('rgb(227, 227, 227)');
});

test('the button and the links show a focus ring from the keyboard', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab');
  await expect(googleButton(page)).toBeFocused();
  expect(await googleButton(page).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toHaveText('Terms');
  expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
});

for (const dark of [false, true]) {
  test(`on a phone (${dark ? 'dark' : 'light'}) the card fits with no sideways scroll and the targets are touch-sized`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await open(page, dark);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const b = (await card(page).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    expect((await googleButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const name of ['About', 'Privacy', 'Terms']) {
      expect((await page.getByRole('link', { name, exact: true }).boundingBox())!.height, name).toBeGreaterThanOrEqual(36);
    }
    // In a short landscape phone the whole card can be reached (it scrolls rather than being cut off).
    await page.setViewportSize({ width: 667, height: 375 });
    await page.getByRole('link', { name: 'Terms', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('link', { name: 'Terms', exact: true })).toBeInViewport();
  });
}
