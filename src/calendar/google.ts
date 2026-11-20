import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { dropAccess, keepAccess, NoAccess, readAccess, type Access } from '../model/calendar';
import { HELPER_URL, HelperDown, helperAccess, helperConnect, helperDisconnect, type HelperAnswer } from './helper';

// Calendar access on the published site (owner request, 2026-10-06), asked for only when the
// Google Calendar panel first opens, not at sign-in. A short-lived access (about an hour) for the
// calendar.events scope is kept in memory and on this device until it runs out (localStorage, owner
// choice 2026-10-19 "Remember for the hour", job 107), so a reload, a new tab or reopening the browser
// within the hour needs nothing; it is dropped when the person signs out or another signs in, when
// Google refuses it, and when it runs out. Loaded only on the published site.
//
// Where a new access comes from:
// - With the calendar helper (VITE_CALENDAR_HELPER_URL, owner decision 2026-11-20): the helper keeps the
//   person's Google refresh token, so a new access comes from it without any window, on every device,
//   until Disconnect calendar, a revoke in Google's settings or deleting the account. Google's window
//   (Google Identity Services' code client, popup) shows only when the helper has no connection.
// - Without it, or while the helper can't be reached: Google Identity Services' token client, whose
//   quick window shows about once an hour of use (the way it was before the helper).

/** The OAuth client ID (not secret), set in .env.production. Without it the panel says it isn't connected yet. */
const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
/** The code client also asks who it is, so the helper can check it is the Google account signed in. */
const CODE_SCOPE = `openid email ${SCOPE}`;

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}
interface CodeResponse {
  code?: string;
  scope?: string;
  error?: string;
}
type ErrorCallback = (e: { type?: string }) => void;
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(config: { client_id: string; scope: string; login_hint?: string; callback: (r: TokenResponse) => void; error_callback?: ErrorCallback }): { requestAccessToken(o?: { prompt?: string }): void };
      initCodeClient(config: { client_id: string; scope: string; login_hint?: string; ux_mode: 'popup'; callback: (r: CodeResponse) => void; error_callback?: ErrorCallback }): { requestCode(): void };
      hasGrantedAllScopes(r: TokenResponse, scope: string): boolean;
    };
  };
}

let cached: Access | null = null;
let pending: Promise<string> | null = null;
/** Who the pending ask is for, so a person who signs in meanwhile is asked afresh. */
let pendingFor: string | null = null;
let script: Promise<Gis> | null = null;
/** Google's script once loaded, so a click can ask for access straight away (browsers block windows opened after a wait). */
let loaded: Gis | null = null;
/** The person the helper said has no connection: their next ask opens Google's window at once, from the click. */
let notConnected: string | null = null;
/** Until when the helper is skipped after it couldn't be reached (the hourly window meanwhile). */
let helperDownUntil = 0;
// simple: a helper that was down is tried again after 5 minutes, not watched.
const HELPER_RETRY_MS = 5 * 60_000;
/** Counts disconnects: an access asked for before one is never kept or used (it was revoked). */
let connection = 0;

// simple: without the helper, kept until it runs out (about an hour), so Google's quick window still
// shows about once an hour of use, and on another device. Reaching localStorage can throw (blocked).
const device = () => localStorage;

// Signing out (or another person signing in) drops the token from memory; the device's copy is dropped
// by the sign-in watcher that is always loaded (src/sync/firebase.ts watchUser). The helper's connection
// stays: signing in again on any device uses it without a window (owner decision 2026-11-20).
onAuthStateChanged(getAuth(), (user) => {
  if (cached?.user !== user?.uid) cached = null;
  if (notConnected !== (user?.uid ?? null)) notConnected = null;
});

function loadGis(): Promise<Gis> {
  script ??= new Promise<Gis>((done, fail) => {
    const tag = document.createElement('script');
    tag.src = 'https://accounts.google.com/gsi/client';
    tag.async = true;
    tag.onload = () => {
      const gis = (window as unknown as { google?: Gis }).google;
      loaded = gis ?? null;
      if (gis) done(gis);
      else fail(new Error('Google sign-in did not load'));
    };
    tag.onerror = () => fail(new Error('Google sign-in did not load'));
    document.head.appendChild(tag);
  }).catch((e) => {
    script = null; // try loading again next time
    throw e;
  });
  return script;
}

/** Loads Google's script before it is needed (when the calendar button shows). */
export function prepare() {
  if (CLIENT_ID) loadGis().catch(() => {});
}

const uid = () => getAuth().currentUser?.uid ?? null;

/** The person's Firebase ID token, for the helper. */
async function idToken(): Promise<string> {
  const user = getAuth().currentUser;
  if (!user) throw new NoAccess('window');
  return user.getIdToken();
}

/**
 * Keeps an access that came for `user`, if they are still the one signed in (another person may have
 * signed in while Google's window or the helper's answer was on its way: then it is neither kept nor used).
 */
function take(user: string | null, accessToken: string, expiresIn: number | string | undefined, asked = connection): string {
  if (user !== uid() || asked !== connection) throw new NoAccess('window');
  const expiresAt = Date.now() + Number(expiresIn ?? 3599) * 1000;
  // An odd expiry (not a number, or Infinity) isn't kept, so it is never taken as never running out.
  if (user && Number.isFinite(expiresAt)) {
    cached = { token: accessToken, expiresAt, user };
    keepAccess(device, cached);
  }
  return accessToken;
}

/** The window was blocked or closed (Google's types popup_failed_to_open, popup_closed). */
const windowError = (fail: (e: Error) => void): ErrorCallback => (e) =>
  fail(e.type === 'popup_failed_to_open' || e.type === 'popup_closed' ? new NoAccess('window') : new Error(e.type ?? 'Google sign-in window failed'));

/** Without the helper: asks Google for an hour's token, opening its window at once (in the same click when called from one). */
function request(gis: Gis): Promise<string> {
  const user = uid();
  return new Promise<string>((done, fail) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      login_hint: getAuth().currentUser?.email ?? undefined,
      callback(r) {
        // The person may say no, or untick calendar access, on Google's screen.
        if (r.error === 'access_denied') return fail(new NoAccess('refused'));
        if (r.error) return fail(new Error(r.error));
        if (!r.access_token || !gis.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return fail(new NoAccess('refused'));
        try {
          done(take(user, r.access_token, r.expires_in));
        } catch (e) {
          fail(e as Error);
        }
      },
      error_callback: windowError(fail),
    });
    // Empty prompt: Google asks only the first time; after that a new token comes without asking.
    client.requestAccessToken({ prompt: '' });
  });
}

/** What a helper answer means here: the access (kept), or why there is none. */
function fromAnswer(user: string | null, answer: HelperAnswer, asked: number): string {
  if (typeof answer === 'object') {
    const kept = take(user, answer.token, answer.expiresIn, asked);
    notConnected = null;
    return kept;
  }
  if (answer === 'not-connected') throw new NoAccess('window');
  // 'again': Google gave no refresh token (an earlier grant), which the helper revoked; the next window asks afresh.
  throw new NoAccess(answer);
}

/** With the helper: Google's window for a one-time code (offline access), handed to the helper, which keeps the connection. */
function requestCode(gis: Gis): Promise<string> {
  const user = uid();
  const asked = connection;
  return new Promise<string>((done, fail) => {
    const client = gis.accounts.oauth2.initCodeClient({
      client_id: CLIENT_ID,
      scope: CODE_SCOPE,
      login_hint: getAuth().currentUser?.email ?? undefined,
      ux_mode: 'popup',
      callback(r) {
        if (r.error === 'access_denied') return fail(new NoAccess('refused'));
        if (r.error || !r.code) return fail(new Error(r.error ?? 'No code from Google'));
        // Calendar access unticked on Google's screen: nothing is sent to the helper.
        if (!(r.scope ?? '').split(' ').includes(SCOPE)) return fail(new NoAccess('refused'));
        const code = r.code;
        // Someone else signed in while the window was open: their ID token must not carry this code.
        if (user !== uid()) return fail(new NoAccess('window'));
        // A helper that can't be reached here fails this ask ("Try again"); the next one uses the hourly window.
        idToken()
          .then((t) => helperConnect(t, code))
          .then((answer) => done(fromAnswer(user, answer, asked)))
          .catch((e) => {
            if (e instanceof HelperDown) helperDownUntil = Date.now() + HELPER_RETRY_MS;
            fail(e);
          });
      },
      error_callback: windowError(fail),
    });
    client.requestCode();
  });
}

const withGis = (ask: (gis: Gis) => Promise<string>) => (loaded ? ask(loaded) : loadGis().then(ask));

/** A new access for `user`: from the helper when it is on and has their connection, else through Google's window. */
function ask(user: string | null): Promise<string> {
  if (!HELPER_URL || !user || Date.now() < helperDownUntil) return withGis(request);
  // Known to have no connection: the window opens straight from this click.
  if (notConnected === user) return withGis(requestCode);
  const asked = connection;
  return idToken()
    .then((t) => helperAccess(t))
    .then(
      (answer) => {
        if (answer !== 'not-connected') return fromAnswer(user, answer, asked);
        if (user !== uid() || asked !== connection) throw new NoAccess('window');
        notConnected = user;
        // simple: opened after the helper's answer, so a strict browser may block it; the panel then offers
        // Connect Google Calendar, whose click opens it at once (notConnected above).
        return withGis(requestCode);
      },
      (e) => {
        if (!(e instanceof HelperDown)) throw e;
        helperDownUntil = Date.now() + HELPER_RETRY_MS;
        return withGis(request);
      },
    );
}

/** A token for the person's calendar: the one kept (in memory or on this device) while it has over a minute left, else a new one. */
export function token(): Promise<string> {
  const user = uid();
  if (!cached || cached.user !== user || cached.expiresAt <= Date.now() + 60_000) cached = readAccess(device, user);
  if (cached) return Promise.resolve(cached.token);
  if (!CLIENT_ID) return Promise.reject(new Error('No OAuth client ID'));
  // simple: if the script hasn't loaded yet (a very quick first click), the window opens after the
  // wait and may be blocked; the panel then says so and Connect Google Calendar works.
  if (pendingFor !== user) pending = null;
  pendingFor = user;
  if (!pending) {
    const asking: Promise<string> = ask(user).finally(() => {
      if (pending === asking) pending = null; // an older ask ending leaves a newer one in place
    });
    pending = asking;
  }
  return pending;
}

/** Who is signed in now (the uid), or null: the calendar store keeps nothing across a change of person. */
export const person = (): string | null => uid();

/**
 * The token kept in memory or on this device, if it still has over a minute left, and null otherwise —
 * never opening Google's window. The Visualizer uses this to read past events only when access is already
 * there and fresh (owner, 2026-11-13: no Google pop-up, ever, from the Visualizer).
 */
export function keptToken(): string | null {
  const user = uid();
  if (!user) return null;
  if (!cached || cached.user !== user || cached.expiresAt <= Date.now() + 60_000) cached = readAccess(device, user);
  return cached?.token ?? null;
}

export function forget() {
  cached = null;
  dropAccess(device);
}

/**
 * Disconnect calendar (owner decision 2026-11-20): the helper revokes the connection at Google and
 * deletes it, and this device's access goes; the next ask opens Google's window. Rejects (keeping
 * everything) when the helper couldn't do it. Nothing to do without the helper.
 */
export async function disconnect(): Promise<void> {
  const user = uid();
  if (!HELPER_URL || !user) return;
  await helperDisconnect(await idToken());
  connection++;
  forget();
  pending = null;
  if (user === uid()) notConnected = user;
}
