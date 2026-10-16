import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { deletionCounts } from '../model/account';
import { useAppState } from '../store/appStore';
import { account, useAccountPanel, useAccountRemover } from '../sync/account';
import { CloseIcon } from './icons';
import { useCoverBoard } from './textField';
import { downloadBackup } from './Toolbar';

// Delete your account and data (job #63, required by Google Play). File → Delete account… opens it
// (on a phone ⋯ → File): what goes, a backup first, typing DELETE, then Google confirms the sign-in.

const FAILED = 'That didn’t work. Check your connection and try again.';
const PART_WAY = 'That didn’t finish, and some of your data is already deleted. Check your connection and try again to delete the rest.';

function watchOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
export const useOnline = () => useSyncExternalStore(watchOnline, () => navigator.onLine);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function DeleteAccountPanel() {
  const open = useAccountPanel();
  const remover = useAccountRemover();
  return open && remover ? <Panel remove={remover} /> : null;
}

function Panel({ remove }: { remove: () => Promise<void> }) {
  const online = useOnline();
  const known = useAppState((s) => s.ui.sharesKnown);
  const shares = useAppState((s) => s.ui.shares);
  const boards = useAppState((s) => s.boards);
  const counts = deletionCounts([boards.open, ...Object.keys(boards.others)], shares);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = () => !busy && account.close();
  const backdrop = useRef<HTMLDivElement>(null);
  useCoverBoard(backdrop);
  const field = useRef<HTMLInputElement>(null);
  // Focus starts in the DELETE box. It is off while deleting, which drops focus; when it comes back (a failure), so does focus.
  useEffect(() => {
    if (!busy) field.current?.focus();
  }, [busy]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const ready = typed.trim() === 'DELETE' && online && known && !busy;
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      // On success the page reloads to the sign-in screen.
      await remove();
    } catch (e) {
      const { code, partial } = e as { code?: string; partial?: boolean };
      // Closing the Google window just goes back to the panel.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') setError('');
      else if (code === 'auth/user-mismatch') setError('That’s a different Google account. Pick the one you’re signed in with.');
      else setError(partial ? PART_WAY : FAILED);
      setBusy(false);
    }
  };

  return (
    <div ref={backdrop} className="shortcuts-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section className="shortcuts-panel delete-account" role="dialog" aria-modal="true" aria-label="Delete your account">
        <header className="shortcuts-header">
          <h2>Delete your account</h2>
          <button type="button" className="icon-button" aria-label="Close" title="Close (Escape)" onClick={close}>
            <CloseIcon />
          </button>
        </header>
        <p>
          This permanently deletes your BusyAnts account, everything kept online except feedback you sent, and the copy on this device. It can’t be undone. Other
          phones or computers you’re signed in on are signed out but keep the copy saved on them until it’s cleared.
        </p>
        <ul>
          <li>All your boards ({plural(counts.boards, 'board', 'boards')}) and everything on them</li>
          <li>Version history (the earlier versions of your boards kept online)</li>
          {counts.sharedByMe > 0 && (
            <li>
              <strong>
                {counts.sharedByMe === 1 ? '1 board you shared is deleted for everyone you shared it with' : `${counts.sharedByMe} boards you shared are deleted for everyone you shared them with`}
              </strong>
              , with the boards inside {counts.sharedByMe === 1 ? 'it' : 'them'}
            </li>
          )}
          {counts.sharedWithMe > 0 && (
            <li>
              {counts.sharedWithMe === 1 ? 'You leave 1 board someone shared with you; they keep it' : `You leave ${counts.sharedWithMe} boards others shared with you; they keep them`}
            </li>
          )}
          <li>Your name and photo on shared boards</li>
          <li>Your sign-in to BusyAnts (your Google account itself stays)</li>
        </ul>
        <p className="delete-account-note">Feedback you sent isn’t deleted with your account: email ezhang43@gmail.com to have it removed.</p>
        <p className="delete-account-backup">
          Backup files you download stay on your device.
          <button type="button" className="tb-button" onClick={downloadBackup}>
            Download a backup first
          </button>
        </p>
        <label className="delete-account-type">
          Type DELETE to confirm
          <input ref={field} value={typed} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="DELETE" disabled={busy} onChange={(e) => setTyped(e.currentTarget.value)} />
        </label>
        <p className="delete-account-note">Google will ask you to sign in once more, to check it’s you.</p>
        {!online && <p className="delete-account-note">You’re offline. Connect to the internet to delete your account.</p>}
        {online && !known && <p className="delete-account-note">Your shared boards are still loading. Try again in a moment.</p>}
        {error && (
          <p className="sign-in-error" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button type="button" className="confirm-delete" disabled={!ready} onClick={confirm}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </section>
    </div>
  );
}
