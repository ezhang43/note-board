import { dropAccess, keepAccess, NoAccess, readAccess } from '../model/calendar';
import { demoUser } from '../sync/demo';
import { deviceStorage } from '../store/env';
import type { CalendarSource } from './api';
import { HELPER_URL } from './helper';

const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';

/**
 * The published site uses the signed-in person's Google Calendar (a token from Google, asked for
 * when the panel first opens); `npm run dev` with ?demo-user=… a pretend calendar in the dev server
 * (src/calendar/devServer.ts); otherwise there is no calendar.
 */
export function defaultSource(): CalendarSource | null {
  if (import.meta.env.VITE_SYNC === 'on') {
    // Kept once loaded, so a click on the button reaches Google without waiting (a window opened
    // after a wait may be blocked, Safari especially).
    let ready: typeof import('./google') | null = null;
    const google = () => import('./google').then((g) => (ready = g));
    return {
      base: GOOGLE_API,
      token: () => (ready ? ready.token() : google().then((g) => g.token())),
      forget: () => ready?.forget(),
      prepare: () => void google().then((g) => g.prepare()),
      keptToken: () => (ready ? Promise.resolve(ready.keptToken()) : google().then((g) => g.keptToken())),
      person: () => ready?.person(),
      // Only with the calendar helper (owner decision 2026-11-20); its address is fixed when the site is built.
      disconnect: HELPER_URL ? () => google().then((g) => g.disconnect()) : undefined,
    };
  }
  const demo = demoUser();
  if (!demo) return null;
  // Locally, ?demo-calendar=blocked (or =refused) makes the first ask for access fail as Google's
  // window does when it is blocked or closed (or access isn't given), to try Connect Google Calendar.
  let noAccess = new URLSearchParams(location.search).get('demo-calendar');
  // Kept on this device for an hour, as on the published site, so a reload or new tab doesn't ask again.
  const device = deviceStorage;
  const helper = new URLSearchParams(location.search).get('demo-helper') === 'on';
  let notConnected = false;
  /** The pretend helper's answer: the access, or null when it has no connection. */
  const askHelper = async (path: 'access' | 'connect' | 'disconnect'): Promise<string | null> => {
    const res = await fetch(`${import.meta.env.BASE_URL}__calendar-helper/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${demo.uid}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Calendar helper answered ${res.status}`);
    return path === 'disconnect' ? null : ((await res.json()) as { access_token: string }).access_token;
  };
  const keepDemo = (token: string | null) => {
    if (!token) throw new NoAccess('window');
    keepAccess(device, { token, expiresAt: Date.now() + 3599_000, user: demo.uid });
    return token;
  };
  return {
    base: `${import.meta.env.BASE_URL}__calendar/calendar/v3`,
    async token() {
      const kept = readAccess(device, demo.uid);
      const reason = noAccess === 'blocked' ? 'window' : noAccess === 'refused' ? 'refused' : null;
      noAccess = null; // only the first ask: once connected (kept for every tab, job 107), the setting has no effect
      if (kept) return kept.token;
      // ?demo-helper=on: the dev server's pretend calendar helper keeps the connection, so after the
      // first time a new access comes without the pretend window (as the published site's helper does).
      // As on the published site, once it said there is no connection, Connect goes straight to the window.
      const fresh = helper && !notConnected ? await askHelper('access') : null;
      if (fresh) return keepDemo(fresh);
      notConnected = helper;
      if (reason) throw new NoAccess(reason);
      const token = keepDemo(helper ? await askHelper('connect') : demo.uid);
      notConnected = false;
      return token;
    },
    disconnect: helper
      ? async () => {
          await askHelper('disconnect');
          dropAccess(device);
          notConnected = true;
        }
      : undefined,
    forget: () => dropAccess(device),
    keptToken: async () => readAccess(device, demo.uid)?.token ?? null,
    person: () => demo.uid,
  };
}

export const calendarSource = defaultSource();
