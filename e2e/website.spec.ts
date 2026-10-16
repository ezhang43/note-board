import { expect, test, type Page } from '@playwright/test';

// Job 29 (owner request 2026-10-06): a small public website next to the app. The app stays at the
// site's address (so installed apps, bookmarks and share links keep working); the pages live at
// about/, faq/, terms/ and privacy/ beside it.

const PAGES = [
  { path: '/about/', title: 'BusyAnts: a calm, free visual board', h1: 'BusyAnts' },
  { path: '/faq/', title: 'BusyAnts: questions and answers', h1: 'Questions and answers' },
  { path: '/terms/', title: 'BusyAnts: terms of use', h1: 'Terms of use' },
  { path: '/privacy/', title: 'BusyAnts: privacy policy', h1: 'Privacy policy' },
];

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

for (const p of PAGES) {
  test(`${p.path} loads with its own title, description and one main heading`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(p.path);
    await expect(page).toHaveTitle(p.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\w{20,}|.{40,}/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(p.h1);
    // Not the app: no board on these pages.
    await expect(page.getByTestId('canvas')).toHaveCount(0);
    // Headings in order: never skip a level going down.
    const levels = await page.locator('h1, h2, h3, h4').evaluateAll((hs) => hs.map((h) => Number(h.tagName[1])));
    levels.forEach((l, i) => i > 0 && expect(l - levels[i - 1]).toBeLessThanOrEqual(1));
    expect(errors).toEqual([]);
  });

  test(`${p.path} links to the other pages and to the app`, async ({ page }) => {
    for (const q of PAGES) {
      await page.goto(p.path);
      const name = { '/about/': 'About', '/faq/': 'FAQ', '/terms/': 'Terms', '/privacy/': 'Privacy' }[q.path]!;
      await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(q.path);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(q.h1);
    }
    await page.goto(p.path);
    await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Open BusyAnts' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('canvas')).toBeVisible();
  });

  test(`${p.path} has the coffee link, and links leaving the site open safely`, async ({ page }) => {
    await page.goto(p.path);
    await expect(page.getByRole('link', { name: 'Buy me a coffee' }).first()).toHaveAttribute('href', 'https://buymeacoffee.com/ezcookie');
    for (const a of await page.locator('a[href^="http"]').all()) {
      await expect(a).toHaveAttribute('rel', /noopener/);
    }
  });

  test(`${p.path} has no gaps left for the owner to fill`, async ({ page }) => {
    const res = await page.goto(p.path);
    // The whole source, comments included, so a gap can't hide anywhere.
    expect(await res!.text()).not.toContain('[OWNER');
  });

  test(`${p.path} fits a phone screen without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(p.path);
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
    // 16px side margins around the text.
    const box = (await page.locator('main h1').boundingBox())!;
    expect(Math.round(box.x)).toBeGreaterThanOrEqual(16);
  });

  test(`${p.path} follows the computer's dark setting, like the app`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(p.path);
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(light).toBe('rgb(250, 246, 236)');
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(dark).toBe('rgb(29, 27, 23)');
  });
}

test('the landing page says what BusyAnts is, shows a picture of a board and has one big start button', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.getByText('A calm, free visual board for notes and checklists. Plan together in real time.')).toBeVisible();
  const shot = page.getByRole('img', { name: /BusyAnts board/ });
  await expect(shot).toBeVisible();
  expect(await shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const start = page.getByRole('link', { name: 'Start your board, free' });
  await expect(start).toHaveCount(1);
  await start.click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('canvas')).toBeVisible();
});

// Job 55 (owner request 2026-10-15): the owner's "Why I made BusyAnts" intro, three highlights and the fuller feature list.
test('the About page tells why BusyAnts was made, right under the hero (headline, start button and mini board)', async ({ page }) => {
  await page.goto('/about/');
  const why = page.getByRole('heading', { level: 2, name: 'Why I made BusyAnts' });
  await expect(why).toBeVisible();
  const main = page.locator('main');
  await expect(main).toContainText('I wake up most mornings feeling like an ant');
  await expect(main).toContainText('Milanote, Evernote, Notion, Miro, Google Keep, Windows Sticky Notes and Todoist');
  await expect(main).toContainText('a calm canvas centered on checklists');
  await expect(main).toContainText('Tick something off and it slides into Completed');
  await expect(page.getByRole('heading', { name: 'Why BusyAnts', exact: true })).toHaveCount(0);
  const y = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!.y;
  expect(await y(why)).toBeGreaterThan(await y(page.getByRole('link', { name: 'Start your board, free' })));
  expect(await y(why)).toBeGreaterThan(await y(page.getByRole('img', { name: /BusyAnts board/ })));
});

test('the About page has three highlights under the intro', async ({ page }) => {
  await page.goto('/about/');
  const highlights = page.locator('ul.highlights > li');
  await expect(highlights).toHaveCount(3);
  await expect(highlights.locator('h3')).toHaveText(['Shape it your way', "Fold away what you're not doing", 'Built for checklists']);
  await expect(highlights.nth(0)).toContainText('five typefaces, snap-to-grid or free placement');
  await expect(highlights.nth(1)).toContainText('Collapse any card, container or list, or everything at once, and bring it back in one click.');
  await expect(highlights.nth(2)).toContainText('tick with Ctrl+Enter');
});

// Job #62 (owner request 2026-10-16): a shorter, punchier About page: the sample board sits small in the hero,
// the intro and highlights go side by side, and a comparison table replaces the "Also in BusyAnts" list.
test('the hero has no big ant drawing; a small sample board sits there instead, and the big picture further down is gone', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.locator('svg.ant')).toHaveCount(0);
  await expect(page.locator('.showcase')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /BusyAnts board/ })).toHaveCount(1);
  const shot = page.locator('.hero').getByRole('img', { name: /BusyAnts board/ });
  await expect(shot).toBeVisible();
  expect(await shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // Size set in the HTML so the page does not jump while it loads.
  await expect(shot).toHaveAttribute('width', /\d+/);
  await expect(shot).toHaveAttribute('height', /\d+/);
  // The small ant icon in the top bar stays.
  await expect(page.locator('.site-brand img')).toBeVisible();
  // A mini board, not the full-size picture.
  expect((await shot.boundingBox())!.width).toBeLessThan(700);
});

test('on a computer the hero board sits beside the text; on a phone it sits under it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/about/');
  const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;
  const shot = page.locator('.hero').getByRole('img', { name: /BusyAnts board/ });
  const start = page.getByRole('link', { name: 'Start your board, free' });
  expect((await box(shot)).x).toBeGreaterThan((await box(start)).x + (await box(start)).width);
  await page.setViewportSize({ width: 390, height: 800 });
  expect((await box(shot)).y).toBeGreaterThan((await box(start)).y + (await box(start)).height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the story and the three highlights sit side by side on a computer and stack on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/about/');
  const why = page.locator('.why');
  const hl = page.locator('ul.highlights');
  const w = (await why.boundingBox())!;
  const h = (await hl.boundingBox())!;
  expect(h.x).toBeGreaterThan(w.x + w.width - 1);
  expect(h.y).toBeLessThan(w.y + w.height); // they overlap vertically, so they share the same band
  await page.setViewportSize({ width: 390, height: 800 });
  const w2 = (await why.boundingBox())!;
  const h2 = (await hl.boundingBox())!;
  expect(h2.y).toBeGreaterThan(w2.y + w2.height - 1);
});

test('the About page compares BusyAnts with Milanote, Notion, Miro and Trello in a real table, dated and sourced', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.getByRole('heading', { level: 2, name: 'Also in BusyAnts' })).toHaveCount(0);
  await expect(page.locator('ul.also')).toHaveCount(0);
  const heading = page.getByRole('heading', { level: 2, name: 'How BusyAnts stacks up' });
  await expect(heading).toBeVisible();
  const table = page.getByRole('table');
  await expect(table).toHaveCount(1);
  await expect(table.locator('caption')).not.toBeEmpty();
  await expect(table.locator('thead th[scope="col"]')).toHaveText(['Feature', 'BusyAnts', 'Milanote', 'Notion', 'Miro', 'Trello']);
  const rows = table.locator('tbody tr');
  expect(await rows.count()).toBeGreaterThanOrEqual(4);
  await expect(table.locator('tbody th[scope="row"]')).toHaveCount(await rows.count());
  // BusyAnts says yes to every row; every cell has words for a screen reader, not only a symbol.
  const cells = table.locator('tbody td');
  for (const c of await cells.all()) await expect(c.locator('.sr-only, .word')).toHaveCount(1);
  await expect(table.locator('tbody tr td:nth-of-type(1) .sr-only')).toHaveText(Array(await rows.count()).fill('Yes'));
  await expect(page.locator('.compare-note')).toContainText('Compared with each app\'s free plan and public feature pages, October 2026.');
  await expect(page.locator('.compare-note').getByRole('link', { name: 'ezhang43@gmail.com' })).toHaveAttribute('href', 'mailto:ezhang43@gmail.com');
  // No competitor logos.
  await expect(table.locator('img, svg')).toHaveCount(0);
});

test('the comparison table scrolls sideways inside its own box on a phone, never the whole page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/about/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const scroller = page.locator('.compare-scroll');
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await scroller.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
});

// Job #59 (owner request 2026-10-16): the bolder look, one system on all four pages: a honey slab (warm
// brown in dark mode) holds the nav and the page title, set in a heavy display type.
type Rgb = [number, number, number];
const toRgb = (css: string): Rgb => css.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number) as Rgb;
const luminance = ([r, g, b]: Rgb) => {
  const [lr, lg, lb] = [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const p of PAGES) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${p.path} has the bold slab in ${scheme} mode, standing out from the page, with readable text`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(p.path);
      const c = await page.evaluate(() => {
        const css = (el: Element, prop: string) => getComputedStyle(el).getPropertyValue(prop);
        const nav = document.querySelector('.site-header a[aria-current="page"]')!;
        return {
          slab: css(document.querySelector('.site-header')!, 'background-color'),
          page: css(document.body, 'background-color'),
          h1: css(document.querySelector('main h1')!, 'color'),
          h1Font: css(document.querySelector('main h1')!, 'font-family'),
          nav: css(nav, 'color'),
        };
      });
      if (scheme === 'light') expect(toRgb(c.slab)).toEqual([255, 207, 63]);
      expect(c.h1Font).toContain('Bricolage Grotesque');
      // The slab stands out from the page (honey on cream is a color jump, so it needs less lightness gap than
      // brown on near-black), and the text on it passes WCAG AA.
      expect(contrast(toRgb(c.slab), toRgb(c.page))).toBeGreaterThanOrEqual(scheme === 'dark' ? 1.5 : 1.3);
      expect(contrast(toRgb(c.h1), toRgb(c.slab))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(toRgb(c.nav), toRgb(c.slab))).toBeGreaterThanOrEqual(4.5);
      // The page title sits on the slab, not on the plain page below it.
      const bg = await page.evaluate(() => {
        const h1 = document.querySelector('main h1')!.getBoundingClientRect();
        const header = document.querySelector('.site-header')!.getBoundingClientRect();
        return { h1Top: h1.top, headerBottom: header.bottom };
      });
      expect(bg.h1Top).toBeGreaterThanOrEqual(bg.headerBottom);
    });
  }

  test(`${p.path} keeps the whole nav on one line at 375px, with every link still there`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(p.path);
    const nav = page.getByRole('navigation', { name: 'Site' });
    await expect(nav.getByRole('link')).toHaveCount(6);
    const tops = await nav.getByRole('link').evaluateAll((as) => as.map((a) => Math.round(a.getBoundingClientRect().top + a.getBoundingClientRect().height / 2)));
    expect(new Set(tops).size).toBe(1);
    // No link text broken over two lines.
    const heights = await nav.getByRole('link').evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height));
    heights.forEach((h) => expect(h).toBeLessThan(40));
    await expect(nav.getByRole('link', { name: 'BusyAnts', exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('the legal pages name BusyAnts, the date, the law and a way to get in touch', async ({ page }) => {
  await page.goto('/terms/');
  const terms = page.locator('main');
  await expect(terms).toContainText('Effective from October 6, 2026');
  await expect(terms).toContainText('State of Maryland, United States');
  await expect(terms.getByRole('link', { name: 'ezhang43@gmail.com' })).toHaveAttribute('href', 'mailto:ezhang43@gmail.com');

  await page.goto('/privacy/');
  const privacy = page.locator('main');
  await expect(privacy).toContainText('Effective from October 6, 2026');
  await expect(privacy).toContainText('australia-southeast1 (Sydney, Australia)');
  await expect(privacy).toContainText('may be processed outside your own country');
  await expect(privacy).not.toContainText('us-central');
  await expect(privacy).toContainText('within 30 days');
  await expect(privacy).toContainText('Some US states give their residents extra privacy rights');
  await expect(privacy.getByRole('link', { name: 'ezhang43@gmail.com' }).first()).toHaveAttribute('href', 'mailto:ezhang43@gmail.com');
  // The Google Calendar panel asks for calendar access, so the policy says what it does with it.
  await expect(privacy.getByRole('heading', { name: 'Google Calendar' })).toBeVisible();
  await expect(privacy).toContainText('never saved with your boards');

  await page.goto('/faq/');
  await expect(page.locator('#delete + p').getByRole('link', { name: 'ezhang43@gmail.com' })).toHaveAttribute('href', 'mailto:ezhang43@gmail.com');
});

test('the app still opens at its own address, and a share link in the existing format still opens the app', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.goto('/?join=sabc123.k3y');
  await expect(page.getByTestId('canvas')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('join')).toBe('sabc123.k3y');
  expect(errors).toEqual([]);
});

test('the keyboard shortcuts panel links to the website pages', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  const panel = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  for (const [name, path] of [
    ['About BusyAnts', '/about/'],
    ['FAQ', '/faq/'],
    ['Terms of use', '/terms/'],
    ['Privacy policy', '/privacy/'],
  ]) {
    await expect(panel.getByRole('link', { name, exact: true })).toHaveAttribute('href', path);
  }
});

// Job #53: the toolbar ant leads back to the website, in a new tab so the board stays open.
test('the toolbar ant links to the About page in a new tab', async ({ page, context }) => {
  await page.goto('/');
  const ant = page.locator('.toolbar').getByRole('link', { name: 'BusyAnts website' });
  await expect(ant).toHaveAttribute('href', '/about/');
  await expect(ant).toHaveAttribute('target', '_blank');
  await expect(ant).toHaveAttribute('title', 'BusyAnts website');
  const [tab] = await Promise.all([context.waitForEvent('page'), ant.click()]);
  await tab.waitForLoadState();
  expect(new URL(tab.url()).pathname).toBe('/about/');
  await expect(page.getByTestId('canvas')).toBeVisible();
});

test.describe('on a phone-sized screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test('the ⋯ menu links to the About page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('toolbar', { name: 'Board actions' }).getByRole('button', { name: 'More', exact: true }).tap();
    const link = page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'About BusyAnts' });
    await expect(link).toHaveAttribute('href', '/about/');
  });

  test('the top bar ant links to the About page in a new tab', async ({ page }) => {
    await page.goto('/');
    const ant = page.locator('.toolbar').getByRole('link', { name: 'BusyAnts website' });
    await expect(ant).toHaveAttribute('href', '/about/');
    await expect(ant).toHaveAttribute('target', '_blank');
  });
});
