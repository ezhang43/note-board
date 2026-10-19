import type { Plugin } from 'vite';

// Privacy-friendly page-visit counts (owner request 2026-10-19, job 117): GoatCounter, no cookies, no custom events.
// The owner's snippet is <script data-goatcounter="https://busyants.goatcounter.com/count" async src="//gc.zgo.at/count.js">.
// It is added by a tiny loader instead, so it runs only on the published site: not in `npm run dev`
// (the plugin below applies to builds only) and not on localhost, where the browser tests serve the build.
// simple: the published address is written here; if the site moves to its own domain, change it (and the Privacy page).
export const goatcounterLoader =
  "if(location.hostname==='ezhang43.github.io'&&location.pathname.indexOf('/note-board/')===0){var s=document.createElement('script');" +
  "s.dataset.goatcounter='https://busyants.goatcounter.com/count';" +
  // Count the page path only: a share link's ?join= key must never leave the browser, so no query string is sent.
  "s.dataset.goatcounterSettings=JSON.stringify({path:location.pathname});" +
  "s.async=true;s.src='https://gc.zgo.at/count.js';document.head.appendChild(s)}";

// Vite runs this on every HTML page it builds: the app and each website page.
export function goatcounter(): Plugin {
  return {
    name: 'goatcounter',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('</head>', `<script>${goatcounterLoader}</script>\n  </head>`),
  };
}
