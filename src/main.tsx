import { StrictMode } from 'react';
import { App } from './App';
import { root } from './boot';
import { appStore } from './store/appStore';
import { flushWhenHidden } from './sync/pageHide';
import { localVersionStore, startVersions } from './store/versions';
import { demoStorage, demoUser, startDemo } from './sync/demo';
import { takeDeletedNote } from './sync/account';
import { SignInScreen } from './components/SignInScreen';

// `npm run dev` and the tests: the board on this device only, with no sign-in. The published site starts from
// mainPublished.tsx instead (vite.config.ts swaps the two in index.html), so its sign-in screen doesn't carry the board's code.

// Save any board change or pan/zoom still waiting when the tab is closed or hidden.
flushWhenHidden(document, window, appStore.flush);

// Version history is kept on this device. With ?demo-user=Alice (`npm run dev`),
// boards can be shared between demo people through a pretend server (src/sync/demo.ts).
const demo = demoUser();
// A demo person who just deleted their account sees the sign-in screen with the note, as on the
// published site; Sign in starts them afresh.
if (demo && takeDeletedNote()) {
  root.render(<SignInScreen status="signed-out" error="" deleted onSignIn={() => location.reload()} onSignOut={() => {}} />);
} else startLocal(demo);

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
