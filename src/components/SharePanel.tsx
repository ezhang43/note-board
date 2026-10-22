import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { shownName } from '../model/board';
import { ROLES, type Person, type Role } from '../store/collab';
import { appStore, useAppState } from '../store/appStore';
import { copyText } from '../store/env';
import { collab, useNotice, useSharing } from '../sync/collabSession';
import { CaretIcon, CheckIcon, CloseIcon, LinkIcon, PlusIcon, ShareIcon } from './icons';
import { ask } from './ConfirmDialog';

// Sharing a board (owner request, 2026-10-05: several people editing at once). The Share button
// (toolbar; ⋯ on a phone) opens a panel to share the open board by link, copy the link, see who
// has it and, for the person who shared it, turn the links off and remove people. Everyone else can
// leave the board. Shown only where boards can be shared (signed in, or a demo person locally).
// Roles (job 161): one link per role (Can edit / Can comment / Can view), picked in a menu; editors
// see the links, the person who shared it makes them and changes anyone's role in People.

const ROLE_NAME: Record<Role, string> = { edit: 'Can edit', comment: 'Can comment', view: 'Can view' };
const ROLE_HINT: Record<Role, string> = {
  edit: 'Change anything on the board and the boards inside it.',
  comment: 'See everything and comment on cards.',
  view: 'See everything. No changes, no comments.',
};
const LINK_HINT: Record<Role, string> = {
  edit: 'People who open this link and sign in with Google can see and change the board and the boards inside it.',
  comment: 'People who open this link and sign in with Google can see the board and leave comments on cards. They can’t change anything.',
  view: 'People who open this link and sign in with Google can see the board and the boards inside it. They can’t change anything.',
};
const MAKE: Record<Role, string> = { edit: 'Make an edit link', comment: 'Make a comment link', view: 'Make a view link' };
const NOT_YET: Record<Role, string> = { edit: 'There’s no edit link yet.', comment: 'There’s no comment link yet.', view: 'There’s no view link yet.' };

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
    // A press in a question the panel asked (Remove, Leave) isn't outside it.
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && !(e.target as Element).closest?.('dialog.ask') && setOpen(false);
    // Escape in a role menu closes only that menu.
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && setOpen(false);
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
  // The link that was copied: a new link (after turning it off and on) is not "Copied" yet.
  const [copied, setCopied] = useState('');
  // Which role's link is shown (job 161).
  const [pick, setPick] = useState<Role>('edit');
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
  const link = share ? sharing.link(share.id, pageAddress(), pick) : null;
  const anyOn = Boolean(share && ROLES.some((r) => share.links[r]));
  /** This person's role on it (unknown until the People list has arrived). */
  const mine = share?.people.find((p) => p.uid === me?.uid)?.role;

  return (
    <div className="share-panel" role="dialog" aria-label={`Share ${share ? rootName : name}`}>
      <div className="share-head">
        <h2>Share “{share ? rootName : name}”</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {!share && open === home && (
        <>
          <p className="share-text">Your home board holds all your other boards, so it can’t be shared itself. Share a board inside it instead.</p>
          {/* Makes a board inside home and opens it; the panel then offers "Share this board", so sharing still takes its own click. */}
          <button type="button" className="tb-button add-column" onClick={() => appStore.openBoard(appStore.addBoardCard())}>
            <PlusIcon />
            Make a board to share
          </button>
          <p className="share-hint">It starts empty. You can open it and add cards, then press Share this board.</p>
        </>
      )}

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
          {mine === 'edit' && (
            <>
              <div className="share-link-row">
                <span className="share-link-label">
                  <LinkIcon />
                  Anyone with this link
                </span>
                <RoleMenu label="Link role" role={pick} onPick={setPick} />
              </div>
              {link ? (
                <>
                  <div className="share-link">
                    <input aria-label="Share link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                    <button
                      type="button"
                      className="tb-button"
                      onClick={async () => {
                        if (await copyText(link)) setCopied(link); // only when it really reached the clipboard
                      }}
                    >
                      {copied === link ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                  <p className="share-hint">{LINK_HINT[pick]}</p>
                </>
              ) : (
                <p className="share-text">{anyOn ? NOT_YET[pick] : 'The links are turned off, so no one new can join.'}</p>
              )}
              {share.owner && !link && (
                <>
                  {/* D1: said before the click that does it. */}
                  {pick !== 'edit' && !share.links.roles && share.links.edit && (
                    <p className="share-hint">Making a comment or view link also changes your edit link. Share the new edit link with anyone else who should edit. People already on the board aren’t affected.</p>
                  )}
                  <button type="button" className="tb-button share-link-toggle" disabled={busy} onClick={() => run(() => sharing.makeLink(share.id, pick))}>
                    {MAKE[pick]}
                  </button>
                </>
              )}
              {!share.owner && !link && anyOn && <p className="share-hint">Only the person who shared it can make one.</p>}
              {share.owner && anyOn && (
                <button type="button" className="tb-button quiet share-link-toggle" disabled={busy} onClick={() => run(() => sharing.linksOff(share.id))}>
                  Turn links off
                </button>
              )}
            </>
          )}
          {mine && mine !== 'edit' && <p className="share-text">{mine === 'comment' ? 'You can view this board and comment on its cards.' : 'You can view this board.'} Only editors see its links.</p>}

          <h3 id="share-people">People</h3>
          <ul className="share-people" aria-labelledby="share-people">
            {share.people.map((p) => (
              <li key={p.uid}>
                <Avatar person={p} />
                <span className="share-person-name">
                  {p.name}
                  {p.uid === me?.uid && ' (you)'}
                </span>
                {p.uid === share.ownerUid ? (
                  <span className="share-tag">Shared it</span>
                ) : share.owner ? (
                  <RoleMenu
                    label={`${p.name}’s role`}
                    quiet
                    disabled={busy}
                    role={p.role}
                    onPick={async (role) => {
                      // Lowered: the links above their new role that are on change (they may have seen them).
                      const lower = ROLES.indexOf(role) > ROLES.indexOf(p.role);
                      const changing = lower ? ROLES.slice(0, ROLES.indexOf(role)).filter((r) => share.links[r]) : [];
                      if (changing.length && !(await ask({ title: `Change ${p.name} to ${ROLE_NAME[role]}?`, body: `Your ${changing.join(' and ')} ${changing.length > 1 ? 'links change too, since they may have seen them. Share the new ones' : 'link changes too, since they may have seen it. Share the new one'} with anyone else who should join.`, action: 'Change role', cancel: 'Keep role' })))
                        return;
                      void run(() => sharing.setRole(share.id, p.uid, role));
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="role-option role-remove"
                      onClick={async () => {
                        const yes = await ask({ title: `Remove ${p.name}?`, body: `“${rootName}” will no longer be shared with them. Every link that is on changes: share the new ones with anyone else who should join.`, action: `Remove ${p.name}`, danger: true });
                        if (yes) void run(() => sharing.removePerson(share.id, p.uid));
                      }}
                    >
                      <span />
                      <b>Remove {p.name}</b>
                    </button>
                  </RoleMenu>
                ) : (
                  <span className="share-tag">{ROLE_NAME[p.role]}</span>
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
                if (!(await ask({ title: `Leave “${rootName}”?`, body: 'It will go from your boards. Whoever shared it can share it with you again.', action: 'Leave board', cancel: 'Stay', danger: true }))) return;
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

/**
 * A role picker (job 161): a button showing the role and a menu of the three, each with what it
 * allows; `children` go at the menu's end (Remove, in People). Arrow keys move through the menu,
 * Escape closes just the menu.
 */
function RoleMenu({ label, role, onPick, quiet = false, disabled = false, children }: { label: string; role: Role; onPick: (role: Role) => void; quiet?: boolean; disabled?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [open]);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? at + 1 : at < 0 ? items.length - 1 : at - 1;
      items[(next + items.length) % items.length]?.focus();
    }
  };
  return (
    <div className="role-wrap" ref={wrap} onKeyDown={onKeyDown}>
      <button ref={button} type="button" className={`role-button${quiet ? ' quiet' : ''}`} aria-label={`${label}: ${ROLE_NAME[role]}`} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {ROLE_NAME[role]}
        <CaretIcon />
      </button>
      {open && (
        // A click on an item (pointer or keyboard) chooses it and closes the menu.
        <div className="role-menu" role="menu" aria-label={label} onClick={() => setOpen(false)}>
          {ROLES.map((r) => (
            <button key={r} type="button" role="menuitemradio" aria-checked={r === role} className="role-option" onClick={() => r !== role && onPick(r)}>
              {r === role ? <CheckIcon /> : <span />}
              <b>{ROLE_NAME[r]}</b>
              <small>{ROLE_HINT[r]}</small>
            </button>
          ))}
          {children}
        </div>
      )}
    </div>
  );
}

/** A person's photo, or their initial on a coloured circle. */
function Avatar({ person }: { person: Person }) {
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
