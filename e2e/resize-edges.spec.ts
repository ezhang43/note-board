import { expect, test, type Locator, type Page } from '@playwright/test';
import { add, boardPos, box, clickEmpty, dragPointer, expectNoOverlaps, freshBoardEachTest, grabPoint, looseCards } from './helpers';

// Letting go of a resize pushes only the right neighbors (job #142).

freshBoardEachTest();

const grip = (block: Locator, dir: string) => (dir === 'se' ? block.getByRole('button', { name: 'Resize card', exact: true }) : block.locator(`[data-grip="${dir}"]`));
const center = async (l: Locator) => {
  const b = await box(l);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const rect = async (block: Locator) => ({ ...(await boardPos(block)), w: await block.evaluate((e) => (e as HTMLElement).offsetWidth), h: await block.evaluate((e) => (e as HTMLElement).offsetHeight) });
const dragGrip = async (page: Page, block: Locator, dir: string, dx: number, dy: number) => {
  const c = await center(grip(block, dir));
  await dragPointer(page, c, { x: c.x + dx, y: c.y + dy });
};
/** Moves a loose card so its top-left lands at (x, y) on the board (100% zoom: board pixels = screen pixels). */
const moveTo = async (page: Page, block: Locator, x: number, y: number) => {
  const at = await boardPos(block);
  const g = await grabPoint(block);
  await dragPointer(page, g, { x: g.x + (x - at.x), y: g.y + (y - at.y) });
};

async function twoNotes(page: Page) {
  await add(page, 'Note');
  await clickEmpty(page);
  await add(page, 'Note');
  await clickEmpty(page);
  return [looseCards(page).first(), looseCards(page).nth(1)] as const;
}

test('growing a card downwards pushes the card under it straight down, not sideways', async ({ page }) => {
  const [a, b] = await twoNotes(page);
  const a0 = await rect(a);
  await moveTo(page, b, a0.x, a0.y + a0.h + 20);
  const b0 = await boardPos(b);
  expect(b0.x).toBe(a0.x);
  await dragGrip(page, a, 's', 0, 160);
  const after = await rect(a);
  expect(after.h).toBeGreaterThan(a0.h + 100);
  const b1 = await boardPos(b);
  expect(b1.x).toBe(b0.x);
  expect(b1.y).toBeGreaterThanOrEqual(after.y + after.h + 10);
  await expectNoOverlaps(page);

  // The bottom-right corner does the same.
  await dragGrip(page, a, 'se', 40, 60);
  expect((await boardPos(b)).x).toBe(b0.x);
  await expectNoOverlaps(page);
});

test('a top corner drag does not throw a shorter card beside it upwards; it slides sideways', async ({ page }) => {
  const [a, side] = await twoNotes(page);
  await dragGrip(page, a, 'se', 0, 120); // make it taller than the card beside it
  const a0 = await rect(a);
  const s0 = await rect(side);
  await moveTo(page, side, a0.x - s0.w - 20, a0.y + 20);
  const before = await boardPos(side);
  expect(before.y).toBeGreaterThan(a0.y);
  await dragGrip(page, a, 'nw', -40, -40);
  const after = await boardPos(side);
  expect(after.y).toBe(before.y);
  expect(after.x + s0.w).toBeLessThanOrEqual((await rect(a)).x - 10);
  await expectNoOverlaps(page);
});
