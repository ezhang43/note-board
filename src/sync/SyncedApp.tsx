import { useSyncExternalStore } from 'react';
import { App } from '../App';
import { SignInScreen } from '../components/SignInScreen';
import { session } from './session';

/** The published app: the board only for its signed-in owner, a sign-in screen for everyone else. */
export function SyncedApp() {
  const status = useSyncExternalStore(session.subscribe, session.getStatus);
  const error = useSyncExternalStore(session.subscribe, session.getSignInError);
  const saveFailed = useSyncExternalStore(session.subscribe, session.getSaveFailed);
  const saveNote = useSyncExternalStore(session.subscribe, session.getSaveNote);
  if (status === 'ready')
    return (
      <>
        <App onSignOut={session.signOut} saveNote={saveNote} />
        {saveFailed && (
          <p className="save-banner" role="status">
            Couldn’t save online. Changes are on this device only.
          </p>
        )}
      </>
    );
  return <SignInScreen status={status} error={error} onSignIn={session.signIn} onSignOut={session.signOut} />;
}
