import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

// Content Security Policy (job 11, high-risk): which sites the pages may load scripts, frames and
// styles from and send requests to, so a script slipped into a page can't load more code from
// elsewhere or post the person's data (a later feature keeps their own Anthropic key in the browser)
// to a site of its own. GitHub Pages can't send headers, so it is a <meta http-equiv> tag, put on every
// built page (the app and the five website pages) right after <meta charset>, before any script or
// stylesheet: a meta policy applies only from where it appears. A meta policy can't use
// frame-ancestors, report-uri or sandbox (browsers ignore them there), so they are left out.
// simple: this blocks foreign scripts and requests to sites not on the list, not every way out. A
// picture's address (any https site, for link-card pictures) can still carry data, and an injected
// script could still send data to an attacker's own account on a service listed here (their own
// Firestore project or Anthropic key). Paths narrow Google's shared hosts where the app's use is known.

/** The Firebase project's sign-in domain (src/sync/firebase.ts authDomain): sign-in's hidden frame comes from it. */
const AUTH_DOMAIN = 'https://note-board-a672a.firebaseapp.com';

/** Every page, built or in `npm run dev`. */
const BASE: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    // Firebase sign-in with a popup loads Google's gapi loader to open its hidden frame (@firebase/auth
    // `gapiScript` and `loadGapi`), and api.js loads its iframe module from /_/scs/ on the same host
    // (its own config). Only those paths: the host serves other scripts too.
    'https://apis.google.com/js/api.js',
    'https://apis.google.com/_/scs/',
    // Google Identity Services, for the Google Calendar connection (src/calendar/google.ts).
    'https://accounts.google.com/gsi/client',
  ],
  // 'unsafe-inline' for styles only: pasted rich text and some libraries set style="" attributes.
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  // Link-card pictures come from any https site, avatars from Google; data: and blob: for the
  // picture download and the app's own icons.
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  // Link-card videos from any https site; the About page's demo clip is the site's own.
  'media-src': ["'self'", 'blob:', 'https:'],
  'connect-src': [
    "'self'",
    // Firebase sign-in (accounts and tokens) and its database (Firestore). No Firebase Storage: nothing is uploaded.
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firestore.googleapis.com',
    // Google Calendar's API (src/store/calendar.ts) and Google Identity Services' own calls.
    'https://www.googleapis.com/calendar/v3/',
    'https://accounts.google.com/gsi/',
    // The picture / PDF download reads the fonts' stylesheets and files to draw the board in its typefaces.
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    // The person's own Anthropic key is used only here (a later job).
    'https://api.anthropic.com',
  ],
  'frame-src': [
    // Firebase sign-in's hidden frame (@firebase/auth getIframeUrl: https://<authDomain>/__/auth/iframe).
    AUTH_DOMAIN,
    'https://accounts.google.com/gsi/',
    // Link-card players (src/model/media.ts).
    'https://www.youtube-nocookie.com',
    'https://player.vimeo.com',
  ],
  'worker-src': ["'self'"], // the offline copy (sw.js) and pdf.js's reader
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

/** Only in the built site: the GoatCounter visit counter (scripts/goatcounter.ts), never loaded in `npm run dev`. */
export const BUILD_ONLY: Record<string, string[]> = {
  'script-src': ['https://gc.zgo.at/count.js'],
  'connect-src': ['https://busyants.goatcounter.com'],
};

/** Only in `npm run dev`: React's fast-refresh code is an inline script, and Vite's live reload uses a websocket. */
export const DEV_ONLY: Record<string, string[]> = {
  'script-src': ["'unsafe-inline'"],
  'connect-src': ['ws:'],
};

/** The sha256 source of an inline script, as a policy names it. */
export const scriptHash = (code: string) => `'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`;

/** The text of every inline <script> (one without src) in a page. */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script\b(?![^>]*\ssrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
}

/**
 * The policy for one page. A built page allows its own inline scripts by their hashes (the
 * GoatCounter loader, the About page's clip picker) and no other inline script; `npm run dev`
 * allows inline scripts, which a hash can't cover there.
 */
export function cspPolicy(opts: { dev: boolean; inline?: string[] }): string {
  const extra = opts.dev ? DEV_ONLY : BUILD_ONLY;
  const hashes = opts.dev ? [] : [...new Set((opts.inline ?? []).map(scriptHash))];
  return Object.entries(BASE)
    .map(([name, sources]) => {
      const all = [...sources, ...(name === 'script-src' ? hashes : []), ...(extra[name] ?? [])];
      return `${name} ${all.join(' ')}`;
    })
    .join('; ');
}

/** Adds the policy to a page's HTML, right after <meta charset>. */
export function withCsp(html: string, dev: boolean): string {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${cspPolicy({ dev, inline: inlineScripts(html) })}" />`;
  const charset = /<meta charset="[^"]*"\s*\/?>/i;
  if (!charset.test(html)) throw new Error('A page without <meta charset> would get no Content Security Policy');
  return html.replace(charset, (m) => `${m}\n    ${tag}`);
}

// Vite runs this last on every HTML page, built (after GoatCounter's loader is added) and in `npm run dev`.
export function csp(): Plugin {
  return {
    name: 'csp',
    transformIndexHtml: {
      order: 'post',
      handler: (html, ctx) => withCsp(html, Boolean(ctx.server)),
    },
  };
}
