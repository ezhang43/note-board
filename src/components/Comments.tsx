import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyEvent } from 'react';
import { collapsedPreview } from '../model/cards';
import { canDelete, canResolve, chipOf, COMMENT_MAX, commentable, lastAt, sinceLabel, threadOf, threadPlace, type Comment } from '../model/comments';
import { linksIn } from '../model/links';
import { useAppState } from '../store/appStore';
import type { ShareInfo } from '../store/store';
import { collab, useSharing } from '../sync/collabSession';
import { ask } from './ConfirmDialog';
import { CheckIcon, CloseIcon, CommentIcon, TrashIcon } from './icons';
import { Avatar } from './SharePanel';
import { usePhone } from './usePhone';

// Comments on cards (job 161, PR 4): a chip on a card's header with the number of comments in its
// open thread (a dot: one arrived since this device last opened it), opening the thread beside the
// card (a sheet from the bottom on a phone). Editors and commenters write; viewers read (D3).
// Comments live online beside the board, so they are not undoable and not in Version history.

/** Which card's thread is open (screen state only), and the button that opened it. */
let open: { card: string; opener: HTMLElement | null } | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
function setOpen(next: typeof open) {
  open = next;
  listeners.forEach((l) => l());
}
const useOpen = () => useSyncExternalStore(subscribe, () => open);

/** The open board's share, if it is shared. */
const useShare = () => useAppState((s) => s.ui.shares.find((x) => x.boards.includes(s.boards.open)) ?? null);
/** This person's role on it; one not known yet counts as edit (as the store does). */
const roleIn = (share: ShareInfo) => (share.owner ? 'edit' : (share.role ?? 'edit'));
const writes = (share: ShareInfo) => roleIn(share) !== 'view';

/** The chip on card `id`'s header (nothing on a board that isn't shared, D6). */
export function CommentChip({ id }: { id: string }) {
  const share = useShare();
  const shown = useOpen()?.card === id;
  if (!share || !commentable(id)) return null;
  const me = collab.me()?.uid ?? '';
  const thread = threadOf(share.comments ?? [], id);
  const { count, unread } = chipOf(thread, share.seen?.[id], me);
  // No open thread: an "Add comment" button, shown like the header's other buttons, for those who may write.
  if (!count && !writes(share)) return null;
  const label = count ? `${count} comment${count === 1 ? '' : 's'}${unread ? ', new' : ''}` : thread.comments.length ? 'Comments (resolved)' : 'Add comment';
  return (
    <span className="comment-slot">
      <button
        type="button"
        className={count ? 'comment-chip' : 'comment-chip add'}
        aria-label={label}
        title={count ? 'Comments' : label}
        aria-haspopup="dialog"
        aria-expanded={shown}
        onClick={(e) => setOpen(shown ? null : { card: id, opener: e.currentTarget })}
      >
        <CommentIcon />
        {count > 0 && <span>{count}</span>}
        {unread && <span className="comment-dot" />}
      </button>
    </span>
  );
}

/** A comment's text, with its web addresses as links (http and https only, as in notes). */
function CommentText({ text }: { text: string }) {
  const parts: (string | { href: string; text: string })[] = [];
  let at = 0;
  for (const l of linksIn(text)) {
    parts.push(text.slice(at, l.start), { href: l.href, text: l.text });
    at = l.end;
  }
  parts.push(text.slice(at));
  return (
    <p className="comment-text">
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">
            {p.text}
          </a>
        ),
      )}
    </p>
  );
}

/** The open thread; mounted once in the app. */
export function CommentThread() {
  const which = useOpen();
  const share = useShare();
  const card = useAppState((s) => (which ? s.board.cards[which.card] : undefined));
  // Gone (deleted, another board opened, no longer shared): closed.
  const gone = Boolean(which && (!share || !card));
  useEffect(() => {
    if (gone) setOpen(null);
  }, [gone]);
  if (!which || !share || !card) return null;
  return <Thread key={which.card} share={share} cardId={which.card} title={collapsedPreview(card) || 'Card'} opener={which.opener} />;
}

function Thread({ share, cardId, title, opener }: { share: ShareInfo; cardId: string; title: string; opener: HTMLElement | null }) {
  const sharing = useSharing();
  const phone = usePhone();
  const view = useAppState((s) => s.view);
  const board = useAppState((s) => s.board);
  const ref = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const me = collab.me()?.uid ?? '';
  const role = roleIn(share);
  const thread = threadOf(share.comments ?? [], cardId);
  const newest = lastAt(thread);

  const close = () => {
    setOpen(null);
    if (opener?.isConnected) opener.focus();
  };

  // Seen up to the newest comment while it is open (the chip's dot, kept on this device).
  useEffect(() => {
    if (newest) sharing?.markSeen(share.id, cardId);
  }, [sharing, share.id, cardId, newest]);

  // Beside the card, following it as the board moves; a sheet on a phone.
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
      if (phone || !el || !ref.current) return;
      const r = el.getBoundingClientRect();
      const top = document.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 0;
      setPlace(threadPlace(r, { width: ref.current.offsetWidth, height: ref.current.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, top));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [phone, cardId, view, board, thread.comments.length, showResolved]);

  // The keyboard starts in the box (on a wide screen; a phone's keyboard would cover the thread).
  useEffect(() => {
    if (!phone && writes(share)) box.current?.focus({ preventScroll: true });
    else ref.current?.focus({ preventScroll: true });
  }, []); // only when it opens

  // Escape closes it; a press anywhere else too (not on its own chip, which closes it itself, nor in a question it asked).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog.ask[open]')) return;
      e.stopImmediatePropagation();
      close();
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      // The phone's scrim closes it on its own click, so that tap never reaches what is under it.
      if (!ref.current?.contains(t) && !opener?.contains(t) && !t.closest?.('dialog.ask, .comment-scrim')) setOpen(null);
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', down, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', down, true);
    };
  }, [opener]); // simple: `close` only uses `opener`

  const send = () => {
    const text = draft;
    if (!sharing || !text.trim()) return;
    setDraft('');
    setError('');
    sharing.addComment(share.id, cardId, text).catch(() => {
      setDraft(text);
      setError('Couldn’t post your comment. Check your connection and try again.');
    });
  };
  const resolve = (resolved: boolean) => {
    setError('');
    sharing?.resolve(share.id, cardId, resolved).catch(() => setError('That didn’t work. Check your connection and try again.'));
  };
  const remove = async (c: Comment) => {
    const yes = await ask({ title: 'Delete this comment?', body: 'It can’t be brought back.', action: 'Delete', danger: true });
    if (yes) sharing?.deleteComment(share.id, c.id).catch(() => setError('Couldn’t delete it. Check your connection and try again.'));
  };
  const keys = (e: ReactKeyEvent) => {
    // The board's own keys never act behind it (undo, Delete…); Ctrl+Enter sends.
    e.stopPropagation();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target === box.current) {
      e.preventDefault();
      send();
    }
  };

  const hidden = thread.resolved && !showResolved;
  const now = Date.now();
  return (
    <>
      {phone && <div className="comment-scrim" onClick={() => setOpen(null)} />}
      <div ref={ref} className="comment-thread" role="dialog" aria-label={`Comments on ${title}`} tabIndex={-1} style={phone || !place ? undefined : place} onKeyDown={keys}>
        <div className="comment-head">
          <h2>
            Comments · <span>{title}</span>
          </h2>
          {canResolve(role, thread, me) && (
            <button type="button" className="tb-button comment-resolve" onClick={() => resolve(!thread.resolved)}>
              {!thread.resolved && <CheckIcon />}
              {thread.resolved ? 'Reopen' : 'Resolve'}
            </button>
          )}
          <button type="button" className="icon-button" aria-label="Close" title="Close" onClick={close}>
            <CloseIcon />
          </button>
        </div>
        {thread.resolved && (
          <button type="button" className="comment-resolved" aria-expanded={showResolved} onClick={() => setShowResolved((x) => !x)}>
            {showResolved ? 'Hide resolved comments' : `Show resolved (${thread.comments.length})`}
          </button>
        )}
        {!hidden && thread.comments.length > 0 && (
          <ol className="comment-list">
            {thread.comments.map((c) => {
              // Name and photo from the People list (their member record), else as kept with the comment.
              const who = share.people.find((p) => p.uid === c.author) ?? { uid: c.author, name: c.name, photo: c.photo };
              return (
                <li key={c.id} className="comment">
                  <Avatar person={who} />
                  <div className="comment-body">
                    <div className="comment-by">
                      <strong>
                        {who.name}
                        {c.author === me ? ' (you)' : ''}
                      </strong>
                      {/* Marked by who wrote it, which no name or photo can copy (review 181-A M1). */}
                      {c.author === share.ownerUid && <span className="share-tag">Owner</span>}
                      <span>{sinceLabel(c.at, now)}</span>
                      {canDelete(c, me, share.owner) && (
                        <button type="button" className="icon-button block-trash" aria-label="Delete comment" title="Delete comment" onClick={() => void remove(c)}>
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                    <CommentText text={c.text} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {!thread.comments.length && <p className="comment-empty">{writes(share) ? 'No comments yet. Ask a question or leave a note for the others.' : 'No comments yet.'}</p>}
        {error && (
          <p className="comment-error" role="alert">
            {error}
          </p>
        )}
        {writes(share) && (
          <div className="comment-write">
            <textarea ref={box} aria-label="Add a comment" placeholder="Add a comment" maxLength={COMMENT_MAX} rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="comment-send">
              <span>{draft.length > COMMENT_MAX - 100 ? `${COMMENT_MAX - draft.length} characters left` : 'Everyone on this board can see comments.'}</span>
              <button type="button" className="confirm-send" disabled={!draft.trim()} onClick={send}>
                Comment
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
