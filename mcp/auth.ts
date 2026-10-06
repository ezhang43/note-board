import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// Signing the connector in as the owner. `npm run mcp:login` saves the Firebase refresh token from
// a Google sign-in; here it is swapped for a short-lived id token (1 hour), which Firestore checks
// against firestore.rules, as for the app itself.

/** The app's web key (not secret: it is in the published site; see src/sync/firebase.ts). */
export const WEB_API_KEY = 'AIzaSyBHun-34SrmkErUqS25OJax0JCzl2xe4Wo';

export interface TokenFile {
  refreshToken: string;
  uid: string;
  email?: string;
  /** A second key, given at sign-in, for when the web key only works from the site's address. */
  apiKey?: string;
}

export const LOGIN_AGAIN = 'Run npm run mcp:login to sign in again.';

/**
 * %APPDATA%\busyants-mcp\token.json: outside the project, in the Windows account's own folder.
 * simple: protected only by Windows file permissions; move it to Windows Credential Manager if the
 * computer is ever shared.
 */
export function tokenPath(env: Record<string, string | undefined> = process.env): string {
  return join(env.APPDATA ?? join(homedir(), '.config'), 'busyants-mcp', 'token.json');
}

export async function loadToken(path: string): Promise<TokenFile | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  let t: Partial<Record<keyof TokenFile, unknown>> | null = null;
  try {
    t = JSON.parse(raw);
  } catch {
    // reported below
  }
  const optional = (v: unknown) => v === undefined || typeof v === 'string';
  if (!t || typeof t.refreshToken !== 'string' || typeof t.uid !== 'string' || !optional(t.email) || !optional(t.apiKey)) {
    throw new Error(`The saved sign-in (${path}) is damaged. ${LOGIN_AGAIN}`);
  }
  return { refreshToken: t.refreshToken, uid: t.uid, ...(t.email ? { email: t.email } : {}), ...(t.apiKey ? { apiKey: t.apiKey } : {}) };
}

export async function saveToken(path: string, t: TokenFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  // mode: owner-only where the system supports it (on Windows the folder's permissions apply).
  await writeFile(path, JSON.stringify(t, null, 2), { mode: 0o600 });
}

/** Deletes the saved sign-in; false if there wasn't one. */
export async function deleteToken(path: string): Promise<boolean> {
  try {
    await rm(path);
    return true;
  } catch {
    return false;
  }
}

/** What Google's token service says, put plainly (never including a token). */
function refusal(status: number, body: string): string {
  if (/API_KEY|referer|referrer/i.test(body)) {
    return [
      'Google refused the app’s web key here: it is restricted to the site’s address, so it doesn’t work from this computer.',
      'Fix: in Google Cloud console → APIs & Services → Credentials (project note-board-a672a), create an API key,',
      'restrict it to these APIs: Identity Toolkit API, Token Service API, Cloud Firestore API (no website restriction),',
      'then sign in again with it: npm run mcp:login -- --key <the new key>',
    ].join('\n');
  }
  if (/TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_DISABLED|USER_NOT_FOUND|INVALID_GRANT/i.test(body)) return `The sign-in has expired or was revoked. ${LOGIN_AGAIN}`;
  return `Google’s sign-in service didn’t answer properly (status ${status}). Try again in a moment; if it keeps failing, ${LOGIN_AGAIN.toLowerCase()}`;
}

/**
 * A function giving a current id token, fetched from the refresh token when there is none or it
 * ends within 5 minutes. A new refresh token from Google is saved with `save`.
 */
export function idTokens(token: TokenFile, opts: { fetch?: typeof fetch; now?: () => number; save?: (t: TokenFile) => Promise<void> } = {}) {
  const fetchFn = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  let current: { id: string; until: number } | null = null;
  let t = token;
  return async (): Promise<string> => {
    if (current && now() < current.until - 5 * 60_000) return current.id;
    const res = await fetchFn(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(t.apiKey ?? WEB_API_KEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refreshToken }).toString(),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(refusal(res.status, body));
    let got: { id_token?: unknown; refresh_token?: unknown; expires_in?: unknown; user_id?: unknown } = {};
    try {
      got = JSON.parse(body);
    } catch {
      // Not shown: a parse error quotes the text, which could hold a token.
    }
    if (typeof got.id_token !== 'string') throw new Error(refusal(res.status, ''));
    if (got.user_id !== t.uid) throw new Error(`Google answered for a different account than the one signed in. ${LOGIN_AGAIN}`);
    if (typeof got.refresh_token === 'string' && got.refresh_token !== t.refreshToken) {
      t = { ...t, refreshToken: got.refresh_token };
      await opts.save?.(t);
    }
    current = { id: got.id_token, until: now() + Number(got.expires_in ?? 3600) * 1000 };
    return current.id;
  };
}
