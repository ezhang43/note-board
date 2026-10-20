import { expect, test, type Page } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// Every side panel can be resized like the calendar (owner request 2026-10-20, job #127): a thin
// strip on its left edge, arrows 20px a press, double-click for the usual width, never under 300px
// nor more than the window minus 300px, remembered on this device for each panel apart.

freshBoardEachTest();

const dock = (page: Page) => page.locator('.corner-controls');
const PANELS = [
  { name: 'Version history', button: 'Version history', handle: 'Resize version history', usual: 300 },
  { name: 'Completed', button: 'Completed', handle: 'Resize completed', usual: 300 },
  { name: 'Focus timer', button: 'Focus timer', handle: 'Resize focus timer', usual: 300 },
  { name: 'Journal', button: 'Journal', handle: 'Resize journal', usual: 420 },
  { name: 'Habits', button: 'Habits', handle: 'Resize habits', usual: 300 },
];
type Spec = (typeof PANELS)[number];

const open = (page: Page, p: Spec) => dock(page).getByRole('button', { name: p.button }).first().click();
const panel = (page: Page, p: Spec) => page.getByRole('complementary', { name: p.name });
const handle = (page: Page, p: Spec) => page.getByRole('separator', { name: p.handle });
const width = async (page: Page, p: Spec) => (await panel(page, p).boundingBox())!.width;
const cornerRight = async (page: Page) => {
  const box = (await dock(page).boundingBox())!;
  return page.viewportSize()!.width - box.x - box.width;
};
/** Drags the strip so the panel's left edge is at `x`. */
async function dragTo(page: Page, p: Spec, x: number) {
  const box = (await handle(page, p).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(x, box.y + 200, { steps: 6 });
  await page.mouse.up();
}

for (const p of PANELS) {
  test(`${p.name}: opens ${p.usual}px wide, the strip drags it wider and narrower within the limits, and the corner controls follow`, async ({ page }) => {
    await open(page, p);
    await expect(handle(page, p)).toBeVisible();
    expect(await width(page, p)).toBe(p.usual);
    await dragTo(page, p, 1440 - 560);
    await expect.poll(() => width(page, p)).toBe(560);
    await expect.poll(() => cornerRight(page)).toBe(584);
    await dragTo(page, p, 1430);
    await expect.poll(() => width(page, p)).toBe(300);
    await dragTo(page, p, 5);
    await expect.poll(() => width(page, p)).toBe(1140);
    // A narrow window keeps 300px of board beside it, and the width comes back when it grows.
    await page.setViewportSize({ width: 760, height: 800 });
    await expect.poll(() => width(page, p)).toBe(460);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => width(page, p)).toBe(1140);
  });

  test(`${p.name}: the strip works from the keyboard (20px an arrow press) and a double-click puts the usual width back`, async ({ page }) => {
    await open(page, p);
    const bar = handle(page, p);
    await expect(bar).toHaveAttribute('aria-orientation', 'vertical');
    await expect(bar).toHaveAttribute('aria-valuenow', String(p.usual));
    await expect(bar).toHaveAttribute('aria-valuemin', '300');
    await expect(bar).toHaveAttribute('aria-valuemax', '1140');
    await bar.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => width(page, p)).toBe(p.usual + 20);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => width(page, p)).toBe(p.usual + 40);
    await expect(bar).toHaveAttribute('aria-valuenow', String(p.usual + 40));
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => width(page, p)).toBe(p.usual + 20);
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(() => width(page, p)).toBe(300);
    await bar.dblclick();
    await expect.poll(() => width(page, p)).toBe(p.usual);
  });

  test(`${p.name}: has no strip on a phone-sized screen`, async ({ page }) => {
    await open(page, p);
    await expect(handle(page, p)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(handle(page, p)).toHaveCount(0);
  });
}

test('each panel keeps its own width, remembered on this device across a reload', async ({ page }) => {
  const [history, , timer, journal, habits] = PANELS;
  await open(page, journal);
  await dragTo(page, journal, 1440 - 640);
  await expect.poll(() => width(page, journal)).toBe(640);
  await open(page, habits);
  await expect.poll(() => width(page, habits)).toBe(300);
  await dragTo(page, habits, 1440 - 380);
  await expect.poll(() => width(page, habits)).toBe(380);
  // Another panel is not affected.
  await open(page, timer);
  await expect.poll(() => width(page, timer)).toBe(300);
  await open(page, history);
  await expect.poll(() => width(page, history)).toBe(300);
  // The width sits in this device's storage, under its own key.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('note-board:panel-widths')!))).toMatchObject({ journal: 640, habits: 380 });
  await page.reload();
  await open(page, journal);
  await expect.poll(() => width(page, journal)).toBe(640);
  await open(page, habits);
  await expect.poll(() => width(page, habits)).toBe(380);
  // The calendar's own key is left alone.
  expect(await page.evaluate(() => localStorage.getItem('note-board:calendar-width'))).toBeNull();
});

test('a bad remembered width falls back to the usual one', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('note-board:panel-widths', '{"journal":"huge","habits":5}'));
  await page.reload();
  const [, , , journal, habits] = PANELS;
  await open(page, journal);
  await expect.poll(() => width(page, journal)).toBe(420);
  await open(page, habits);
  await expect.poll(() => width(page, habits)).toBe(300);
});
