import { StrictMode } from 'react';
import { root } from './boot';

// The published site (VITE_SYNC=on, see .env.production) syncs the board to its owner's Google account and works
// offline. Its sign-in screen loads without the board's code (job 165a): PublishedApp brings that in when needed.
const loaded = import('./PublishedApp').then(({ PublishedApp }) =>
  root.render(
    <StrictMode>
      <PublishedApp />
    </StrictMode>,
  ),
);
registerOfflineCache(loaded);

/** Lets the page open without internet once it has been visited online (see public/sw.js). */
function registerOfflineCache(appLoaded: Promise<unknown>) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then(() => Promise.all([navigator.serviceWorker.ready, appLoaded]))
    .then(([reg]) => {
      // Files this visit loaded before the offline cache was running.
      const loaded = performance.getEntriesByType('resource').map((e) => e.name);
      reg.active?.postMessage({ cache: loaded });
    })
    .catch(() => {
      // No offline copy: the site still works online.
    });
}
