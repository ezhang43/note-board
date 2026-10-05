import { parseJoin } from '../model/sharing';
import type { SessionStatus } from '../sync/session';

interface Props {
  status: Exclude<SessionStatus, 'ready'>;
  error: string;
  onSignIn: () => void;
  onSignOut: () => void;
}

/** Shown instead of the board until an account is signed in and its board has loaded. */
export function SignInScreen({ status, error, onSignIn, onSignOut }: Props) {
  return (
    <main className="sign-in">
      <div className="sign-in-panel">
        <h1 className="sign-in-title">BusyAnts</h1>
        {(status === 'checking' || status === 'loading') && <p className="sign-in-text">Opening your board…</p>}
        {status === 'signed-out' && (
          <>
            {/* Opened from a share link (owner request: editing together); it is joined after signing in. */}
            <p className="sign-in-text">{parseJoin(location.search) ? 'Sign in to open the board shared with you.' : 'Sign in to open your board.'}</p>
            <button type="button" className="tb-button sign-in-button" onClick={onSignIn}>
              Sign in with Google
            </button>
            <p className="sign-in-note">Your board is saved online with your Google account so it opens on all your devices. Only you can see it.</p>
            {error && (
              <p className="sign-in-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
        {status === 'no-access' && (
          <>
            <p className="sign-in-text">This Google account can’t open a board. Sign out and sign in with another Google account.</p>
            <button type="button" className="tb-button" onClick={onSignOut}>
              Sign out
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="sign-in-text">Your board couldn’t be loaded. Check your connection and reload the page.</p>
            <button type="button" className="tb-button" onClick={onSignOut}>
              Sign out
            </button>
          </>
        )}
      </div>
    </main>
  );
}
