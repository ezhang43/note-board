import { parseJoin } from '../model/sharing';
import type { SessionStatus } from '../sync/session';

interface Props {
  status: Exclude<SessionStatus, 'ready'>;
  error: string;
  /** The person just deleted their account (job #63). */
  deleted?: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

/** Google's own "G", unmodified (Google's Sign in with Google branding guidelines). */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Shown instead of the board until an account is signed in and its board has loaded. */
export function SignInScreen({ status, error, deleted = false, onSignIn, onSignOut }: Props) {
  const base = import.meta.env.BASE_URL;
  return (
    <main className="sign-in">
      <div className="sign-in-panel">
        <img className="sign-in-logo" src={`${base}busyants-icon.svg`} alt="" width={56} height={56} />
        <h1 className="sign-in-title">BusyAnts</h1>
        {status === 'signed-out' && <p className="sign-in-pitch">Free, with no limits. Your notes stay safe.</p>}
        {(status === 'checking' || status === 'loading') && <p className="sign-in-text">Opening your board…</p>}
        {status === 'signed-out' && (
          <>
            {deleted && (
              <p className="sign-in-deleted" role="status">
                Your account and data were deleted.
              </p>
            )}
            {/* Opened from a share link (owner request: editing together); it is joined after signing in. */}
            {typeof location !== 'undefined' && parseJoin(location.search) && <p className="sign-in-text">Sign in to open the board shared with you.</p>}
            <button type="button" className="google-button" onClick={onSignIn}>
              <GoogleG />
              <span>Sign in with Google</span>
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
            <p className="sign-in-text">Your board couldn’t be loaded. Check your connection and try again.</p>
            <button type="button" className="tb-button" onClick={() => location.reload()}>
              Try again
            </button>
            <button type="button" className="tb-button" onClick={onSignOut}>
              Sign out
            </button>
          </>
        )}
        <nav className="sign-in-links" aria-label="About BusyAnts">
          <a href={`${base}about/`}>About</a>
          <a href={`${base}privacy/`}>Privacy</a>
          <a href={`${base}terms/`}>Terms</a>
        </nav>
      </div>
    </main>
  );
}
