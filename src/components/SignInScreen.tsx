import type { SessionStatus } from '../sync/session';

interface Props {
  status: Exclude<SessionStatus, 'ready'>;
  error: string;
  onSignIn: () => void;
  onSignOut: () => void;
}

/** Shown instead of the board until an invited account is signed in and its board has loaded. */
export function SignInScreen({ status, error, onSignIn, onSignOut }: Props) {
  return (
    <main className="sign-in">
      <div className="sign-in-panel">
        <h1 className="sign-in-title">BusyAnts</h1>
        {(status === 'checking' || status === 'loading') && <p className="sign-in-text">Opening your board…</p>}
        {status === 'signed-out' && (
          <>
            <p className="sign-in-text">Sign in to open your board.</p>
            <button type="button" className="tb-button sign-in-button" onClick={onSignIn}>
              Sign in with Google
            </button>
            {error && (
              <p className="sign-in-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
        {status === 'no-access' && (
          <>
            <p className="sign-in-text">BusyAnts is invite-only for now, and this Google account isn’t invited. Ask the person who shared it with you to add your account, or sign out and use an invited one.</p>
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
