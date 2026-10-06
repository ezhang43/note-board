import { useEffect, useRef, useState } from 'react';
import { shownName } from '../model/board';
import type { Person } from '../store/collab';
import { useAppState } from '../store/appStore';
import { copyText } from '../store/env';
import { collab, useNotice, useSharing } from '../sync/collabSession';
import { CloseIcon, ShareIcon } from './icons';

// Sharing a board (owner request, 2026-10-05: several people editing at once). The Share button
// (toolbar; ⋯ on a phone) opens a panel to share the open board by link, copy the link, see who
// has it and, for the person who shared it, turn the link off and remove people. Everyone else can
// leave the board. Shown only where boards can be shared (signed in, or a demo person locally).

/** The page address a share link starts from. */
const pageAddress = () => new URL(import.meta.env.BASE_URL, location.origin).href;

/** The open board's share, if it is shared (or inside a shared board). */
function useOpenShare() {
  const open = useAppState((s) => s.boards.open);
  return useAppState((s) => s.ui.shares.find((share) => share.boards.includes(open)) ?? null);
}

/** The Share button and its panel. `phone`: shown as a full-width sheet (from the ⋯ menu). */
export function ShareButton({ phone = false, onOpen }: { phone?: boolean; onOpen?: () => void }) {
  const sharing = useSharing();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // A click anywhere else, or Escape, closes the panel.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  if (!sharing) return null;
  return (
    <div className={`share-wrap${phone ? ' phone' : ''}`} ref={wrap}>
      <button
        type="button"
        className={phone ? 'tb-button' : 'tb-button icon-only'}
        aria-label={phone ? undefined : 'Share'}
        title="Share this board"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          onOpen?.();
        }}
      >
        <ShareIcon />
        {phone && 'Share'}
      </button>
      {open && <SharePanel onClose={() => setOpen(false)} />}
    </div>
  );
}

function SharePanel({ onClose }: { onClose: () => void }) {
  const sharing = useSharing();
  const share = useOpenShare();
  const open = useAppState((s) => s.boards.open);
  const home = useAppState((s) => s.boards.home);
  const name = useAppState((s) => shownName(s.board.name));
  const rootName = useAppState((s) => (share ? shownName(share.root === s.boards.open ? s.board.name : (s.boards.others[share.root]?.name ?? '')) : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const me = collab.me();
  if (!sharing) return null;

  /** Runs an action, showing what went wrong if it fails. Resolves to whether it worked. */
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (e) {
      setError(
        (e as { code?: string })?.code === 'permission-denied'
          ? 'That wasn’t allowed. If you just set up sharing, the new online rules may still need pasting into Firebase.'
          : 'That didn’t work. Check your connection and try again.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const link = share ? sharing.link(share.id, pageAddress()) : null;

  return (
    <div className="share-panel" role="dialog" aria-label={`Share ${share ? rootName : name}`}>
      <div className="share-head">
        <h2>Share “{share ? rootName : name}”</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {!share && open === home && <p className="share-text">Your home board holds all your other boards, so it can’t be shared. Open another board, or add a sub-board, to share it.</p>}

      {!share && open !== home && (
        <>
          <p className="share-text">Anyone with the link who signs in with Google can see and edit this board and the boards inside it.</p>
          <button type="button" className="tb-button add-column" aria-busy={busy} disabled={busy} onClick={() => run(() => sharing.share(open))}>
            Share this board
          </button>
        </>
      )}

      {share && (
        <>
          {share.root !== open && <p className="share-text">This board is inside “{rootName}”, which is shared, so everyone who has that board has this one too.</p>}
          {link ? (
            <div className="share-link">
              <input aria-label="Share link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <button
                type="button"
                className="tb-button"
                onClick={() => {
                  copyText(link);
                  setCopied(true);
                }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          ) : (
            <p className="share-text">The link is turned off, so no one new can join.</p>
          )}
          {share.owner && (
            <button type="button" className="tb-button quiet share-link-toggle" disabled={busy} onClick={() => run(() => sharing.setLinkOn(share.id, !link))}>
              {link ? 'Turn link off' : 'Turn link on'}
            </button>
          )}

          <h3>People</h3>
          <ul className="share-people">
            {share.people.map((p) => (
              <li key={p.uid}>
                <Avatar person={p} />
                <span className="share-person-name">
                  {p.name}
                  {p.uid === me?.uid && ' (you)'}
                </span>
                {p.uid === share.ownerUid && <span className="share-tag">Shared it</span>}
                {share.owner && p.uid !== share.ownerUid && (
                  <button
                    type="button"
                    className="tb-button quiet"
                    aria-label={`Remove ${p.name}`}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Remove ${p.name}? “${rootName}” will no longer be shared with them. If the link is on, it changes: share the new one with anyone else who should join.`)) void run(() => sharing.removePerson(share.id, p.uid));
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!share.owner && (
            <button
              type="button"
              className="tb-button quiet share-leave"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm(`Leave “${rootName}”? It will go from your boards. Whoever shared it can share it with you again.`)) return;
                // Closed only once it worked, so an error shows in the panel.
                if (await run(() => sharing.leave(share.id))) onClose();
              }}
            >
              Leave this board
            </button>
          )}
        </>
      )}
      {error && (
        <p className="share-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** A person's photo, or their initial on a coloured circle. */
export function Avatar({ person }: { person: Person }) {
  if (person.photo?.startsWith('https://')) return <img className="avatar" src={person.photo} alt="" referrerPolicy="no-referrer" width={24} height={24} />;
  return (
    <span className="avatar" aria-hidden="true">
      {person.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** A note for the person (a board is no longer shared with them, say), until dismissed. */
export function NoticeBanner() {
  const notice = useNotice();
  if (!notice) return null;
  return (
    <p className="notice-banner" role="status">
      {notice}
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => collab.setNotice(null)}>
        <CloseIcon />
      </button>
    </p>
  );
}
