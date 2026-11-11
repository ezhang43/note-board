import type { Page } from '@playwright/test';

// Job 11: records every Content Security Policy violation on a page (in the page itself, as the
// browser reports it), so a test can fail on any of them.

/** Starts recording; call before the page is opened. */
export async function cspGuard(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = ((window as unknown as { __csp: string[] }).__csp = []);
    document.addEventListener('securitypolicyviolation', (e) => {
      seen.push(`${e.effectiveDirective} ${e.blockedURI || '(inline)'} on ${location.pathname}${e.sample ? `: ${e.sample}` : ''}`);
    });
  });
  // The browser also writes each one to the console; catches any the page's own listener can't see.
  const fromConsole: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) fromConsole.push(m.text());
  });
  (page as Page & { cspConsole: string[] }).cspConsole = fromConsole;
}

const consoleOf = (page: Page) => (page as Page & { cspConsole?: string[] }).cspConsole ?? [];

/**
 * The violations seen so far: those the open page reported, and every console message about the
 * policy since cspGuard (any page opened in this tab, and directives the browser ignored).
 */
export async function violations(page: Page): Promise<string[]> {
  const inPage = await page.evaluate(() => [...((window as unknown as { __csp?: string[] }).__csp ?? [])]).catch(() => []);
  return [...inPage, ...consoleOf(page).map((m) => `console: ${m}`)];
}

/** Forgets the violations seen so far (after one a test caused on purpose). */
export async function clearViolations(page: Page) {
  await page.evaluate(() => ((window as unknown as { __csp: string[] }).__csp.length = 0));
  consoleOf(page).length = 0;
}
