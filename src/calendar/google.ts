import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Calendar access on the published site (owner request, 2026-10-06), asked for only when the
// Google Calendar panel first opens, not at sign-in. Google Identity Services' token client gives a
// short-lived token (about an hour) for the calendar.events scope; once the person has agreed, a new
// one comes without asking again. The token is kept in memory only, never saved, and dropped when
// the person signs out or another signs in. Loaded only on the published site.

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

let cached: { token: string; expiresAt: number } | null = null;
let pending: Promise<string> | null = null;
let script: Promise<Gis> | null = null;
/** Google's script once loaded, so a click can ask for access straight away (browsers block windows opened after a wait). */
let loaded: Gis | null = null;

// Signing out (or another person signing in) drops the token.
let uid: string | null | undefined;
onAuthStateChanged(getAuth(), (user) => {
  if (user?.uid !== uid) cached = null;
  uid = user?.uid ?? null;
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
  return new Promise<string>((done, fail) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      login_hint: getAuth().currentUser?.email ?? undefined,
      callback(r) {
        // The person may untick calendar access on Google's screen.
        if (r.error || !r.access_token || !gis.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return fail(new Error(r.error ?? 'Calendar access not given'));
        cached = { token: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3599) * 1000 };
        done(r.access_token);
      },
      // The window was blocked or closed.
      error_callback: (e) => fail(new Error(e.type ?? 'Google sign-in window failed')),
    });
    // Empty prompt: Google asks only the first time; after that a new token comes without asking.
    client.requestAccessToken({ prompt: '' });
  });
}

/** A token for the person's calendar: the one in memory while it has over a minute left, else a new one. */
export function token(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return Promise.resolve(cached.token);
  if (!CLIENT_ID) return Promise.reject(new Error('No OAuth client ID'));
  // simple: if the script hasn't loaded yet (a very quick first click), the window opens after the
  // wait and may be blocked; the panel then says so and Try again works.
  pending ??= (loaded ? request(loaded) : loadGis().then(request)).finally(() => (pending = null));
  return pending;
}

export function forget() {
  cached = null;
}
