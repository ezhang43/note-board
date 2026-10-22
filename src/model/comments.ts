// Comments on cards (job 161, PR 4): kept online beside a shared board (shared/{id}/comments), never
// in the board itself, so they are not undoable and not in Version history. All the comments on one
// card make its thread; the thread's state (resolved or not) is kept on its first comment.

/** One comment, as everyone on the board sees it. Name and photo are from the author's member record. */
export interface Comment {
  id: string;
  /** The card it is on (a card's id; ids are unique across boards). */
  card: string;
  text: string;
  /** Who wrote it (their uid). */
  author: string;
  name: string;
  photo: string | null;
  /** When it was written (the server's time, in ms). */
  at: number;
  /** Only the first comment's counts: the whole thread is resolved. */
  resolved: boolean;
  /** When it was last resolved or reopened (ms), if ever. */
  resolvedAt: number | null;
}

/** The most characters one comment may hold (the online rules' limit). */
export const COMMENT_MAX = 1000;

/** The text to send for what was typed: trimmed, or null when empty or too long. */
export function commentText(raw: string): string | null {
  const text = raw.trim();
  return text && text.length <= COMMENT_MAX ? text : null;
}

/** Whether a card can have comments: its id is one the online rules accept (every card made in the app's is). */
export const commentable = (cardId: string) => /^[A-Za-z0-9_-]{1,100}$/.test(cardId);

export interface Thread {
  /** Oldest first. */
  comments: Comment[];
  resolved: boolean;
  /** Who started it (the first comment's author). */
  starter: string | null;
  first: Comment | null;
}

/**
 * Card `card`'s thread. It is resolved while its first comment says so, until someone replies after
 * it was resolved: replying reopens it, for anyone who can comment (only editors and the person who
 * started it may change the first comment).
 */
export function threadOf(comments: readonly Comment[], card: string): Thread {
  const list = comments.filter((c) => c.card === card).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const first = list[0] ?? null;
  const resolved = Boolean(first?.resolved && list.every((c) => first.resolvedAt === null || c.at <= first.resolvedAt));
  return { comments: list, resolved, starter: first?.author ?? null, first };
}

/** When the newest comment in a thread was written (0 for none): what "seen" remembers. */
export const lastAt = (t: Thread) => t.comments.reduce((m, c) => Math.max(m, c.at), 0);

/**
 * The chip on a card's header: how many comments its open thread has (0: no chip; a resolved thread
 * shows none), and whether one by someone else arrived since this device last opened it (`seenAt`).
 */
export function chipOf(t: Thread, seenAt: number | undefined, me: string): { count: number; unread: boolean } {
  if (t.resolved || !t.comments.length) return { count: 0, unread: false };
  return { count: t.comments.length, unread: t.comments.some((c) => c.author !== me && c.at > (seenAt ?? 0)) };
}

/** Resolving or reopening: editors on any thread, commenters on a thread they started (as the online rules). */
export const canResolve = (role: string | undefined, t: Thread, me: string) => Boolean(t.first) && (role === 'edit' || (role === 'comment' && t.starter === me));

/** Deleting: its author, or the person who shared the board. */
export const canDelete = (c: Comment, me: string, owner: boolean) => owner || c.author === me;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Just now", "5 min ago", "2 h ago", "Yesterday", or the day ("12 Oct"). */
export function sinceLabel(at: number, now: number): string {
  const ago = now - at;
  if (ago < 60_000) return 'Just now';
  if (ago < 3600_000) return `${Math.floor(ago / 60_000)} min ago`;
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days === 0) return `${Math.floor(ago / 3600_000)} h ago`;
  if (days === 1) return 'Yesterday';
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`}`;
}

const GAP = 8;
const BESIDE = 16;

/**
 * Where a card's thread sits on a wide screen: right of the card, its top level with the card's;
 * left of it when there is no room on the right; otherwise against the window's right edge. Always
 * on screen, below `minTop` (the toolbar).
 */
export function threadPlace(
  card: { left: number; right: number; top: number },
  size: { width: number; height: number },
  screen: { width: number; height: number },
  minTop: number,
): { left: number; top: number } {
  const right = card.right + BESIDE;
  const left = card.left - BESIDE - size.width;
  return {
    left: right + size.width <= screen.width - GAP ? right : left >= GAP ? left : Math.max(GAP, screen.width - GAP - size.width),
    top: Math.max(minTop + GAP, Math.min(card.top, screen.height - GAP - size.height)),
  };
}
