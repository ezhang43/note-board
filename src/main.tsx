import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { appStore } from './store/appStore';
import { flushWhenHidden } from './sync/pageHide';
import { localVersionStore, startVersions } from './store/versions';
import { demoStorage, demoUser, startDemo } from './sync/demo';
import { takeDeletedNote } from './sync/account';
import { SignInScreen } from './components/SignInScreen';
import './styles.css';

// Motion is for what the pointer does. Anything the keyboard starts (a shortcut, Enter on a button) happens
// at once: the styles read this switch (html[data-input='keys']). Any press of the pointer turns it off again.
addEventListener('keydown', (e) => {
  if (!/^(Shift|Control|Alt|Meta)$/.test(e.key)) document.documentElement.dataset.input = 'keys'; // a held Shift while dragging is still the pointer
}, true);
addEventListener('pointerdown', () => delete document.documentElement.dataset.input, true);

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
  // A demo person who just deleted their account sees the sign-in screen with the note, as on the
  // published site; Sign in starts them afresh.
  if (demo && takeDeletedNote()) {
    root.render(<SignInScreen status="signed-out" error="" deleted onSignIn={() => location.reload()} onSignOut={() => {}} />);
  } else startLocal(demo);
}

function startLocal(demo: ReturnType<typeof demoUser>) {
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
