import { expect, test } from '@playwright/test';
import { fontsLoaded } from './helpers';

// Interface review 181 C-L8 (job 182): a finger whose lift the canvas never saw (an app switch, a target
// removed mid-touch) must not make the next single touch count as the second finger of a pinch, which
// swallowed every touch on the board until reload. Pressed with made-up touch events; a page error from
// the board's own handlers not liking them (no real pointer to capture) is not what is checked.

test('a first finger starts afresh: the board still gets the touch', async ({ page }) => {
  await page.goto('/');
  await fontsLoaded(page);
  const reached = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="canvas"]')!;
    let got = false;
    document.addEventListener('pointerdown', () => (got = true), { once: true });
    const touch = (id: number) => canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
    touch(11); // a first finger whose pointerup never arrives (its press itself reaches the board; reset the flag)
    got = false;
    document.addEventListener('pointerdown', () => (got = true), { once: true });
    touch(12); // a later, separate first finger: a pinch must not have started
    return got;
  });
  expect(reached).toBe(true);
});
