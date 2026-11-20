import { helperUrl } from './helperUrl';

// Talks to the calendar helper (calendar-helper/, owner decision 2026-11-20), which keeps the person's
// Google refresh token so a fresh calendar access comes without Google's window. Every call carries
// the person's Firebase ID token; the helper checks it itself. The refresh token never reaches the page.

/** The helper's address, or '' (off: the hourly window as before). Set at build time. */
export const HELPER_URL: string = helperUrl(import.meta.env.VITE_CALENDAR_HELPER_URL);

/** A fresh access from the helper. */
export interface Fresh {
  token: string;
  expiresIn: number;
}

/** What the helper said, when it answered as expected: an access, or why there is none. */
export type HelperAnswer = Fresh | 'not-connected' | 'again' | 'account' | 'refused';

/** The helper couldn't be reached, or answered something unexpected: the caller falls back to the hourly window. */
export class HelperDown extends Error {}

async function post(base: string, path: string, idToken: string, body: unknown = {}) {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XmlHttpRequest' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HelperDown('Calendar helper unreachable');
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, data };
}

function read({ status, data }: { status: number; data: Record<string, unknown> | null }): HelperAnswer {
  if (status === 200) {
    const expiresIn = Number(data?.expires_in);
    if (typeof data?.access_token === 'string' && data.access_token && Number.isFinite(expiresIn) && expiresIn > 0) return { token: data.access_token, expiresIn };
  }
  if (status === 404 && data?.error === 'not_connected') return 'not-connected';
  if (status === 409 && data?.error === 'again') return 'again';
  if (status === 403 && (data?.error === 'account' || data?.error === 'refused')) return data.error;
  throw new HelperDown(`Calendar helper answered ${status}`);
}

/** A fresh access from the kept refresh token, or 'not-connected'. */
export async function helperAccess(idToken: string, base = HELPER_URL): Promise<HelperAnswer> {
  return read(await post(base, '/access', idToken));
}

/** Hands the code from Google's window to the helper, which keeps the refresh token and returns the first access. */
export async function helperConnect(idToken: string, code: string, base = HELPER_URL): Promise<HelperAnswer> {
  return read(await post(base, '/connect', idToken, { code }));
}

/** Revokes the connection at Google and deletes it from the helper. Rejects when that didn't happen. */
export async function helperDisconnect(idToken: string, base = HELPER_URL): Promise<void> {
  const { status } = await post(base, '/disconnect', idToken);
  if (status !== 200) throw new HelperDown(`Calendar helper answered ${status}`);
}
