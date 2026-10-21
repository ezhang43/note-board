import { Component, lazy, Suspense, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { SignInScreen } from './components/SignInScreen';
import { appStore } from './store/appStore';
import { flushWhenHidden } from './sync/pageHide';
import { session } from './sync/session';

// Save any board change or pan/zoom still waiting when the tab is closed or hidden.
flushWhenHidden(document, window, appStore.flush);

// The sign-in screen needs none of the board's code (job 165a), so it comes down on its own: when the
// person presses Sign in (while Google's window is open), or as soon as it is known they are signed in.
const loadBoard = () => import('./App');
const Board = lazy(() => loadBoard().then((m) => ({ default: m.App })));
/** Starts the download early; if it fails, the failure shows where the board should be (BoardLoadFailed). */
const preloadBoard = () => void loadBoard().catch(() => {});

/** The board's code couldn't be downloaded (no connection, or the site was just updated): say so, as for a board that couldn't be loaded. */
class BoardLoadFailed extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError = () => ({ failed: true });
  render() {
    return this.state.failed ? <SignInScreen status="error" error="" onSignIn={session.signIn} onSignOut={session.signOut} /> : this.props.children;
  }
}

/**
 * The published app: the board only for its signed-in owner, a sign-in screen for everyone else.
 * (src/sync/SyncedApp.tsx was this before the board's code was split off; nothing uses it any more.)
 */
export function PublishedApp() {
  const status = useSyncExternalStore(session.subscribe, session.getStatus);
  const error = useSyncExternalStore(session.subscribe, session.getSignInError);
  const saveFailed = useSyncExternalStore(session.subscribe, session.getSaveFailed);
  const saveNote = useSyncExternalStore(session.subscribe, session.getSaveNote);
  useEffect(() => {
    if (status === 'loading' || status === 'ready') preloadBoard();
  }, [status]);
  const signIn = () => {
    preloadBoard();
    session.signIn();
  };
  if (status === 'ready')
    return (
      <>
        <BoardLoadFailed>
          <Suspense fallback={<SignInScreen status="loading" error="" onSignIn={signIn} onSignOut={session.signOut} />}>
            <Board onSignOut={session.signOut} saveNote={saveNote} />
          </Suspense>
        </BoardLoadFailed>
        {/* Said aloud by the board's live region (App.tsx), so it is not a live region itself. */}
        {saveFailed && <p className="save-banner">Couldn’t save online. Changes are on this device only. They’ll be sent with your next change.</p>}
      </>
    );
  return <SignInScreen status={status} error={error} deleted={session.wasDeleted()} onSignIn={signIn} onSignOut={session.signOut} />;
}
