import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Rich paste (owner request, 2026-11-01): lines copied in the Journal keep their sizes, lists and looks when
// pasted into a Journal note; checklist items pasted there become a bulleted list; Journal lines pasted into an
// item of a checklist become items. Anything copied elsewhere stays plain words.

freshBoardEachTest();

const panel = (page: Page) => page.getByRole('complementary', { name: 'Journal' });
const today = (page: Page) => panel(page).getByRole('textbox', { name: /^Journal, / }).first();
const notes = (page: Page) => panel(page).getByRole('textbox', { name: 'General notes' });
const tools = (page: Page) => panel(page).getByRole('toolbar', { name: 'Formatting' });
const tool = (page: Page, name: string) => tools(page).getByRole('button', { name, exact: true });
const blocks = (ed: Locator) => ed.locator(':scope > div');
const openJournal = (page: Page) => page.locator('.corner-controls').getByRole('button', { name: 'Journal', exact: true }).click();
const rows = (list: Locator) => list.getByLabel('Item text').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
const depths = (list: Locator) => list.locator('[data-item-id]').evaluateAll((els) => els.map((el) => Math.round(parseFloat(getComputedStyle(el as HTMLElement).paddingLeft) / 32)));
const typeOf = (ed: Locator) => blocks(ed).evaluateAll((els) => els.map((el) => `${el.getAttribute('data-type')}${el.getAttribute('data-indent') ?? ''}:${el.textContent}`));

/** Adds a loose to-do list and types each text as an item. Returns the card. */
async function makeList(page: Page, texts: string[]) {
  await clickEmpty(page);
  await add(page, 'Checklist');
  const id = await page.locator('.card.selected').getAttribute('data-card-id');
  for (const [i, t] of texts.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(t);
  }
  return page.locator(`[data-card-id="${id}"]`);
}

/** In today's page: "plan" (size 18) and then a bulleted list "milk", "oat" one level deeper, all selected and copied. */
async function typeAndCopyJournal(page: Page) {
  await openJournal(page);
  await page.keyboard.type('plan');
  await page.keyboard.press('Enter');
  await tool(page, 'Bulleted list').click();
  await page.keyboard.type('milk');
  await page.keyboard.press('Enter');
  await page.keyboard.type('oat');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Shift+End');
  await tool(page, 'Text style').click();
  await page.getByRole('group', { name: 'Text style' }).getByRole('group', { name: 'Text size' }).getByRole('button', { name: 'Larger', exact: true }).click();
  await tool(page, 'Text style').click(); // close the menu, it sits over the notes
  await today(page).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
}

test('Journal lines paste into another Journal note with their size and list levels', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await typeAndCopyJournal(page);
  await notes(page).click();
  await page.keyboard.press('Control+v');
  await expect(notes(page).locator('[data-size="18"]')).toHaveText('plan');
  expect(await typeOf(notes(page))).toEqual(['p:plan', 'bullet:milk', 'bullet1:oat']);
  // The words on the clipboard are still plain words for other apps.
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'))).toContain('milk');
});

test('a paste is one undo step', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await typeAndCopyJournal(page);
  await notes(page).click();
  await page.keyboard.type('x');
  await page.keyboard.press('Control+v');
  expect(await typeOf(notes(page))).toEqual(['p:xplan', 'bullet:milk', 'bullet1:oat']);
  await page.keyboard.press('Control+z');
  await expect(notes(page)).toHaveText('x');
  await expect(notes(page).locator('[data-size]')).toHaveCount(0);
});

test('Ctrl+Shift+V pastes the same lines as plain words', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await typeAndCopyJournal(page);
  await notes(page).click();
  await page.keyboard.press('Control+Shift+v');
  await expect(notes(page)).toContainText('plan');
  await expect(notes(page)).toContainText('oat');
  await expect(notes(page).locator('[data-size]')).toHaveCount(0);
  await expect(notes(page).locator('[data-type="bullet"]')).toHaveCount(0);
});

test('words copied in another app paste as plain words, even the same ones', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await typeAndCopyJournal(page);
  await page.evaluate(() => navigator.clipboard.writeText('plan\nmilk')); // same words, no marker
  await notes(page).click();
  await page.keyboard.press('Control+v');
  expect(await typeOf(notes(page))).toEqual(['p:plan', 'p:milk']);
  await expect(notes(page).locator('[data-size]')).toHaveCount(0);
});

test('checklist items copied with Ctrl+C paste into the Journal as a bulleted list, sub-items as deeper levels', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const list = await makeList(page, ['milk', 'oat', 'eggs']);
  await list.getByLabel('Item text').nth(1).click();
  await page.keyboard.press('Tab');
  // From the start of "milk" to the end of "eggs" (Shift+click on text highlights letters, owner request 2026-11-01).
  await list.getByLabel('Item text').nth(0).click({ position: { x: 2, y: 8 } });
  const eggs = (await list.getByLabel('Item text').nth(2).boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.click(eggs.x + eggs.width - 3, eggs.y + eggs.height / 2);
  await page.keyboard.up('Shift');
  await expect(list.locator('.todo-item.picked')).toHaveCount(3);
  await page.keyboard.press('Control+c');
  await openJournal(page);
  await page.keyboard.press('Control+v');
  expect(await typeOf(today(page))).toEqual(['bullet:milk', 'bullet1:oat', 'bullet:eggs']);
});

test('Journal lines paste into an item of a checklist as items, sub-items by list level; dividers are skipped', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const list = await makeList(page, ['one']);
  await openJournal(page);
  await page.keyboard.type('milk');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await tool(page, 'Bulleted list').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('oat');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await list.getByLabel('Item text').first().click();
  await page.keyboard.press('Control+v');
  expect(await rows(list)).toEqual(['one', 'milk', 'oat']);
  expect(await depths(list)).toEqual([0, 0, 1]);
  await page.keyboard.press('Control+z'); // one undo step
  expect(await rows(list)).toEqual(['one']);
});
