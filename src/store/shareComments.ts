import { commentable, commentText, lastAt, threadOf, type Comment } from '../model/comments';
import type { StorageLike } from '../model/persist';
import { randomKey } from '../model/sharing';
import type { Workspace } from '../model/workspace';
import type { CollabBackend, Member, Role } from './collab';
import { readSeen, saveSeen } from './shareStorage';

export interface CommentShareView {
  people: Member[];
  role: Role | null;
  boardIds: string[];
}

export interface ShareCommentsDeps {
  backend: CollabBackend;
  storage: StorageLike | null;
  workspace: () => Workspace;
  /** Looks up share `id` for permission and card checks; returns null if not a share. */
  getShare: (id: string) => CommentShareView | null;
  /** Called when comments or seen timestamps change so the store can republish share info. */
  onChange: () => void;
}

/**
 * Card comments and per-device "seen" unread tracking for shared boards (job 161, PR 4).
 */
export function createShareComments({ backend, storage, workspace, getShare, onChange }: ShareCommentsDeps) {
  /** Each open share's comments, as last heard from the server. */
  const byShare = new Map<string, Comment[]>();
  /** Up to when each card's comments were seen here (see commentsSeenKey). */
  const seen: Record<string, number> = readSeen(storage, backend.me.uid);

  /** Share `id`, where this person may comment on card `card` (job 161, PR 4): refused otherwise. */
  function commentsOn(id: string, card: string): CommentShareView {
    const s = getShare(id);
    if (!s) throw new Error('Not a shared board');
    if (s.role !== 'edit' && s.role !== 'comment') throw new Error('You can’t comment on this board');
    const ws = workspace();
    if (!commentable(card) || !s.boardIds.some((b) => ws.boards[b]?.cards[card])) throw new Error('That card isn’t on this shared board');
    return s;
  }

  return {
    /** Starts watching comments on share `id`; returns a stop function that also clears its cached list. */
    watch(id: string): () => void {
      byShare.set(id, []);
      const stop = backend.watchComments(
        id,
        (comments) => {
          byShare.set(id, comments);
          onChange();
        },
        () => {
          // Refused (not on it any more, or the rules not pasted yet): losing the board is the share's own watch's to report.
        },
      );
      return () => {
        stop();
        byShare.delete(id);
      };
    },
    commentsOf: (id: string): Comment[] => byShare.get(id) ?? [],
    /** Share `id`'s cards as seen here: {card: time}. */
    seenOf: (id: string): Record<string, number> =>
      Object.fromEntries(Object.entries(seen).flatMap(([k, at]) => (k.startsWith(`${id}/`) ? [[k.slice(id.length + 1), at]] : []))),
    /** Drops all seen timestamps for share `id` (called when a share leaves this device). */
    dropSeen(id: string) {
      saveSeen(storage, backend.me.uid, seen, id);
    },
    /** Card `card`'s thread on share `id` (job 161, PR 4). */
    thread: (id: string, card: string) => threadOf(byShare.get(id) ?? [], card),
    /** Comments on a card as this person (editors and commenters): plain text, 1 to 1,000 characters. */
    async addComment(id: string, card: string, raw: string) {
      const s = commentsOn(id, card);
      const text = commentText(raw);
      if (!text) throw new Error('A comment is 1 to 1,000 characters');
      // Their name and photo as on their member record (the rules check it).
      const me = s.people.find((p) => p.uid === backend.me.uid) ?? backend.me;
      await backend.addComment(id, { id: `m${randomKey(19)}`, card, text, name: me.name, photo: me.photo });
    },
    /** Resolves or reopens card `card`'s thread (kept on its first comment). */
    async resolve(id: string, card: string, resolved: boolean) {
      commentsOn(id, card);
      const first = threadOf(byShare.get(id) ?? [], card).first;
      if (!first) throw new Error('No comments on that card');
      await backend.resolveComment(id, first.id, resolved);
    },
    /** Its author, or the person who shared it (checked online). */
    deleteComment: (id: string, commentId: string) => backend.deleteComment(id, commentId),
    /** Card `card`'s thread was looked at: its comments so far are no longer new on this device. */
    markSeen(id: string, card: string) {
      // Only others' comments count (the dot is for them): this person's own may still carry this device's guess of the time.
      const t = threadOf(byShare.get(id) ?? [], card);
      const at = lastAt({ ...t, comments: t.comments.filter((c) => c.author !== backend.me.uid) });
      const key = `${id}/${card}`;
      if (!at || seen[key] === at) return;
      seen[key] = at;
      saveSeen(storage, backend.me.uid, seen);
      onChange();
    },
  };
}
