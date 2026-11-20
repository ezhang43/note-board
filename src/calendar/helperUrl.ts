// The calendar helper's address (VITE_CALENDAR_HELPER_URL, set at build time; owner decision 2026-11-20).
// Empty: the helper is off and the calendar asks Google for an hour's access as before. Read by the
// page (src/calendar/google.ts) and by the build's Content Security Policy (scripts/csp.ts). No browser
// or Vite code here, so the build's config can read it.

/** The helper's address (its origin: it answers at its root), or '' when unset. Anything but a plain https address (or http on localhost) stops the build. */
export function helperUrl(raw: string | undefined): string {
  const text = raw?.trim() ?? '';
  if (!text) return '';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`VITE_CALENDAR_HELPER_URL isn't a web address: ${text}`);
  }
  const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if ((url.protocol !== 'https:' && !local) || !/^[a-z0-9.-]+$/u.test(url.hostname) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`VITE_CALENDAR_HELPER_URL must be a plain https address: ${text}`);
  }
  return url.origin;
}
