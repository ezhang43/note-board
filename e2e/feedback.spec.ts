import { expect, test, type Page } from '@playwright/test';
import { add, fontsLoaded } from './helpers';

// Send feedback (owner request, job #69). On the published site it is saved to Firestore with the
// person's email; here it is tried with a demo person (?demo-user=), whose note goes to the dev
// server instead. Running locally without a demo person there is no account, so it isn't offered
// (on the published site, signed-out people only see the sign-in screen).
// Its own Feedback button (owner decision, 2026-10-16) sits next to File on a computer, and is a
// Feedback row in ⋯ More on a phone, above About BusyAnts. The File menu no longer lists it.

const fileMenu = (page: Page) => page.getByRole('menu', { name: 'File' });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Send feedback' });
const box = (page: Page) => panel(page).getByLabel('Your feedback');
const send = (page: Page) => panel(page).getByRole('button', { name: /^(Send|Sending…)$/ });
const feedbackButton = (page: Page) => page.locator('header.toolbar').getByRole('button', { name: 'Feedback', exact: true });

async function openPanel(page: Page) {
  await feedbackButton(page).click();
  await expect(panel(page)).toBeVisible();
}

async function demo(page: Page) {
  await page.goto(`/?demo-user=Fay${Math.random().toString(36).slice(2, 8)}`);
  await fontsLoaded(page);
}

test('running locally without an account, Send feedback isn’t offered', async ({ page }) => {
  await page.goto('/');
  await expect(feedbackButton(page)).toHaveCount(0);
  await page.locator('header.toolbar').getByRole('button', { name: 'File' }).click();
  await expect(fileMenu(page)).toBeVisible();
  await expect(fileMenu(page).getByRole('menuitem', { name: 'Send feedback…' })).toHaveCount(0);
});

test('signed in, Feedback is its own toolbar button next to File, and File no longer lists it', async ({ page }) => {
  await demo(page);
  const button = feedbackButton(page);
  await expect(button).toHaveText('Feedback');
  await expect(button.locator('svg')).toHaveCount(1);
  // Right after File.
  const file = page.locator('header.toolbar').getByRole('button', { name: 'File' });
  const [f, b] = [(await file.boundingBox())!, (await button.boundingBox())!];
  expect(b.x).toBeGreaterThan(f.x + f.width - 1);
  expect(b.x - (f.x + f.width)).toBeLessThan(20);
  await file.click();
  await expect(fileMenu(page)).toBeVisible();
  await expect(fileMenu(page).getByRole('menuitem', { name: 'Send feedback…' })).toHaveCount(0);
  await expect(fileMenu(page).getByRole('menuitem', { name: 'Delete account…' })).toBeVisible();
});

test('signed in, Feedback sends the note (trimmed) and says thanks', async ({ page }) => {
  await demo(page);
  const sent: unknown[] = [];
  await page.route('**/__collab/feedback', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, body: '{}' });
  });
  await openPanel(page);
  await expect(panel(page)).toContainText('with your email address');
  await expect(box(page)).toBeFocused();
  // Nothing to send yet.
  await expect(send(page)).toBeDisabled();
  await box(page).fill('   ');
  await expect(send(page)).toBeDisabled();
  await box(page).fill('  Love the checklists!\nMore colors please.  ');
  // Typing doesn't reach the board's shortcuts.
  await expect(page.locator('[data-card-id]')).toHaveCount(0);
  await send(page).click();
  await expect(panel(page)).toContainText('Thanks — sent');
  expect(sent).toEqual([{ text: 'Love the checklists!\nMore colors please.', uid: expect.stringMatching(/^demo-fay/) }]);
  await panel(page).getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(panel(page)).toHaveCount(0);
  // Opening it again starts with an empty box.
  await openPanel(page);
  await expect(box(page)).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
});

test('a note is at most 1,000 characters, with a count', async ({ page }) => {
  await demo(page);
  await openPanel(page);
  await box(page).fill('a'.repeat(1200));
  await expect(box(page)).toHaveValue('a'.repeat(1000));
  await expect(panel(page)).toContainText('1000 / 1000');
});

test('if sending fails, it says so and keeps the text to try again', async ({ page }) => {
  await demo(page);
  await page.route('**/__collab/feedback', (route) => route.abort());
  await openPanel(page);
  await box(page).fill('Please add images');
  await send(page).click();
  await expect(panel(page).getByRole('alert')).toHaveText('Couldn’t send. Check your connection and try again.');
  await expect(box(page)).toHaveValue('Please add images');
  await page.unroute('**/__collab/feedback');
  await send(page).click();
  await expect(panel(page)).toContainText('Thanks — sent');
});

test('closing the box by mistake keeps what was typed', async ({ page }) => {
  await demo(page);
  await openPanel(page);
  await box(page).fill('Half a thought');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await openPanel(page);
  await expect(box(page)).toHaveValue('Half a thought');
});

test('a send that hangs doesn’t trap the board: the box closes, and opening it again shows it still sending, then thanks', async ({ page }) => {
  await demo(page);
  let answer = () => {};
  await page.route('**/__collab/feedback', (route) => {
    answer = () => void route.fulfill({ status: 200, body: '{}' });
  });
  await openPanel(page);
  await box(page).fill('Slow wifi here');
  await send(page).click();
  await expect(send(page)).toHaveText('Sending…');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  // Opened again while it is still on its way: it can't be sent twice.
  await openPanel(page);
  await expect(send(page)).toBeDisabled();
  await expect(send(page)).toHaveText('Sending…');
  answer();
  await expect(panel(page)).toContainText('Thanks — sent');
});

test('board keys don’t act behind the open box', async ({ page }) => {
  await demo(page);
  await page.route('**/__collab/feedback', (route) => route.fulfill({ status: 200, body: '{}' }));
  await openPanel(page);
  await box(page).fill('Hi');
  await send(page).click();
  // Focus is on Close now, not a text field: V would pick the Select tool on the board.
  await expect(panel(page).getByRole('button', { name: 'Close', exact: true }).last()).toBeFocused();
  await expect(page.getByRole('button', { name: 'Select (V)' })).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('v');
  await expect(page.getByRole('button', { name: 'Select (V)' })).toHaveAttribute('aria-pressed', 'false');
});

test('after a failed send the typing goes back to the box, and board keys still don’t act', async ({ page }) => {
  await demo(page);
  await page.route('**/__collab/feedback', (route) => route.abort());
  await openPanel(page);
  await box(page).fill('Hi');
  await send(page).click();
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(box(page)).toBeFocused();
  // Clicking the panel's plain text moves focus off the box: V still leaves the board alone.
  await panel(page).getByText('Sent with your email address').click();
  await page.keyboard.press('v');
  await expect(page.getByRole('button', { name: 'Select (V)' })).toHaveAttribute('aria-pressed', 'false');
  await expect(panel(page)).toBeVisible();
});

test('while the box is open, Tab can’t reach the board, and Ctrl+F and Ctrl+Z / Ctrl+Y leave the board alone', async ({ page }) => {
  await demo(page);
  await add(page, 'Note');
  await page.keyboard.type('Keep me');
  await page.keyboard.press('Escape');
  await openPanel(page);
  // Even from the page itself (after a click on the panel's text), Tab only reaches the panel.
  await panel(page).getByText('Sent with your email address').click();
  const outsidePanel = () => panel(page).evaluate((p) => document.activeElement !== document.body && !p.contains(document.activeElement));
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await outsidePanel()).toBe(false);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await outsidePanel()).toBe(false);
  await page.keyboard.press('Control+f');
  await expect(page.getByRole('search', { name: 'Search the board' })).toHaveCount(0);
  // The box undoes its own typing, and undoing past it changes nothing behind.
  await box(page).click();
  await page.keyboard.type('Hi');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  await expect(box(page)).toHaveValue('');
  await page.keyboard.press('Control+y');
  await page.locator('body').focus();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-card-id]')).toHaveCount(1);
  await expect(page.getByLabel('Note text')).toHaveValue('Keep me');
});

test('Escape closes only the box, not the side panel behind it', async ({ page }) => {
  await demo(page);
  await page.locator('.corner-controls').getByRole('button', { name: /^Focus timer/ }).click();
  const side = page.getByRole('complementary', { name: 'Focus timer' });
  await expect(side).toBeVisible();
  await openPanel(page);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(side).toBeVisible();
});

test('offline, Send is off and says why', async ({ page }) => {
  await demo(page);
  await openPanel(page);
  await box(page).fill('Hello');
  await page.context().setOffline(true);
  await expect(panel(page)).toContainText('You’re offline. Connect to the internet to send feedback.');
  await expect(send(page)).toBeDisabled();
  await page.context().setOffline(false);
  await expect(send(page)).toBeEnabled();
});

test('on a phone, ⋯ More has a Feedback row above About BusyAnts, and File no longer lists it', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await demo(page);
  await page.getByRole('button', { name: 'More' }).click();
  const more = page.getByRole('dialog', { name: 'More' });
  await more.getByRole('button', { name: 'File' }).click();
  await expect(fileMenu(page)).toBeVisible();
  await expect(fileMenu(page).getByRole('menuitem', { name: 'Send feedback…' })).toHaveCount(0);
  await more.getByRole('button', { name: 'File' }).click();
  const row = more.getByRole('button', { name: 'Feedback', exact: true });
  const about = more.getByRole('link', { name: 'About BusyAnts' });
  // The row just before About BusyAnts.
  expect(await row.evaluate((el, a) => el.nextElementSibling === a, await about.elementHandle())).toBe(true);
  await row.click();
  await expect(panel(page)).toBeVisible();
  const box = (await panel(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await context.close();
});
