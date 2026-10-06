import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { appStore } from './store/appStore';
import { flushWhenHidden } from './sync/pageHide';
import { localVersionStore, startVersions } from './store/versions';
import { demoStorage, demoUser, startDemo } from './sync/demo';
import './styles.css';

// Save any board change or pan/zoom still waiting when the tab is closed or hidden.
flushWhenHidden(document, window, appStore.flush);

const root = createRoot(document.getElementById('root')!);

// The published site (VITE_SYNC=on, see .env.production) syncs the board to its owner's
// Google account and works offline. `npm run dev` and the tests use the local-only board.
if (import.meta.env.VITE_SYNC === 'on') {
  const loaded = import('./sync/SyncedApp').then(({ SyncedApp }) =>
    root.render(
      <StrictMode>
        <SyncedApp />
      </StrictMode>,
    ),
  );
  registerOfflineCache(loaded);
} else {
  // Local-only: version history is kept on this device. With ?demo-user=Alice (`npm run dev`),
  // boards can be shared between demo people through a pretend server (src/sync/demo.ts).
  const demo = demoUser();
  startVersions(appStore, localVersionStore(demo ? demoStorage(localStorage, demo) : localStorage));
  if (demo) void startDemo(demo);
  // `npm run dev` with ?signed-in shows the published site's Sign out button, to check how the
  // toolbar fits (it doesn't sign anything out here).
  const demoSignOut =
    import.meta.env.DEV && new URLSearchParams(location.search).has('signed-in') ? () => window.alert('Sign out only works on the published site.') : undefined;
  root.render(
    <StrictMode>
      <App onSignOut={demoSignOut} />
    </StrictMode>,
  );
}

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
