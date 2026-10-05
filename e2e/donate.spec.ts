import { expect, test } from '@playwright/test';
import { freshBoardEachTest } from './helpers';

// Owner request 2026-10-05: a Buy Me a Coffee button for BusyAnts.

freshBoardEachTest();

const PAGE = 'https://buymeacoffee.com/ezcookie';

test('a coffee button by the ? button opens the Buy Me a Coffee page in a new tab', async ({ page }) => {
  const link = page.getByRole('link', { name: 'Buy me a coffee' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', PAGE);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  // Bottom right, next to the other corner buttons.
  const b = (await link.boundingBox())!;
  const help = (await page.getByRole('button', { name: 'Keyboard shortcuts' }).boundingBox())!;
  expect(Math.abs(b.y - help.y)).toBeLessThan(4);
  expect(b.x).toBeGreaterThan(help.x);
});

test.describe('on a phone-sized screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the coffee link is in the ⋯ menu', async ({ page }) => {
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    const link = page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'Buy me a coffee' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', PAGE);
    await expect(link).toHaveAttribute('target', '_blank');
  });
});
