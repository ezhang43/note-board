import { expect, test, type Page } from '@playwright/test';
import { add, box, clickEmpty, fontsLoaded } from './helpers';

// Focus timer (Pomodoro), owner request 2026-10-06: a toolbar button opens a side panel with a
// 25 / 5 / 15 minute timer that keeps running when the panel is closed and across a reload.

type Spy = { chimes: number; notes: string[]; asked: number; hidden: boolean };

test.beforeEach(async ({ page }) => {
  // Count chimes and notifications instead of playing or showing them; `hidden` stands for the tab being behind another.
  await page.addInitScript(() => {
    const spy: Spy = { chimes: 0, notes: [], asked: 0, hidden: false };
    (window as unknown as { spy: Spy }).spy = spy;
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor() {
        super();
        spy.chimes++;
      }
    } as typeof AudioContext;
    Object.defineProperty(Document.prototype, 'hidden', { get: () => spy.hidden });
    class FakeNotification {
      static permission = 'default';
      static requestPermission() {
        spy.asked++;
        FakeNotification.permission = 'granted';
        return Promise.resolve('granted');
      }
      constructor(title: string) {
        spy.notes.push(title);
      }
    }
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;
  });
  // The clock stands still, moving only when a test moves it, so the times shown are exact.
  await page.clock.install({ time: new Date('2026-10-06T09:00:00') });
  await page.clock.pauseAt(new Date('2026-10-06T09:00:01'));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await fontsLoaded(page);
});

// The toolbar is full at 1280px, so its button is by the zoom control, with Due and Version history.
const button = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: /^Focus timer/ });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Focus timer' });
const spy = (page: Page) => page.evaluate(() => (window as unknown as { spy: Spy }).spy);

test('start a focus round, see the time on its button with the panel closed, then the break', async ({ page }) => {
  await button(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole('timer')).toHaveText('25:00');
  await expect(panel(page).getByText('Focus · Round 1 of 4')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Start' }).click();
  expect((await spy(page)).asked).toBe(1); // asked once, on the first Start

  await page.clock.fastForward('06:18');
  await expect(panel(page).getByRole('timer')).toHaveText('18:42');
  // Closing the panel leaves it running; the button shows the time left.
  await panel(page).getByRole('button', { name: 'Close focus timer' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(button(page)).toHaveText('18:42');

  // The round ends while the tab is behind another: a chime and a notification.
  await page.evaluate(() => ((window as unknown as { spy: Spy }).spy.hidden = true));
  await page.clock.fastForward('18:42');
  const after = await spy(page);
  expect(after.chimes).toBe(1);
  expect(after.notes).toEqual(['Focus round done']);
  await page.evaluate(() => ((window as unknown as { spy: Spy }).spy.hidden = false));

  // The break waits for Start.
  await button(page).click();
  await expect(panel(page).getByText('Short break · Round 1 of 4')).toBeVisible();
  await expect(panel(page).getByRole('timer')).toHaveText('05:00');
  await expect(panel(page).getByRole('button', { name: 'Start' })).toBeVisible();
});

test('pause, reset and skip', async ({ page }) => {
  await button(page).click();
  await panel(page).getByRole('button', { name: 'Start' }).click();
  await page.clock.fastForward('02:00');
  await panel(page).getByRole('button', { name: 'Pause' }).click();
  await page.clock.fastForward('05:00');
  await expect(panel(page).getByRole('timer')).toHaveText('23:00');
  await panel(page).getByRole('button', { name: 'Reset' }).click();
  await expect(panel(page).getByRole('timer')).toHaveText('25:00');
  await panel(page).getByRole('button', { name: 'Skip' }).click();
  await expect(panel(page).getByText('Short break · Round 1 of 4')).toBeVisible();
  expect((await spy(page)).chimes).toBe(0); // skipping doesn't chime
});

test('a chime only, no notification, while the tab is in front; muted means no chime', async ({ page }) => {
  await button(page).click();
  await panel(page).getByRole('button', { name: 'Start' }).click();
  await page.clock.fastForward('25:00');
  expect(await spy(page)).toMatchObject({ chimes: 1, notes: [] });

  await panel(page).getByRole('checkbox', { name: 'Chime when a round ends' }).uncheck();
  await panel(page).getByRole('button', { name: 'Start' }).click();
  await page.clock.fastForward('05:00');
  expect((await spy(page)).chimes).toBe(1);
  await expect(panel(page).getByText('Focus · Round 2 of 4')).toBeVisible();
});

test('the lengths and mute are remembered on this device, and a running timer survives a reload', async ({ page }) => {
  await button(page).click();
  await panel(page).getByLabel('Focus (minutes)').fill('40');
  await panel(page).getByRole('checkbox', { name: 'Chime when a round ends' }).uncheck();
  await expect(panel(page).getByRole('timer')).toHaveText('40:00');
  await panel(page).getByRole('button', { name: 'Start' }).click();
  await page.clock.fastForward('10:00');
  await page.reload();
  await expect(button(page)).toHaveText('30:00');
  await button(page).click();
  await expect(panel(page).getByLabel('Focus (minutes)')).toHaveValue('40');
  await expect(panel(page).getByRole('checkbox', { name: 'Chime when a round ends' })).not.toBeChecked();
});

test('it shares the right-hand spot with Version history: one at a time; Escape closes it', async ({ page }) => {
  await button(page).click();
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Version history' })).toBeVisible();
  await button(page).click();
  await expect(page.getByRole('complementary', { name: 'Version history' })).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  // Escape while typing in a card only leaves the text box.
  await add(page, 'Note');
  await page.keyboard.type('Plan');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeVisible();
  // Escape with the shortcuts list open over it closes only the list.
  await clickEmpty(page);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
});

test('undo leaves the timer alone', async ({ page }) => {
  await add(page, 'Note');
  await page.keyboard.type('Plan');
  await clickEmpty(page);
  await button(page).click();
  await panel(page).getByRole('button', { name: 'Start' }).click();
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Note text')).toHaveValue('');
  await expect(panel(page).getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(panel(page).getByRole('timer')).toHaveText('25:00');
});

test('its button sits by the zoom control, right of Version history, and widens to show the time', async ({ page }) => {
  const history = await box(page.getByRole('button', { name: 'Version history', exact: true }));
  const idle = await box(button(page));
  expect(Math.abs(idle.y - history.y)).toBeLessThan(4);
  expect(idle.x).toBeGreaterThan(history.x);
  await button(page).click();
  await panel(page).getByRole('button', { name: 'Start' }).click();
  await panel(page).getByRole('button', { name: 'Close focus timer' }).click();
  await expect(button(page)).toHaveText('25:00');
  expect((await box(button(page))).width).toBeGreaterThan(idle.width);
});

test.describe('on a phone-sized screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the focus timer is in the ⋯ menu, showing the time left while it runs', async ({ page }) => {
    const more = () => page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true });
    await more().tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: /^Focus timer/ }).tap();
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole('button', { name: 'Start' }).tap();
    await page.clock.fastForward('01:00');
    await panel(page).getByRole('button', { name: 'Close focus timer' }).tap();
    await more().tap();
    await expect(page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: /^Focus timer/ })).toContainText('24:00');
  });
});
