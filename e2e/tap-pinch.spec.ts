import { expect, test, type Page } from '@playwright/test';
import { add, clickEmpty, freshBoardEachTest } from './helpers';

// Tap rule (SPEC "Phone layout", job 224 follow-up): a second finger cancels a tap, whichever finger lifts first.
// Guards for the taps that already did (the board's zoom taps, a tap that selects a card); the tick box's own is in
// e2e/ticked-item-delete-key.spec.ts. Real touches through Chrome's DevTools protocol.

freshBoardEachTest();
test.use({ hasTouch: true });

type Finger = { x: number; y: number; id: number };
async function fingers(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  return (type: 'touchStart' | 'touchEnd', pts: Finger[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
}
const zoom = async (page: Page) => Number(await page.getByTestId('canvas').getAttribute('data-zoom'));

for (const order of ['first lifts first', 'second lifts first']) {
  test(`two quick two-finger taps on the empty board are not a double tap, and a rest of two fingers is not a long tap (${order})`, async ({ page }) => {
    const send = await fingers(page);
    const c = (await page.getByTestId('canvas').boundingBox())!;
    const one = { x: c.x + c.width / 2, y: c.y + c.height / 2, id: 1 };
    const two = { x: one.x + 80, y: one.y, id: 2 };
    const lift = async () => {
      const [a, b] = order === 'first lifts first' ? [one, two] : [two, one];
      await send('touchEnd', [a]);
      await send('touchEnd', [b]);
    };
    const before = await zoom(page);
    for (let i = 0; i < 2; i++) {
      await send('touchStart', [one]);
      await send('touchStart', [one, two]);
      await lift();
    }
    await send('touchStart', [one]);
    await send('touchStart', [one, two]);
    await page.waitForTimeout(600);
    await lift();
    await page.waitForTimeout(200);
    expect(await zoom(page)).toBe(before);
  });
}

// A quick tap on a text box of a block in a bigger selection narrows the selection to that block (job 188); a pinch must not.
for (const order of ['the finger on the text lifts first', 'the other finger lifts first']) {
  test(`a pinch that starts on the text of a selected card leaves the selection alone (${order})`, async ({ page }) => {
    await clickEmpty(page);
    await add(page, 'Note');
    await page.keyboard.press('Escape');
    await clickEmpty(page);
    await add(page, 'Note');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+a');
    await expect(page.locator('.card.selected')).toHaveCount(2);
    const b = (await page.locator('.card.loose').first().getByRole('textbox').first().boundingBox())!;
    const send = await fingers(page);
    const one = { x: b.x + 20, y: b.y + 10, id: 1 };
    const two = { x: one.x + 150, y: one.y + 150, id: 2 };
    await send('touchStart', [one]);
    await send('touchStart', [one, two]);
    const [a, z] = order === 'the finger on the text lifts first' ? [one, two] : [two, one];
    await send('touchEnd', [a]);
    await send('touchEnd', [z]);
    await page.waitForTimeout(300);
    await expect(page.locator('.card.selected')).toHaveCount(2);
  });
}
