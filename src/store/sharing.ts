import { commentable, commentText, lastAt, threadOf, type Comment } from '../model/comments';
import { deepEqual, mergeBoardSets } from '../model/merge';
import { shownName } from '../model/board';
import type { StorageLike } from '../model/persist';
import { boardCardKeys, boardsToShare, clashingBoards, groupBoardIds, joinLink, randomKey, readShare, savedByNewer, serializeShare } from '../model/sharing';
import type { Board } from '../model/types';
import { readWorkspace, type Workspace } from '../model/workspace';
import { NO_LINKS, ROLES, type CollabBackend, type Links, type Member, type NewKeys, type Role, type ShareDoc } from './collab';
import type { Store } from './store';
import { SYNC_DELAY, type Remote, type SaveState } from './sync';
import type { ShareInfo } from './types';
import { saveSafetyVersion, type VersionStore } from './versions';

// Shared boards (owner request, 2026-10-05: several people editing at once). A shared board, with
// every board inside it, is kept online apart from its owner's other boards. Every page that has it
// keeps it in the store like any other board, and:
// - sends its changes a moment after they are made, combined (src/model/merge.ts) with whatever
//   others saved meanwhile, in one go on the server, so no one's change is overwritten;
// - combines changes others save into its own boards as they arrive (also with changes of its own
//   not sent yet).
// The version both sides last agreed on ("base") is kept on the device, so changes made offline,
// or before a reload, are still combined correctly later.

/** Where the last agreed version of share `id` is kept on this device. */
export const baseKey = (id: string) => `note-board:share-base:${id}`;
/** Which shares this device had for person `uid`, so they are known as shared before the server answers. */
export const sharesKey = (uid: string) => `note-board:shares:${uid}`;
/** Up to when person `uid` has seen each card's comments on this device ({"share/card": time}): the chip's "new" dot (D2). */
export const commentsSeenKey = (uid: string) => `note-board:comments-seen:${uid}`;
/** Boards this device has seen as person `uid`'s own (see `own` in startSharing). */
export const ownBoardsKey = (uid: string) => `note-board:own-boards:${uid}`;

/**
 * Every board in the shares' data kept on this device (see baseKey) for person `uid`, read straight
 * from storage, so their own-board sync can leave them alone before the shares are known. Only the
 * shares on their list kept here (sharesKey), so another account's shares on this device don't
 * count; with no list kept yet, every share kept here counts except those on another account's
 * list (job #145: they are that account's).
 */
export function boardsInKeptShares(storage: { length: number; key(i: number): string | null; getItem(key: string): string | null }, uid: string): Set<string> {
  const out = new Set<string>();
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i) ?? '');
    const listed = (key: string) => {
      const list = JSON.parse(storage.getItem(key) || 'null') as unknown;
      return Array.isArray(list) ? list.map((x) => baseKey(String((x as { id?: unknown })?.id))) : null;
    };
    const mine = listed(sharesKey(uid));
    const theirs = (key: string) => {
      try {
        return listed(key) ?? [];
      } catch {
        return []; // another account's damaged list
      }
    };
    const others = new Set(mine ? [] : keys.filter((k) => k.startsWith(sharesKey('')) && k !== sharesKey(uid)).flatMap(theirs));
    for (const key of keys) {
      if (!key.startsWith(baseKey('')) || (mine ? !mine.includes(key) : others.has(key))) continue;
      const saved = JSON.parse(storage.getItem(key) || 'null') as { data?: unknown } | null;
      const got = typeof saved?.data === 'string' ? readShare(saved.data) : null;
      Object.keys(got?.boards ?? {}).forEach((id) => out.add(id));
    }
  } catch {
    // Storage that can't be read: nothing known.
  }
  return out;
}

/**
 * Which boards the person's own-board sync (startSync) leaves alone: the shared ones (`shared`) and,
 * until `known()` says the shares are known, the boards that may be shared (main session check,
 * 2026-10-06): a board that came with a share kept on this device (`kept`, see boardsInKeptShares)
 * and, after the first online version, a board in none of the online versions (made here
 * meanwhile). Any other board here on first load gives way to the online copy as usual (it may be
 * another account's). Give sync `remote` in place of the online copy: that is how this learns which
 * boards the online copy has.
 */
export function ownBoardsGuard(store: Store, online: Remote, shared: (boardId: string) => boolean, kept: Set<string>, ownCopy?: (ws: Workspace) => void) {
  let known = false;
  /** The first online version (or "there is none") has been dealt with. */
  let loaded = false;
  /** Every board id in an online version seen here, or uploaded from here on first load. */
  const seen = new Set<string>();
  const remote: Remote = {
    write: (doc) => online.write(doc),
    watch: (onChange, onError) =>
      online.watch((doc) => {
        const ws = doc && (!known || !loaded) ? readWorkspace(doc.data)?.ws : null;
        if (!known) {
          // No online copy yet: this device's boards become it (but not ones that came with a share).
          if (!doc && !loaded) Object.keys(store.workspace().boards).forEach((id) => !kept.has(id) && seen.add(id));
          Object.keys(ws?.boards ?? {}).forEach((id) => seen.add(id));
        }
        // The first online copy: no share may hold one of its boards (whole-app review H4, see Sharing.ownCopy).
        if (ws && !loaded) ownCopy?.(ws);
        try {
          onChange(doc);
        } finally {
          loaded = true;
        }
      }, onError),
  };
  return {
    remote,
    isShared: (id: string) => shared(id) || (!known && (kept.has(id) || (loaded && !seen.has(id)))),
    known() {
      known = true;
    },
  };
}

/** A save that failed (no connection, say) is tried again after this long. */
export const RETRY_MS = 5000;

interface Share {
  id: string;
  /** The shared board; null until known (first download on this device). */
  root: string | null;
  owner: boolean;
  ownerUid: string;
  links: Links;
  people: Member[];
  /** Its comments (job 161, PR 4), as last heard. */
  comments: Comment[];
  /** This person's role on it (job 161): from People, else as kept on this device; null while not known. Use roleOf. */
  role: Role | null;
  /** People has answered (or failed) at least once: a join waits for the role only until then. */
  heard: boolean;
  /** Lowered to Can comment or Can view on this page: a change of theirs put back is told about (once). */
  lowered: boolean;
  /** The boards as last agreed with the server (null: never downloaded here). */
  base: Record<string, Board> | null;
  baseRev: number;
  /** The first version has arrived (or one was kept on this device). */
  ready: boolean;
  /** A version that arrived mid-drag, applied once the drag is over. */
  waiting: ShareDoc | null;
  /** Refused because it was saved by a newer version of the app: it stays on the person's list. Only read while the share has no starting board. */
  unreadable: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  uploading: boolean;
  again: boolean;
  failed: boolean;
  /** The owner is deleting it: nothing more is sent. */
  deleting: boolean;
  /** Every board card that came with a version of its data (see groupBoardIds). */
  cameWith: Set<string>;
  /** The boards as last seen in the store, to notice changes made here. */
  seen: Record<string, Board>;
  stops: (() => void)[];
  arrived: (() => void)[];
}

export interface SharingOptions {
  /** Identifies this open page. */
  client: string;
  /** Where the agreed versions are kept (localStorage). */
  storage: StorageLike | null;
  /** Once every shared board is in (or known from this device): the rest can start syncing. */
  onReady?: () => void;
  onSaveState?: (state: SaveState) => void;
  /** A message for the person (a board is no longer shared with them, say). */
  onNotice?: (text: string) => void;
  /** Version history in use, if on: a shared board going from this device is saved there first. */
  versions?: () => VersionStore | null;
}

export function startSharing(store: Store, backend: CollabBackend, opts: SharingOptions) {
  const shares = new Map<string, Share>();
  let listLoaded = false;
  let readyFired = false;
  let applying = false;
  let stopped = false;
  /**
   * Boards seen here as this person's own: opened by a card on one of their own boards (one in no
   * share, home included). A board card put on a shared board never takes one of these into the
   * share (main session check, 2026-10-06): pasting or moving in a card to one of your boards only
   * opens it, for you. A sub-board made on a shared board is opened only from there, so it is never
   * one of these. Kept on the device (a card pasted offline is still not followed after a reload),
   * and noted only once the shares this device had are open, so their boards aren't taken for own.
   */
  const own = new Set<string>(readOwn());
  let noting = false;
  /** Up to when each card's comments were seen here (see commentsSeenKey). */
  const seen: Record<string, number> = readSeen();

  function readSeen(): Record<string, number> {
    try {
      const got = JSON.parse(opts.storage?.getItem(commentsSeenKey(backend.me.uid)) ?? '{}') as unknown;
      if (!got || typeof got !== 'object' || Array.isArray(got)) return {};
      return Object.fromEntries(Object.entries(got).filter(([, v]) => typeof v === 'number'));
    } catch {
      return {};
    }
  }

  /** Kept on the device, along with what another tab of this person's noted meanwhile (the later of the two). */
  function saveSeen(drop?: string) {
    for (const [k, at] of Object.entries(readSeen())) if (!(seen[k] >= at)) seen[k] = at;
    if (drop) for (const k of Object.keys(seen)) if (k.startsWith(`${drop}/`)) delete seen[k];
    try {
      opts.storage?.setItem(commentsSeenKey(backend.me.uid), JSON.stringify(seen));
    } catch {
      // Storage full: seen on this page only.
    }
  }

  /** Share `id`'s cards as seen here: {card: time}. */
  const seenIn = (id: string) => Object.fromEntries(Object.entries(seen).flatMap(([k, at]) => (k.startsWith(`${id}/`) ? [[k.slice(id.length + 1), at]] : [])));

  function readOwn(): string[] {
    try {
      const got = JSON.parse(opts.storage?.getItem(ownBoardsKey(backend.me.uid)) ?? '[]') as unknown;
      return Array.isArray(got) ? got.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  /** Notes the boards that cards on this person's own boards open (see `own`). */
  function noteOwn(ws: Workspace, taken: Set<string>) {
    let grew = false;
    for (const [id, b] of Object.entries(ws.boards)) {
      if (taken.has(id)) continue;
      for (const c of Object.values(b.cards)) {
        if (c.kind === 'board' && ws.boards[c.boardId] && !taken.has(c.boardId) && !own.has(c.boardId)) {
          own.add(c.boardId);
          grew = true;
        }
      }
    }
    if (!grew) return;
    try {
      opts.storage?.setItem(ownBoardsKey(backend.me.uid), JSON.stringify([...own].filter((id) => ws.boards[id])));
    } catch {
      // Storage full: still known on this page.
    }
  }

  /** This person's role on share `s` (whoever shared it is always an editor); null while not known. */
  const roleOf = (s: Share): Role | null => (s.owner ? 'edit' : s.role);
  /** They may only view or comment on it (job 161): nothing of theirs is sent. */
  const readOnly = (s: Share) => roleOf(s) === 'view' || roleOf(s) === 'comment';

  const busy = () => {
    const ui = store.getState().ui;
    return Boolean(ui.drag || ui.resize || ui.newDrag || ui.itemDrag);
  };

  /**
   * The boards that go with each share now (its board, the boards inside it, the ones it had); a
   * board in two goes with the first. Worked out again only when the boards or the shares change,
   * not at every screen update (a drag moves the pointer many times a second).
   */
  let groupCache: { ws: Workspace; key: unknown[]; groups: Map<string, string[]> } | null = null;
  function groups(): Map<string, string[]> {
    const ws = store.workspace();
    const key = [...shares.values()].flatMap((s) => [s.id, s.root, s.base]);
    const c = groupCache;
    if (c && c.ws === ws && c.key.length === key.length && c.key.every((k, i) => k === key[i])) return c.groups;
    const out = new Map<string, string[]>();
    const taken = new Set<string>();
    // A board in another share's data, or last seen in it here, is that share's, whichever share comes
    // first here (whole-app review M2: a board card pasted from one shared board onto another doesn't
    // move its board).
    const held = new Map<string, Share>();
    for (const o of shares.values()) for (const id of [...Object.keys(o.base ?? {}), ...Object.keys(o.seen)]) if (!held.has(id)) held.set(id, o);
    for (const s of shares.values()) {
      const others = new Set(taken);
      held.forEach((o, id) => o !== s && !s.base?.[id] && others.add(id));
      const ids = s.root && s.base ? groupBoardIds(ws, s.root, s.base, others, s.cameWith, own) : [];
      ids.forEach((id) => taken.add(id));
      out.set(s.id, ids);
    }
    if (noting) noteOwn(ws, taken);
    groupCache = { ws, key, groups: out };
    return out;
  }

  const idsOf = (s: Share): string[] => groups().get(s.id) ?? [];

  function boardsOf(s: Share): Record<string, Board> {
    const all = store.workspace().boards;
    return Object.fromEntries(idsOf(s).map((id) => [id, all[id]]));
  }

  function readBase(id: string): { root: string; boards: Record<string, Board>; rev: number } | null {
    try {
      const saved = JSON.parse(opts.storage?.getItem(baseKey(id)) ?? 'null') as { rev?: unknown; data?: unknown } | null;
      if (!saved || typeof saved.rev !== 'number' || typeof saved.data !== 'string') return null;
      const got = readShare(saved.data);
      return got && { ...got, rev: saved.rev };
    } catch {
      return null;
    }
  }

  /**
   * Whether it has been said which shares this person has (job #33): by this device's kept list (read once, at
   * the start, whole and readable) or by the server. Until then, and while a share's boards aren't
   * known, the store restores nothing (see publish).
   */
  let said = false;

  /** The shares this device had (see sharesKey), with this person's role on each when it was known (job 161). */
  function readRemembered(): { id: string; owner: boolean; ownerUid: string; role: Role | null }[] {
    try {
      const got = JSON.parse(opts.storage?.getItem(sharesKey(backend.me.uid)) ?? 'null') as unknown;
      if (!Array.isArray(got)) return [];
      const ok = got.filter((x): x is { id: string; owner: boolean; ownerUid: string; role?: unknown } => typeof x?.id === 'string' && typeof x?.owner === 'boolean' && typeof x?.ownerUid === 'string');
      said = ok.length === got.length;
      return ok.map((x) => ({ ...x, role: ROLES.find((r) => r === x.role) ?? null }));
    } catch {
      return [];
    }
  }

  let remembered = '';
  function remember() {
    if (stopped) return;
    const list = JSON.stringify([...shares.values()].map((s) => ({ id: s.id, owner: s.owner, ownerUid: s.ownerUid, role: roleOf(s) ?? undefined })));
    if (list === remembered) return;
    remembered = list;
    try {
      opts.storage?.setItem(sharesKey(backend.me.uid), list);
    } catch {
      // Storage full: the shares are known once the server answers.
    }
  }

  /**
   * Boards in the share's data that may be taken here: never one with the id of a board of this
   * person's own (security review fix), since anyone it is shared with can save anything in it.
   * One exception: the first time the person who shared it gets it on a device, that device's old
   * copy of the board they shared (and the boards inside it) is taken over by the share.
   */
  function safeBoards(s: Share, boards: Record<string, Board>, root: string): Record<string, Board> {
    const ws = store.workspace();
    const held = [...idsOf(s), ...Object.keys(s.base ?? {})];
    if (s.owner && !s.base) {
      const others = new Set([...shares.values()].filter((o) => o !== s).flatMap(idsOf));
      held.push(...boardsToShare(ws, root, others));
    }
    const clash = clashingBoards(ws, boards, held);
    return clash.length ? Object.fromEntries(Object.entries(boards).filter(([id]) => !clash.includes(id))) : boards;
  }

  /** A version of the share's data is the agreed one now. */
  function agree(s: Share, boards: Record<string, Board>, rev: number) {
    s.base = boards;
    s.baseRev = rev;
    boardCardKeys(boards).forEach((k) => s.cameWith.add(k));
    saveBase(s);
  }

  /** The share can't be used here (security review fix): it holds nothing, and a join waiting on it fails. */
  function refuse(s: Share, unreadable: boolean) {
    s.root = null;
    s.unreadable = unreadable;
    s.ready = true;
    s.arrived.splice(0).forEach((fn) => fn());
    publish();
    checkReady();
  }

  function saveBase(s: Share) {
    try {
      opts.storage?.setItem(baseKey(s.id), s.base && s.root ? JSON.stringify({ rev: s.baseRev, data: serializeShare(s.root, s.base) }) : '');
    } catch {
      // Storage full: the share still works, it just isn't combined as well after a reload.
    }
  }

  /** Puts the boards in `next` into the store, removing those of `now` it lacks. */
  function applyBoards(now: Record<string, Board>, next: Record<string, Board>) {
    const changes: Record<string, Board | null> = {};
    // Compared with the store's copy, which a share not yet set up here doesn't count as its own:
    // the same board isn't replaced, which would clear its undo history (review 137-A L1).
    const here = store.workspace().boards;
    for (const [id, b] of Object.entries(next)) if (!deepEqual(b, here[id])) changes[id] = b;
    for (const id of Object.keys(now)) if (!next[id]) changes[id] = null;
    if (!Object.keys(changes).length) return;
    applying = true;
    try {
      store.replaceBoards(changes);
    } finally {
      applying = false;
    }
  }

  function publish() {
    const infos: ShareInfo[] = [...shares.values()]
      .filter((s) => s.root && s.ready)
      .map((s) => {
        const role = roleOf(s);
        return { id: s.id, root: s.root!, boards: idsOf(s), owner: s.owner, ownerUid: s.ownerUid, people: s.people, links: s.links, ...(role ? { role } : {}), comments: s.comments, seen: seenIn(s.id) };
      });
    const known = said && [...shares.values()].every((s) => s.ready);
    const ui = store.getState().ui;
    if (!deepEqual(infos, ui.shares) || known !== ui.sharesKnown) store.setShares(infos, known);
  }

  function report() {
    // Stopped (signed out, another person): uploads finishing late are no one's to show (job 172).
    if (stopped) return;
    const all = [...shares.values()];
    opts.onSaveState?.(all.some((s) => s.failed) ? 'failed' : all.some((s) => s.timer || s.uploading) ? 'saving' : 'saved');
  }

  function checkReady() {
    if (readyFired || !listLoaded || [...shares.values()].some((s) => !s.ready)) return;
    readyFired = true;
    opts.onReady?.();
  }

  function schedule(s: Share) {
    if (s.deleting || stopped) return;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => upload(s), SYNC_DELAY);
    report();
  }

  /** Sends this page's changes, combined on the server with whatever is there now. */
  function upload(s: Share) {
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    if (!s.ready || !s.root || !s.base || s.deleting || stopped || !shares.has(s.id)) return report();
    if (s.uploading) {
      s.again = true;
      return;
    }
    // After one on its way has landed (so what it saved isn't taken back here).
    if (readOnly(s)) return putBack(s);
    const root = s.root;
    const base = s.base;
    const sent = boardsOf(s);
    // Its starting board isn't here (gone from this device): sending would delete it, with every
    // board in it, for everyone. The share's own version comes back with the next one received.
    if (!sent[root]) return report();
    s.uploading = true;
    report();
    s.seen = sent;
    backend
      .updateShare(
        s.id,
        (latest) => {
          const got = readShare(latest);
          // Online boards this page can't read (damaged, another format, or saved by a newer app) are never overwritten.
          if (!got) return null;
          const merged = mergeBoardSets(base, sent, got.boards);
          return deepEqual(merged, got.boards) ? null : serializeShare(root, merged);
        },
        opts.client,
      )
      .then(
        (after) => {
          s.uploading = false;
          s.failed = false;
          const got = readShare(after.data);
          if (got && after.rev > s.baseRev && shares.has(s.id)) {
            const boards = safeBoards(s, got.boards, root);
            agree(s, boards, after.rev);
            // Others' changes that came with it, on top of anything typed here since.
            const now = boardsOf(s);
            applyBoards(now, mergeBoardSets(sent, now, boards));
            s.seen = boardsOf(s);
          }
          if (s.again) {
            s.again = false;
            upload(s);
          }
          report();
        },
        (e: { code?: string }) => {
          s.uploading = false;
          // Refused since this person can now only view or comment (lowered while it was on its way).
          if (readOnly(s)) return putBack(s);
          // Refused (too big, say, in characters or in bytes: review 137-A L3): the red banner, and the
          // next change tries again (trying the same save again would only be refused again). No
          // connection: it tries again quietly.
          // (Firestore's failed-precondition and resource-exhausted can pass: saves clashing, a rate limit.)
          s.failed = e?.code === 'permission-denied' || e?.code === 'invalid-argument';
          // A change made while this one was on its way is a new version: it is tried once.
          if (s.failed && s.again && !s.timer && shares.has(s.id)) schedule(s);
          s.again = false;
          if (!s.failed && !s.timer && shares.has(s.id)) s.timer = setTimeout(() => upload(s), RETRY_MS);
          report();
        },
      );
  }

  /**
   * A share this person may only view or comment on (job 161) sends nothing. A change made here (as
   * an editor, just before being lowered, say) is put back as the server has it, kept in Version
   * history first, and the person is told; it isn't tried again.
   */
  function putBack(s: Share) {
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    s.again = false;
    s.failed = false;
    const now = boardsOf(s);
    if (s.root && s.base?.[s.root] && !deepEqual(now, s.base)) {
      const name = shownName(s.base[s.root].name);
      const versions = opts.versions?.();
      // The boards are read for the version at once, before they are put back. The notice says it is
      // kept only once it was (not over Version history's size limit, not refused).
      const saving = versions ? saveSafetyVersion(store, versions, Date.now) : Promise.resolve(false);
      applyBoards(now, s.base);
      s.seen = boardsOf(s);
      const can = roleOf(s) === 'comment' ? 'comment on' : 'view';
      if (s.lowered) void saving.then((kept) => !stopped && opts.onNotice?.(`Your last change to “${name}” wasn’t saved: you can only ${can} it now.${kept ? ' It’s kept in Version history.' : ''}`));
      s.lowered = false;
    }
    report();
  }

  /** A new version arrived from the server. */
  function received(s: Share, doc: ShareDoc | null) {
    if (stopped) return;
    // Someone else's share now (security review fix): this one was deleted and its id used again.
    if (!doc || (s.ownerUid && doc.owner !== s.ownerUid)) return gone(s, 'deleted');
    s.owner = doc.owner === backend.me.uid;
    s.ownerUid = doc.owner;
    if (doc.links !== undefined) s.links = doc.links;
    remember();
    const now = boardsOf(s);
    // Its starting board missing here (gone from this device while the page was closed, say): the
    // share's version is taken again, rather than its deletion sent to everyone.
    const missing = !s.root || !now[s.root];
    if (doc.rev > s.baseRev || !s.base || missing) {
      const got = readShare(doc.data);
      if (got && busy()) {
        s.waiting = doc;
        return;
      }
      // Only boards in the share's data, never one of this person's own, and its starting board must
      // be one of them (security review fix: whatever is saved online can't take this person's boards).
      const boards = got ? safeBoards(s, got.boards, doc.root) : {};
      // A version this app can't read (damaged, the old single-board format, another version) or
      // without its starting board: one it had before stays as it was (anyone it is shared with can
      // save anything in it); one never opened here can't be used (whole-app review H2: waiting on it
      // held back the person's own boards for good). Only one saved by a newer version of the app is
      // kept on the person's list for an updated app (job 98).
      if (!boards[doc.root] || (s.root && doc.root !== s.root)) {
        if (!s.base) refuse(s, savedByNewer(doc.data));
        return;
      }
      const next = s.base && !missing ? mergeBoardSets(s.base, now, boards) : boards;
      s.root = doc.root;
      agree(s, boards, doc.rev);
      applyBoards(now, next);
    } else if (doc.root !== s.root) return;
    s.seen = boardsOf(s);
    // Changes made here (now, or before a reload) that the server doesn't have yet.
    if (!deepEqual(s.seen, s.base)) schedule(s);
    s.ready = true;
    s.arrived.splice(0).forEach((fn) => fn());
    publish();
    checkReady();
  }

  /** The share can't be opened any more (removed, deleted, or left): its boards go from here. */
  function gone(s: Share, why: 'removed' | 'deleted' | 'left') {
    if (!shares.has(s.id)) return;
    const ws = store.workspace();
    const ids = idsOf(s);
    const name = (s.root && ws.boards[s.root]?.name.trim()) || 'A shared board';
    // Like deleting any board (main session check, 2026-10-06): every board as it is now is saved as
    // a version first, so Version history can bring these back. Not waited for (the boards are read
    // at once). After the owner's delete on this page (deleteBoardSafely saved one first), this one
    // matches the newest version, so it is removed again once saved (if this page is still open then).
    const versions = opts.versions?.();
    if (versions && ids.length) void saveSafetyVersion(store, versions, Date.now);
    close(s);
    saveSeen(s.id);
    try {
      opts.storage?.setItem(baseKey(s.id), '');
    } catch {
      // Nothing to forget.
    }
    if (s.owner) {
      // The owner deleted it: like deleting any board, the boards inside it stay (theirs again).
      if (s.root && ws.boards[s.root]) {
        applying = true;
        try {
          store.deleteBoard(s.root);
        } finally {
          applying = false;
        }
      }
    } else applyBoards(Object.fromEntries(ids.map((id) => [id, ws.boards[id]])), {});
    // Off this person's list of shares too (it may already be).
    if (why !== 'left') backend.leave(s.id).catch(() => {});
    if (why === 'removed') opts.onNotice?.(`“${name}” is no longer shared with you.`);
    if (why === 'deleted' && !s.owner) opts.onNotice?.(`“${name}” was deleted by the person who shared it.`);
    publish();
    checkReady();
    report();
  }

  function close(s: Share) {
    // A join waiting on it fails (review 137-A M8).
    s.arrived.splice(0).forEach((fn) => fn());
    s.stops.splice(0).forEach((stop) => stop());
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    shares.delete(s.id);
    remember();
  }

  function open(id: string, start?: { root: string; boards: Record<string, Board>; rev: number; owner: boolean; links: Links }, owner = false, ownerUid = '', role: Role | null = null) {
    const had = shares.get(id);
    // Opened by the list of shares before `share` got here (Firestore shows a write before it
    // resolves): what was shared is its agreed version, so text typed meanwhile is sent (review 137-A L1).
    if (had && start && !had.root && !had.base) {
      Object.assign(had, { root: start.root, owner: start.owner, ownerUid: backend.me.uid, links: start.links, people: [{ ...backend.me, role: 'edit' }], ready: true });
      agree(had, start.boards, start.rev);
      remember();
      publish();
      checkReady();
    }
    if (had || stopped) return had;
    const saved = start ?? readBase(id);
    const s: Share = {
      id,
      root: saved?.root ?? null,
      owner: start?.owner ?? owner,
      ownerUid: start ? backend.me.uid : ownerUid,
      links: start?.links ?? NO_LINKS,
      people: start ? [{ ...backend.me, role: 'edit' }] : [],
      comments: [],
      role,
      heard: false,
      lowered: false,
      base: saved?.boards ?? null,
      baseRev: saved?.rev ?? 0,
      ready: Boolean(saved),
      waiting: null,
      unreadable: false,
      timer: null,
      uploading: false,
      again: false,
      failed: false,
      deleting: false,
      cameWith: boardCardKeys(saved?.boards ?? {}),
      seen: {},
      stops: [],
      arrived: [],
    };
    shares.set(id, s);
    remember();
    s.seen = boardsOf(s);
    if (start) saveBase(s);
    s.stops.push(
      backend.watchShare(
        id,
        (doc) => received(s, doc),
        (e) => {
          if ((e as { code?: string })?.code === 'permission-denied') gone(s, 'removed');
        },
      ),
      backend.watchPeople(
        id,
        (people) => {
          s.people = people;
          s.heard = true;
          const was = roleOf(s);
          s.role = people.find((p) => p.uid === backend.me.uid)?.role ?? s.role;
          if (roleOf(s) !== was) remember();
          // Lowered to Can comment or Can view (job 161): changes not sent yet are put back now
          // (one on its way is dealt with when the server answers).
          if (readOnly(s) && (was === 'edit' || s.failed)) s.lowered = true;
          if (readOnly(s) && s.ready && !s.uploading && (s.lowered || s.failed)) putBack(s);
          publish();
          s.arrived.splice(0).forEach((fn) => fn()); // a join waiting for the role
        },
        () => {
          s.heard = true;
          s.arrived.splice(0).forEach((fn) => fn());
        },
      ),
      backend.watchComments(
        id,
        (comments) => {
          s.comments = comments;
          publish();
        },
        () => {
          // Refused (not on it any more, or the rules not pasted yet): losing the board is the share's own watch's to report.
        },
      ),
    );
    publish();
    return s;
  }

  // The shares this device had, straight away: their boards are known as shared before the server
  // answers (or if it can't), so the person's own boards never take them as theirs.
  for (const r of readRemembered()) open(r.id, undefined, r.owner, r.ownerUid, r.role);
  noting = true;
  groupCache = null;
  groups();
  publish();

  const stopList = backend.watchMyShares(
    (ids, confirmed) => {
      for (const id of ids) open(id);
      if (confirmed) {
        // Left on another device (only by the server's own list: the offline copy may be out of date).
        for (const s of [...shares.values()]) if (!ids.includes(s.id) && s.ready && !s.deleting) gone(s, 'left');
        said = true;
        // Kept even when empty, so the next page here knows at once (job #33).
        remember();
        publish();
      }
      listLoaded = true;
      checkReady();
    },
    () => {
      // Can't read the list (offline with nothing kept, or sharing not switched on online):
      // carry on without shared boards rather than keep the page waiting. Restoring isn't held
      // back for good either (job #33): no share can arrive through the list now.
      listLoaded = true;
      said = true;
      publish();
      checkReady();
    },
  );

  /** The boards when last looked at: screen-only updates (a pointer moving) are skipped quickly. */
  let lastWs: Workspace | null = null;
  const unsubscribe = store.subscribe(() => {
    if (applying || stopped) return;
    const ws = store.workspace();
    if (ws === lastWs && ![...shares.values()].some((s) => s.waiting)) return;
    lastWs = ws;
    for (const s of shares.values()) {
      if (s.waiting && !busy()) {
        const doc = s.waiting;
        s.waiting = null;
        received(s, doc);
      }
      if (!s.ready) continue;
      // Its starting board gone from here (undoing its making, say): it comes back, since only the
      // person who shared it deletes it, for everyone, from the Boards menu.
      if (s.root && s.base?.[s.root] && !ws.boards[s.root]) {
        applyBoards({}, { [s.root]: s.base[s.root] });
        s.seen = {};
      }
      const now = boardsOf(s);
      const ids = Object.keys(now);
      const same = ids.length === Object.keys(s.seen).length && ids.every((id) => now[id] === s.seen[id]);
      if (same) continue;
      const moved = ids.length !== Object.keys(s.seen).length || ids.some((id) => !(id in s.seen));
      s.seen = now;
      schedule(s);
      // A board added to it, or deleted from it.
      if (moved) publish();
    }
  });

  const shareOf = (boardId: string) => [...shares.values()].find((s) => idsOf(s).includes(boardId))?.id ?? null;
  const need = (id: string) => {
    const s = shares.get(id);
    if (!s) throw new Error('Not a shared board');
    return s;
  };

  /** Share `id`, where this person may comment on card `card` (job 161, PR 4): refused otherwise. */
  function commentsOn(id: string, card: string) {
    const s = need(id);
    const role = roleOf(s);
    if (role !== 'edit' && role !== 'comment') throw new Error('You can’t comment on this board');
    const ws = store.workspace();
    if (!commentable(card) || !idsOf(s).some((b) => ws.boards[b]?.cards[card])) throw new Error('That card isn’t on this shared board');
    return s;
  }

  return {
    /** Whether board `id` is shared (it then syncs with its share, not with its owner's other boards). */
    isShared: (boardId: string) => shareOf(boardId) !== null,
    shareOf,
    /**
     * The person's own boards online (`ws`), as first read on this device (whole-app review H4): a
     * share's data holding a board with the id of one of them doesn't take it, even on a device that
     * didn't have it yet (anyone it is shared with can save anything in it). That board stays theirs.
     * Allowed: for whoever shared it, the board they shared and the boards inside it (that copy online
     * is from before sharing). Checked at every page load, so a board a share took before is given back.
     * A share whose starting board is one of them holds nothing here.
     */
    ownCopy(ws: Workspace) {
      for (const s of shares.values()) {
        if (!s.root || !s.base) continue;
        const allowed = s.owner ? boardsToShare(ws, s.root, new Set()) : [];
        const clash = clashingBoards(ws, s.base, allowed);
        if (!clash.length) continue;
        if (clash.includes(s.root)) [s.root, s.base] = [null, null];
        else s.base = Object.fromEntries(Object.entries(s.base).filter(([id]) => !clash.includes(id)));
        saveBase(s);
      }
      publish();
    },
    /** Shares board `boardId` (and the boards inside it); resolves with the share's id. */
    async share(boardId: string): Promise<string> {
      const existing = shareOf(boardId);
      if (existing) return existing;
      const ws = store.workspace();
      const taken = new Set([...shares.values()].flatMap(idsOf));
      const ids = boardsToShare(ws, boardId, taken);
      if (!ids.length) throw new Error('This board can’t be shared');
      const boards = Object.fromEntries(ids.map((id) => [id, ws.boards[id]]));
      const id = `s${randomKey(12)}`;
      const link = randomKey(20);
      await backend.createShare(id, boardId, link, serializeShare(boardId, boards), opts.client);
      open(id, { root: boardId, boards, rev: 1, owner: true, links: { ...NO_LINKS, edit: link } });
      // Changes made while it was being shared.
      if (!deepEqual(boardsOf(shares.get(id)!), boards)) schedule(shares.get(id)!);
      return id;
    },
    /** Joins a share from its link; resolves with its board's id once that has arrived. */
    async join(id: string, key: string): Promise<string> {
      // Opening a link to a board already here just opens it. The link is also tried online, not
      // waited for (offline, a save waits for the connection), when it may give a higher role (a
      // viewer given the edit link, job 161); one that doesn't work (turned off since) changes nothing.
      const here = shares.get(id);
      const role = here?.people.find((p) => p.uid === backend.me.uid)?.role;
      // Not while their role isn't known yet (the People list hasn't answered): code review.
      if (here && role && role !== 'edit') backend.join(id, key).catch(() => {});
      const added = !here && (await backend.join(id, key));
      const s = open(id) ?? need(id);
      // (People arriving wake it too: it waits on until the board has, or the share has gone.)
      while (!s.ready && shares.has(id)) await new Promise<void>((done) => s.arrived.push(done));
      // Just joined: their role first (job 161), so a board they may only view never shows as editable.
      if (added && !roleOf(s) && !s.heard && s.root && shares.has(id)) await new Promise<void>((done) => s.arrived.push(done));
      if (!s.root || !shares.has(id)) {
        // Can't be used here (see refuse): off this person's list again, only if this join added them
        // (owner decision, 2026-10-18: someone already on it, on a new device whose shared-boards list
        // hasn't loaded, keeps it). Never their own share, and never one saved by a newer version of
        // the app, which an updated app opens (job #91).
        // Not after signing out, or once it went (that already took them off).
        if (added && !s.owner && !s.unreadable && shares.has(id)) {
          await backend.leave(id).catch(() => {});
          gone(s, 'left');
        }
        throw new Error('This shared board can’t be opened');
      }
      return s.root;
    },
    /** The share link for `role` (null while turned off, or not given to this person). */
    link(id: string, page: string, role: Role = 'edit'): string | null {
      const key = shares.get(id)?.links[role];
      return key ? joinLink(page, id, key) : null;
    },
    /** Owner: turns `role`'s link on, with a new key (the first comment or view link changes the edit link too, D1). */
    makeLink: (id: string, role: Role) => backend.makeLink(id, role, newKeys()),
    /** Owner: turns all three links off (old copies stop working for good). */
    linksOff: (id: string) => backend.linksOff(id),
    /** Owner: changes someone's role (lowering them changes the links above their new role). */
    setRole: (id: string, uid: string, role: Role) => backend.setRole(id, uid, role, newKeys()),
    /** Owner: removes someone. Every link that is on changes too, so the copies they have stop working. */
    removePerson: (id: string, uid: string) => backend.removePerson(id, uid, newKeys()),
    /** Stop having a board someone shared: it goes from this person's boards. */
    async leave(id: string) {
      const s = need(id);
      if (s.owner) throw new Error('The person who shared a board can’t leave it');
      await backend.leave(id);
      gone(s, 'left');
    },
    /** Owner: deletes the shared board for everyone (the boards inside it stay with the owner). */
    async deleteShare(id: string) {
      const s = need(id);
      s.deleting = true;
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      try {
        await backend.deleteShare(id);
      } catch (e) {
        s.deleting = false;
        throw e;
      }
      gone(s, 'deleted');
    },
    /** Card `card`'s thread on share `id` (job 161, PR 4). */
    thread: (id: string, card: string) => threadOf(shares.get(id)?.comments ?? [], card),
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
      const s = commentsOn(id, card);
      const first = threadOf(s.comments, card).first;
      if (!first) throw new Error('No comments on that card');
      await backend.resolveComment(id, first.id, resolved);
    },
    /** Its author, or the person who shared it (checked online). */
    deleteComment: (id: string, commentId: string) => backend.deleteComment(id, commentId),
    /** Card `card`'s thread was looked at: its comments so far are no longer new on this device. */
    markSeen(id: string, card: string) {
      // Only others' comments count (the dot is for them): this person's own may still carry this device's guess of the time.
      const t = threadOf(shares.get(id)?.comments ?? [], card);
      const at = lastAt({ ...t, comments: t.comments.filter((c) => c.author !== backend.me.uid) });
      const key = `${id}/${card}`;
      if (!at || seen[key] === at) return;
      seen[key] = at;
      saveSeen();
      publish();
    },
    /** The connection is back: send what is waiting now. */
    retry() {
      for (const s of shares.values()) upload(s);
    },
    /** Send waiting changes now (the page is being hidden). */
    flush() {
      for (const s of shares.values()) if (s.timer) upload(s);
    },
    stop() {
      stopped = true;
      stopList();
      unsubscribe();
      for (const s of [...shares.values()]) close(s);
    },
  };
}

/** A new key for each link, for whichever a change needs. */
const newKeys = (): NewKeys => ({ edit: randomKey(20), comment: randomKey(20), view: randomKey(20) });

export type Sharing = ReturnType<typeof startSharing>;
