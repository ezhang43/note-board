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
    expect(light).toBe('rgb(255, 254, 250)');
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(dark).toBe('rgb(22, 21, 19)');
  });
}

// Job #79 (owner decision 2026-10-16, "Done List" look): a second start button closes the page, after the comparison.
test('the landing page says what BusyAnts is, shows a picture of a board and has a start button at the top and at the end', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.getByText('A calm, free visual board for notes and checklists. Plan together in real time.')).toBeVisible();
  const shot = page.getByRole('img', { name: /BusyAnts board/ });
  await expect(shot).toBeVisible();
  expect(await shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const starts = page.getByRole('link', { name: 'Start your board, free' });
  await expect(starts).toHaveCount(2);
  for (const s of await starts.all()) await expect(s).toHaveAttribute('href', '../');
  const y = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!.y;
  expect(await y(starts.first())).toBeLessThan(await y(page.getByRole('table')));
  expect(await y(starts.last())).toBeGreaterThan(await y(page.locator('.compare-note')));
  await starts.last().click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('canvas')).toBeVisible();
});

// Job #86 (owner, 2026-10-16): the closing honey block, the "Why I made BusyAnts" story removed, a sharper board picture.
test('the About page ends with a honey block: a headline, one line and the start button, just above the footer', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.getByRole('heading', { name: 'Why I made BusyAnts' })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('I wake up most mornings');
  await expect(page.locator('.close')).toHaveCount(0);
  const block = page.locator('section.closing');
  await expect(block.getByRole('heading', { level: 2, name: 'Ready to clear your head?' })).toBeVisible();
  await expect(block).toContainText('Free, no card, no limits. Works offline.');
  const start = block.getByRole('link', { name: 'Start your board, free' });
  await expect(start).toHaveAttribute('href', '../');
  // Honey (#FFCF3F, as at the top; light mode here), and the last thing in the page before the footer.
  const honey = (l: ReturnType<Page['locator']>) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await honey(block)).toBe('rgb(255, 207, 63)');
  expect(await block.evaluate((el) => el.nextElementSibling === null && el.parentElement!.nextElementSibling!.matches('footer.site-footer'))).toBe(true);
  // The button keeps a keyboard focus ring.
  await start.focus();
  expect(await start.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  // It fits a 320px phone with no sideways scrolling.
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = (await block.boundingBox())!;
  expect(box.x).toBe(0);
  expect(Math.round(box.width)).toBe(320);
  const link = (await start.boundingBox())!;
  expect(link.x).toBeGreaterThanOrEqual(16);
  expect(link.x + link.width).toBeLessThanOrEqual(320 - 16);
});

test('the About page board picture is sharp: twice the pixels it is shown at, light and dark', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/about/');
    const img = page.locator('img.shot');
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.currentSrc.split('/').pop()), scheme).toBe(scheme === 'dark' ? 'board-dark.webp' : 'board.webp');
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), scheme).toBe(1920);
    await expect(img).toHaveAttribute('width', '960');
    await expect(img).toHaveAttribute('height', '600');
  }
});

test('"Try it: tick one off" folds as a whole section: starts open, folds and unfolds, ticking still works', async ({ page }) => {
  await page.goto('/about/');
  const fold = page.locator('main details:has(ul.highlights)');
  await expect(page.locator('main details')).toHaveCount(1);
  await expect(fold.locator(':scope > summary > h2')).toHaveText('Try it: tick one off');
  await expect(fold).toHaveAttribute('open', '');
  const list = fold.locator('ul.highlights');
  await expect(list).toBeVisible();
  expect((await fold.locator('summary').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await fold.locator('summary').click();
  await expect(fold).not.toHaveAttribute('open', '');
  await expect(list).toBeHidden();
  await fold.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(fold).toHaveAttribute('open', '');
  // Ticking inside it still strikes the item through and moves it under Completed.
  const shape = page.getByRole('checkbox', { name: 'Shape it your way' });
  const fold2 = page.getByRole('checkbox', { name: "Fold away what you're not doing" });
  await shape.check();
  expect((await shape.boundingBox())!.y).toBeGreaterThan((await fold2.boundingBox())!.y);
  // Printing shows it open even when it is folded.
  await fold.locator('summary').click();
  await expect(list).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(list).toBeVisible();
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

// Job #79 (owner decision 2026-10-16): the "Done List" look. The board picture is shown big under the hero text
// (it was a small thumbnail beside it, and a dark blob on a phone in dark mode).
test('the board picture is big, under the start button, framed so it stands out in light and dark', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/about/');
  await expect(page.locator('svg.ant')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /BusyAnts board/ })).toHaveCount(1);
  const shot = page.locator('.hero').getByRole('img', { name: /BusyAnts board/ });
  await expect(shot).toBeVisible();
  expect(await shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // Size set in the HTML so the page does not jump while it loads.
  await expect(shot).toHaveAttribute('width', /\d+/);
  await expect(shot).toHaveAttribute('height', /\d+/);
  await expect(page.locator('.site-brand img')).toBeVisible();
  const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;
  const start = page.getByRole('link', { name: 'Start your board, free' }).first();
  expect((await box(shot)).width).toBeGreaterThan(900);
  expect((await box(shot)).y).toBeGreaterThan((await box(start)).y + (await box(start)).height);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 800 });
    // Nearly the full phone width, inside the 16px side margins, with a visible frame.
    const b = await box(shot);
    expect(b.width).toBeGreaterThan(340);
    expect(b.x).toBeGreaterThanOrEqual(16);
    expect(await shot.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });
  }
});

test('the three highlights are a small to-do list you can really tick: ticked ones move under Completed', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.getByRole('heading', { level: 2, name: 'Try it: tick one off' })).toBeVisible();
  const box = (name: string) => page.getByRole('checkbox', { name });
  const shape = box('Shape it your way');
  const fold = box("Fold away what you're not doing");
  const built = box('Built for checklists');
  await expect(shape).not.toBeChecked();
  await expect(fold).not.toBeChecked();
  await expect(built).toBeChecked();
  const y = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!.y;
  expect(await y(shape)).toBeLessThan(await y(built));
  await shape.check();
  await expect(shape).toBeChecked();
  // Ticked: it moves below the ones still to do, and its title is struck through.
  expect(await y(shape)).toBeGreaterThan(await y(fold));
  const title = page.locator('ul.highlights h3').first();
  expect(await title.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('line-through');
  // The keyboard works too.
  await built.focus();
  await page.keyboard.press('Space');
  await expect(built).not.toBeChecked();
  expect(await y(built)).toBeLessThan(await y(shape));
});

test('the to-do list and the table line up on shared left edges on a computer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/about/');
  const x = async (sel: string) => Math.round((await page.locator(sel).first().boundingBox())!.x);
  // The reading column: the list and its heading share a left edge.
  expect(await x('h2:text("Try it: tick one off")')).toBe(await x('ul.highlights'));
  // The wider table section: its heading and the table share a left edge.
  expect(await x('h2:text("How BusyAnts stacks up")')).toBe(await x('table.compare'));
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

test('on a phone the comparison table turns into one block per feature, with every app named in it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/about/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const table = page.locator('table.compare');
  const names = ['BusyAnts', 'Milanote', 'Notion', 'Miro', 'Trello'];
  for (const row of await table.locator('tbody tr').all()) {
    const cells = row.locator('td');
    expect(await cells.evaluateAll((tds) => tds.map((td) => td.getAttribute('data-app')))).toEqual(names);
    // The app's name shows on screen beside each answer (on screen only: screen readers hear the column
    // header), and every answer fits on screen.
    const shown = await cells.evaluateAll((tds) => tds.map((td) => getComputedStyle(td, '::before').content));
    expect(shown).toEqual(names.map((n) => `"${n}" / ""`));
    for (const c of await cells.all()) {
      await expect(c).toBeVisible();
      const b = (await c.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(390);
    }
  }
});

// Job #59 (owner request 2026-10-16): the bolder look, one system on all four pages: a honey slab (warm
// brown in dark mode) holds the nav and the page title. Job #79: titles in Familjen Grotesk.
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
      expect(c.h1Font).toContain('Familjen Grotesk');
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

  test(`${p.path} on a phone puts the page links on their own row, with big enough tap targets`, async ({ page }) => {
    // Down to 320px wide (small phones), the ant, the name and Open BusyAnts still share the first row.
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(p.path);
      const nav = page.getByRole('navigation', { name: 'Site' });
      await expect(nav.getByRole('link')).toHaveCount(6);
      const mid = async (name: string) => {
        const b = (await nav.getByRole('link', { name, exact: true }).boundingBox())!;
        return { mid: Math.round(b.y + b.height / 2), h: b.height };
      };
      const brand = await mid('BusyAnts');
      const open = await mid('Open BusyAnts');
      expect(open.mid).toBe(brand.mid);
      const pages = await Promise.all(['About', 'FAQ', 'Terms', 'Privacy'].map(mid));
      expect(new Set(pages.map((l) => l.mid)).size).toBe(1);
      expect(pages[0].mid).toBeGreaterThan(brand.mid);
      // 44px tall: easy to tap, and no link text broken over two lines.
      for (const l of [...pages, open]) expect(l.h).toBeGreaterThanOrEqual(44);
      for (const l of pages) expect(l.h).toBeLessThan(60);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}

// Job #79: the FAQ, Terms and Privacy pages fold each question or section open and shut (native <details>).
for (const path of ['/faq/', '/terms/', '/privacy/']) {
  test(`${path} folds each section: the first is open, the rest open with a click or the keyboard`, async ({ page }) => {
    await page.goto(path);
    const folds = page.locator('main details');
    const n = await folds.count();
    expect(n).toBeGreaterThanOrEqual(5);
    // Every section heading is the clickable line of its fold.
    await expect(page.locator('main h2')).toHaveCount(n);
    await expect(page.locator('main details > summary > h2')).toHaveCount(n);
    await expect(folds.first()).toHaveAttribute('open', '');
    for (let i = 1; i < n; i++) await expect(folds.nth(i)).not.toHaveAttribute('open', '');
    const second = folds.nth(1);
    await second.locator('summary').click();
    await expect(second).toHaveAttribute('open', '');
    await expect(second.locator('p, li').first()).toBeVisible();
    await second.locator('summary').click();
    await expect(second).not.toHaveAttribute('open', '');
    await second.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(second).toHaveAttribute('open', '');
  });
}

test('a link to one FAQ question opens that question', async ({ page }) => {
  await page.goto('/about/');
  await page.locator('.compare-note').getByRole('link', { name: 'how' }).click();
  await expect(page).toHaveURL('/faq/#import');
  const fold = page.locator('details:has(#import)');
  await expect(fold).toHaveAttribute('open', '');
  await expect(fold.locator('p').first()).toBeVisible();
  // And while already on the page.
  await page.evaluate(() => (location.hash = 'offline'));
  await expect(page.locator('details:has(#offline)')).toHaveAttribute('open', '');
  // A broken link (bad % code) does no harm: no page error, the first fold stays open.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/faq/#%E0%A4');
  await expect(page.locator('main details').first()).toHaveAttribute('open', '');
  expect(errors).toEqual([]);
});

test('printing a folded page prints every section, not only the open one', async ({ page }) => {
  await page.goto('/privacy/');
  const closed = page.locator('main details:not([open]) p').first();
  await expect(closed).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(closed).toBeVisible();
});

test('the Delete your account page shows its steps as numbered steps, all open', async ({ page }) => {
  await page.goto('/delete-account/');
  await expect(page.locator('main details')).toHaveCount(0);
  const steps = page.locator('main ol.steps > li');
  await expect(steps).toHaveCount(5);
  for (const st of await steps.all()) await expect(st).toBeVisible();
  // Each step gets its own big number badge.
  const badge = await steps.first().evaluate((li) => {
    const b = getComputedStyle(li, '::before');
    return { content: b.content, width: parseFloat(b.width) };
  });
  expect(badge.content).toContain('counter');
  expect(badge.width).toBeGreaterThanOrEqual(24);
});

test('the legal pages name BusyAnts, the date, the law and a way to get in touch', async ({ page }) => {
  await page.goto('/terms/');
  const terms = page.locator('main');
  await expect(terms).toContainText('Effective from October 16, 2026');
  await expect(terms).toContainText('deleting in the app leaves feedback you sent, which is deleted when you ask by email');
  await expect(terms).toContainText('State of Maryland, United States');
  await expect(terms.getByRole('link', { name: 'ezhang43@gmail.com' })).toHaveAttribute('href', 'mailto:ezhang43@gmail.com');

  await page.goto('/privacy/');
  const privacy = page.locator('main');
  await expect(privacy).toContainText('Effective from October 16, 2026');
  await expect(privacy).toContainText('australia-southeast1 (Sydney, Australia)');
  await expect(privacy).toContainText('may be processed outside your own country');
  await expect(privacy).not.toContainText('us-central');
  await expect(privacy).toContainText('within 30 days');
  await expect(privacy).toContainText('Some US states give their residents extra privacy rights');
  // Sections fold shut (job #79), so the email link may sit in a closed one.
  await expect(privacy.getByRole('link', { name: 'ezhang43@gmail.com', includeHidden: true }).first()).toHaveAttribute('href', 'mailto:ezhang43@gmail.com');
  // The Google Calendar panel asks for calendar access, so the policy says what it does with it.
  await expect(privacy.getByRole('heading', { name: 'Google Calendar' })).toBeVisible();
  await expect(privacy).toContainText('never saved with your boards');
  // Feedback (job #69): stored with your email so the maker can reply; deleted on request. Its section folds open.
  await page.locator('details:has(h3:text("Feedback you send")) > summary').click();
  await expect(privacy.getByRole('heading', { name: 'Feedback you send' })).toBeVisible();
  await expect(privacy).toContainText('stored with your email address');
  await expect(privacy).toContainText('deleting your account in BusyAnts doesn’t remove it');
  // Nothing promises "everything" goes without saying feedback stays (it goes only when asked by email).
  await expect(privacy).toContainText('Delete your account and everything stored online except feedback you sent');
  await expect(privacy).toContainText('your account and everything stored online for it, feedback included, will be deleted within 30 days');
  await expect(privacy).not.toContainText('and everything will be deleted');

  // A link to the question opens its fold.
  await page.goto('/faq/#delete');
  await expect(page.locator('details:has(#delete) p').getByRole('link', { name: 'ezhang43@gmail.com' })).toHaveAttribute('href', 'mailto:ezhang43@gmail.com');
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
