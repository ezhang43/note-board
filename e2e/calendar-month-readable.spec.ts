import { expect, test, type Page } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Month view readability improvements:
// 1. Expand / Collapse wide toggle in the Calendar header (desktop Month view only)
// 2. Slim colored left bar (no 11px dot), 3-line wrap, more events per cell (3 narrow / 4 normal / 5 wide)
// 3. Desktop hover preview popover (full title, time range, location) without stealing focus or breaking click/drag
// 4. Side-by-side selected-day agenda when wide (>= 720px), stacked below when narrow or on phone

const tag = () => Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const PINNED = new Date(2026, 10, 15, 12, 0);

async function openAs(page: Page, user = `MonthRead${tag()}`) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(PINNED);
  await page.setExtraHTTPHeaders({ 'x-demo-today': key(PINNED) });
  await page.goto(`/?demo-user=${user}`);
  await fontsLoaded(page);
  await page.locator('.corner-controls').getByRole('button', { name: 'Google Calendar' }).click();
  return errors;
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Google Calendar' });
const viewButton = (page: Page, name: 'Week' | 'Month') => panel(page).getByRole('button', { name, exact: true });
const todayCell = (page: Page) => panel(page).getByRole('grid').getByRole('gridcell', { name: new RegExp(`^${label(PINNED)}`) });
const dayRegion = (page: Page, d = PINNED) => panel(page).getByRole('region', { name: label(d) });
const form = (page: Page) => panel(page).getByRole('form');
const widthOf = async (page: Page) => Math.round((await panel(page).boundingBox())!.width);

async function addEvent(page: Page, title: string, start: string, end: string) {
  await dayRegion(page).getByRole('button', { name: `Add event on ${label(PINNED)}` }).click();
  await form(page).getByLabel('Title').fill(title);
  await form(page).getByLabel('Start time').fill(start);
  await form(page).getByLabel('Start time').press('Tab');
  await form(page).getByLabel('End time').fill(end);
  await form(page).getByLabel('End time').press('Tab');
  await form(page).getByRole('button', { name: 'Save' }).click();
  await expect(form(page)).toHaveCount(0);
}

test('Expand / Collapse toggle widens Month view to ~80% without overwriting saved width, and restores on collapse, Week, or close', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await openAs(page);

  // Not shown in Week view.
  await expect(panel(page).getByRole('button', { name: /Expand calendar|Collapse calendar/ })).toHaveCount(0);

  // Switch to Month view: Expand button appears.
  await viewButton(page, 'Month').click();
  await expect.poll(() => widthOf(page)).toBe(720);
  const expandBtn = panel(page).getByRole('button', { name: 'Expand calendar' });
  await expect(expandBtn).toBeVisible();
  await expect(expandBtn).toHaveAttribute('aria-pressed', 'false');

  // Click Expand: panel widens to ~1140px (~79% of 1440px, leaving 300px of board).
  await expandBtn.click();
  await expect.poll(() => widthOf(page)).toBe(1140);
  const collapseBtn = panel(page).getByRole('button', { name: 'Collapse calendar' });
  await expect(collapseBtn).toBeVisible();
  await expect(collapseBtn).toHaveAttribute('aria-pressed', 'true');

  // Saved width in localStorage is NOT modified by Expand.
  const saved = await page.evaluate(() => localStorage.getItem('note-board:calendar-width'));
  expect(saved).toBeNull();

  // Click Collapse: restores 720px.
  await collapseBtn.click();
  await expect.poll(() => widthOf(page)).toBe(720);

  // Expand again, then switch to Week view: restores Week width (420px) and hides button.
  await panel(page).getByRole('button', { name: 'Expand calendar' }).click();
  await expect.poll(() => widthOf(page)).toBe(1140);
  await viewButton(page, 'Week').click();
  await expect.poll(() => widthOf(page)).toBe(420);
  await expect(panel(page).getByRole('button', { name: /Expand calendar|Collapse calendar/ })).toHaveCount(0);

  // Switching back to Month stays unexpanded (720px).
  await viewButton(page, 'Month').click();
  await expect.poll(() => widthOf(page)).toBe(720);

  // Expand again, then close and reopen the panel: restores saved width (not expanded).
  await panel(page).getByRole('button', { name: 'Expand calendar' }).click();
  await expect.poll(() => widthOf(page)).toBe(1140);
  await panel(page).getByRole('button', { name: 'Close google calendar' }).click();
  await expect(panel(page)).toHaveCount(0);
  await page.locator('.corner-controls').getByRole('button', { name: 'Google Calendar' }).click();
  await expect.poll(() => widthOf(page)).toBe(720);

  expect(errors).toEqual([]);
});

test('Month chips use a slim colored left bar (no dot), wrap to 3 lines, and show more events per cell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await openAs(page);
  await viewButton(page, 'Month').click();

  // No .cal-chip-dot; timed chips use a 2.5px left border instead.
  await expect(panel(page).locator('.cal-chip-dot')).toHaveCount(0);
  const dentist = todayCell(page).locator('.cal-chip').filter({ hasText: 'Dentist' });
  await expect(dentist).toBeVisible();
  const chipStyle = await dentist.evaluate((el) => {
    const s = getComputedStyle(el);
    return { borderLeftWidth: parseFloat(s.borderLeftWidth), lineClamp: s.webkitLineClamp };
  });
  expect(chipStyle.borderLeftWidth).toBeGreaterThanOrEqual(2);
  expect(chipStyle.borderLeftWidth).toBeLessThanOrEqual(3);
  expect(chipStyle.lineClamp).toBe('3');

  // Start with 2 events today (Team stand-up, Dentist). Add 2 more -> 4 total: all 4 fit at default 720px width!
  await addEvent(page, 'Swim', '07:00', '07:45');
  await addEvent(page, 'Run', '06:00', '06:30');
  await expect(todayCell(page).locator('.cal-chip')).toHaveCount(4);
  await expect(todayCell(page).locator('.cal-more')).toHaveCount(0);

  // Add a 5th event -> at default 720px width (cap 4), shows 3 chips + "+2 more".
  await addEvent(page, 'Stretch', '05:00', '05:30');
  await expect(todayCell(page).locator('.cal-chip')).toHaveCount(3);
  await expect(todayCell(page).getByRole('button', { name: '+2 more' })).toBeVisible();

  // Expand Month view (cells >= 110px -> cap 5): all 5 events show with no "+N more"!
  await panel(page).getByRole('button', { name: 'Expand calendar' }).click();
  await expect.poll(() => widthOf(page)).toBe(1140);
  await expect(todayCell(page).locator('.cal-chip')).toHaveCount(5);
  await expect(todayCell(page).locator('.cal-more')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('Desktop hover preview shows full title, time range, and location, and dismisses on leave, Escape, click, and drag', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const longTitle = 'Quarterly Product Strategy & Roadmap Alignment Review with Leadership';
  // Inject a location and long title onto the dentist event from the dev calendar API.
  await page.route('**/__calendar/calendar/v3/calendars/primary/events**', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    if (Array.isArray(json.items)) {
      for (const item of json.items) {
        if (item.id === 'dentist') {
          item.summary = longTitle;
          item.location = 'Building 4, Room 202';
        }
      }
    }
    await route.fulfill({ response: res, json });
  });

  const errors = await openAs(page);
  await viewButton(page, 'Month').click();

  const chip = todayCell(page).locator('.cal-chip').filter({ hasText: 'Quarterly Product' });
  await expect(chip).toBeVisible();

  // Hover shows the floating preview popover with full title, time range, and location.
  await chip.hover();
  const preview = page.locator('.cal-hover-preview[role="tooltip"]');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(longTitle);
  await expect(preview).toContainText('10 – 11am');
  await expect(preview).toContainText('Building 4, Room 202');

  // Popover stays inside the viewport, sits right next to the hovered chip (not displaced by container-type), and does not steal focus.
  const chipBox = (await chip.boundingBox())!;
  const box = (await preview.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1440);
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  const nearAbove = Math.abs(box.y + box.height + 6 - chipBox.y) < 12;
  const nearBelow = Math.abs(box.y - (chipBox.y + chipBox.height + 6)) < 12;
  expect(nearAbove || nearBelow).toBe(true);
  expect(Math.abs(box.x - chipBox.x)).toBeLessThan(280);
  const focusInPreview = await preview.evaluate((el) => el.contains(document.activeElement));
  expect(focusInPreview).toBe(false);

  // Escape dismisses the hover preview without closing the Calendar panel.
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(panel(page)).toBeVisible();

  // Hover again, then move mouse away: dismisses on mouseleave.
  await page.mouse.move(10, 10);
  await chip.hover();
  await expect(preview).toBeVisible();
  await page.mouse.move(10, 10);
  await expect(preview).toHaveCount(0);

  // Hover, then click: dismisses preview and opens EventCard as usual.
  await chip.hover();
  await expect(preview).toBeVisible();
  await chip.click();
  await expect(preview).toHaveCount(0);
  await expect(panel(page).getByRole('dialog', { name: longTitle })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('dialog')).toHaveCount(0);

  // Hover, then drag to tomorrow: dismisses preview and moves the event cleanly.
  const tomorrow = new Date(PINNED.getFullYear(), PINNED.getMonth(), PINNED.getDate() + 1);
  const tomorrowCell = panel(page).getByRole('grid').getByRole('gridcell', { name: new RegExp(`^${label(tomorrow)}`) });
  await page.mouse.move(10, 10);
  await chip.hover();
  await expect(preview).toBeVisible();
  const from = (await chip.boundingBox())!;
  const to = (await tomorrowCell.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await expect(preview).toHaveCount(0);
  await page.mouse.up();
  await expect(tomorrowCell.locator('.cal-chip').filter({ hasText: 'Quarterly Product' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('Selected-day agenda sits side-by-side when wide (expanded / >= 800px) and stacked below when narrow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await openAs(page);
  await viewButton(page, 'Month').click();
  await expect.poll(() => widthOf(page)).toBe(720);

  const grid = panel(page).getByRole('grid');
  const agenda = dayRegion(page);

  // Expanded (1140px): agenda sits to the right of the Month grid.
  await panel(page).getByRole('button', { name: 'Expand calendar' }).click();
  await expect.poll(() => widthOf(page)).toBe(1140);
  const gridWide = (await grid.boundingBox())!;
  const agendaWide = (await agenda.boundingBox())!;
  expect(agendaWide.x).toBeGreaterThanOrEqual(gridWide.x + gridWide.width - 1);
  expect(Math.abs(agendaWide.y - gridWide.y)).toBeLessThan(24);

  // Collapsed & narrowed (460px): agenda stacks below the Month grid.
  await panel(page).getByRole('button', { name: 'Collapse calendar' }).click();
  await page.setViewportSize({ width: 760, height: 900 });
  await expect.poll(() => widthOf(page)).toBe(460);
  const gridNarrow = (await grid.boundingBox())!;
  const agendaNarrow = (await agenda.boundingBox())!;
  expect(agendaNarrow.y).toBeGreaterThanOrEqual(gridNarrow.y + gridNarrow.height - 1);

  expect(errors).toEqual([]);
});

test('when Month calendar is expanded beside Main checklist, dragging and arrowing the divider resizes both panels smoothly within limits', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await openAs(page);
  const checklist = page.getByRole('complementary', { name: 'Checklist', exact: true });
  const divider = page.getByRole('separator', { name: 'Resize calendar' });
  const checklistWidth = async () => Math.round((await checklist.boundingBox())!.width);
  const dragDividerTo = async (x: number) => {
    const box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(x, box.y + 200, { steps: 2 });
    await page.mouse.up();
  };

  // Open Main checklist (420px) and switch Calendar to Month (720px).
  await page.locator('.corner-controls').getByRole('button', { name: 'Checklist', exact: true }).click();
  await expect(checklist).toBeVisible();
  await viewButton(page, 'Month').click();
  await expect.poll(() => widthOf(page)).toBe(720);
  await expect.poll(() => checklistWidth()).toBe(420);

  // Expand Month calendar: panels meet at x = 300 (Checklist 300px, Calendar 1140px) with one shared divider.
  await panel(page).getByRole('button', { name: 'Expand calendar' }).click();
  await expect.poll(() => widthOf(page)).toBe(1140);
  await expect.poll(() => checklistWidth()).toBe(300);
  await expect(page.getByRole('separator', { name: 'Resize checklist' })).toHaveCount(0);
  await expect(divider).toBeVisible();

  // Drag right to x = 560, then back left to x = 400.
  await dragDividerTo(560);
  await expect.poll(() => checklistWidth()).toBe(560);
  await expect.poll(() => widthOf(page)).toBe(880);
  await dragDividerTo(400);
  await expect.poll(() => checklistWidth()).toBe(400);
  await expect.poll(() => widthOf(page)).toBe(1040);

  // Clamps so neither panel shrinks below 300px.
  await dragDividerTo(1400);
  await expect.poll(() => widthOf(page)).toBe(300);
  await expect.poll(() => checklistWidth()).toBe(1140);
  await dragDividerTo(50);
  await expect.poll(() => checklistWidth()).toBe(300);
  await expect.poll(() => widthOf(page)).toBe(1140);

  // Keyboard arrows move the split by 20px, and double-click resets it to the default expanded split.
  await divider.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => checklistWidth()).toBe(320);
  await expect.poll(() => widthOf(page)).toBe(1120);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => checklistWidth()).toBe(300);
  await expect.poll(() => widthOf(page)).toBe(1140);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => checklistWidth()).toBe(320);
  await divider.dblclick();
  await expect.poll(() => checklistWidth()).toBe(300);
  await expect.poll(() => widthOf(page)).toBe(1140);

  expect(errors).toEqual([]);
});

test('dragging the expanded Month / Checklist divider preserves saved widths on collapse, Week switch, and closing Checklist', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await openAs(page);
  const checklist = page.getByRole('complementary', { name: 'Checklist', exact: true });
  const divider = page.getByRole('separator', { name: 'Resize calendar' });
  const checklistWidth = async () => Math.round((await checklist.boundingBox())!.width);
  const dragDividerTo = async (x: number) => {
    const box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(x, box.y + 200, { steps: 2 });
    await page.mouse.up();
  };

  await page.locator('.corner-controls').getByRole('button', { name: 'Checklist', exact: true }).click();
  await viewButton(page, 'Month').click();
  await panel(page).getByRole('button', { name: 'Expand calendar' }).click();
  await expect.poll(() => widthOf(page)).toBe(1140);

  // Drag divider to x = 600: stays expanded, neither saved width is written.
  await dragDividerTo(600);
  await expect.poll(() => checklistWidth()).toBe(600);
  await expect.poll(() => widthOf(page)).toBe(840);
  await expect(panel(page).getByRole('button', { name: 'Collapse calendar' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('note-board:calendar-width'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('note-board:panel-widths'))).toBeNull();

  // Collapse restores saved Month (720px) and Checklist (420px) widths, and Checklist's own strip returns.
  await panel(page).getByRole('button', { name: 'Collapse calendar' }).click();
  await expect.poll(() => widthOf(page)).toBe(720);
  await expect.poll(() => checklistWidth()).toBe(420);
  await expect(page.getByRole('separator', { name: 'Resize checklist' })).toBeVisible();

  // Expand, drag, then close Checklist: expanded Calendar returns to default 1140px.
  await panel(page).getByRole('button', { name: 'Expand calendar' }).click();
  await dragDividerTo(620);
  await expect.poll(() => checklistWidth()).toBe(620);
  await checklist.getByRole('button', { name: 'Close checklist' }).click();
  await expect(checklist).toHaveCount(0);
  await expect.poll(() => widthOf(page)).toBe(1140);

  // Reopen Checklist, drag, then switch to Week: restores Week (420px) and Checklist (420px).
  await page.locator('.corner-controls').getByRole('button', { name: 'Checklist', exact: true }).click();
  await dragDividerTo(580);
  await expect.poll(() => checklistWidth()).toBe(580);
  await viewButton(page, 'Week').click();
  await expect.poll(() => widthOf(page)).toBe(420);
  await expect.poll(() => checklistWidth()).toBe(420);

  expect(errors).toEqual([]);
});

test.describe('on a phone-sized screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('no Expand button, stacked agenda, and tapping a chip never leaves a hover preview', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.setFixedTime(PINNED);
    await page.setExtraHTTPHeaders({ 'x-demo-today': key(PINNED) });
    await page.goto(`/?demo-user=MonthPhone${tag()}`);
    await fontsLoaded(page);
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Google Calendar' }).tap();
    await viewButton(page, 'Month').tap();

    await expect(panel(page).getByRole('button', { name: /Expand calendar|Collapse calendar/ })).toHaveCount(0);

    const gridBox = (await panel(page).getByRole('grid').boundingBox())!;
    const agendaBox = (await dayRegion(page).boundingBox())!;
    expect(agendaBox.y).toBeGreaterThanOrEqual(gridBox.y + gridBox.height - 1);

    const chip = todayCell(page).locator('.cal-chip').filter({ hasText: 'Dentist' });
    await chip.tap();
    await expect(page.locator('.cal-hover-preview')).toHaveCount(0);
    await expect(panel(page).getByRole('dialog', { name: 'Dentist' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
