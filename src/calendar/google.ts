import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { dropAccess, keepAccess, NoAccess, readAccess, type Access } from '../model/calendar';

// Calendar access on the published site (owner request, 2026-10-06), asked for only when the
// Google Calendar panel first opens, not at sign-in. Google Identity Services' token client gives a
// short-lived token (about an hour) for the calendar.events scope; once the person has agreed, a new
// one comes without asking again. The token is kept in memory and for this tab only (sessionStorage,
// owner choice 2026-10-19), so a reload within the hour needs no Google window; it is dropped when
// the person signs out or another signs in, when Google refuses it, and when it runs out. Loaded
// only on the published site.

/** The OAuth client ID (not secret), set in .env.production. Without it the panel says it isn't connected yet. */
const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        login_hint?: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type?: string }) => void;
      }): { requestAccessToken(o?: { prompt?: string }): void };
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

// simple: kept for this tab, so it covers reloads in the same tab within the hour; a new tab, a new
// day or another device still gets Google's quick window. Reaching sessionStorage can throw (blocked).
const tab = () => sessionStorage;

// Signing out (or another person signing in) drops the token from memory; the tab's copy is dropped
// by the sign-in watcher that is always loaded (src/sync/firebase.ts watchUser).
onAuthStateChanged(getAuth(), (user) => {
  if (cached?.user !== user?.uid) cached = null;
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

/** Asks Google for a token, opening its window at once (in the same click when called from one). */
function request(gis: Gis): Promise<string> {
  // Kept only for the person who asked, and only if they are still the one signed in when it comes.
  const user = getAuth().currentUser?.uid;
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
        // Another person signed in while Google's window was open: this token isn't theirs, so it is neither kept nor used.
        if (user !== (getAuth().currentUser?.uid ?? null)) return fail(new NoAccess('window'));
        const expiresAt = Date.now() + Number(r.expires_in ?? 3599) * 1000;
        // An odd expiry (not a number, or Infinity) isn't kept, so it is never taken as never running out.
        if (user && Number.isFinite(expiresAt)) {
          cached = { token: r.access_token, expiresAt, user };
          keepAccess(tab, cached);
        }
        done(r.access_token);
      },
      // The window was blocked or closed (Google's types popup_failed_to_open, popup_closed).
      error_callback: (e) => fail(e.type === 'popup_failed_to_open' || e.type === 'popup_closed' ? new NoAccess('window') : new Error(e.type ?? 'Google sign-in window failed')),
    });
    // Empty prompt: Google asks only the first time; after that a new token comes without asking.
    client.requestAccessToken({ prompt: '' });
  });
}

/** A token for the person's calendar: the one kept (in memory or this tab) while it has over a minute left, else a new one. */
export function token(): Promise<string> {
  const user = getAuth().currentUser?.uid ?? null;
  if (!cached || cached.user !== user || cached.expiresAt <= Date.now() + 60_000) cached = readAccess(tab, user);
  if (cached) return Promise.resolve(cached.token);
  if (!CLIENT_ID) return Promise.reject(new Error('No OAuth client ID'));
  // simple: if the script hasn't loaded yet (a very quick first click), the window opens after the
  // wait and may be blocked; the panel then says so and Connect Google Calendar works.
  if (pendingFor !== user) pending = null;
  pendingFor = user;
  if (!pending) {
    const ask: Promise<string> = (loaded ? request(loaded) : loadGis().then(request)).finally(() => {
      if (pending === ask) pending = null; // an older ask ending leaves a newer one in place
    });
    pending = ask;
  }
  return pending;
}

export function forget() {
  cached = null;
  dropAccess(tab);
}
