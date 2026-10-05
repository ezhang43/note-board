import { deepEqual, mergeBoardSets } from '../model/merge';
import type { StorageLike } from '../model/persist';
import { boardCardKeys, boardsToShare, clashingBoards, groupBoardIds, joinLink, randomKey, readShare, serializeShare } from '../model/sharing';
import type { Board } from '../model/types';
import type { Workspace } from '../model/workspace';
import type { CollabBackend, Person, ShareDoc } from './collab';
import type { Store } from './store';
import { SYNC_DELAY, type SaveState } from './sync';
import type { ShareInfo } from './types';

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
/** A save that failed (no connection, say) is tried again after this long. */
export const RETRY_MS = 5000;

interface Share {
  id: string;
  /** The shared board; null until known (first download on this device). */
  root: string | null;
  owner: boolean;
  ownerUid: string;
  link: string | null;
  people: Person[];
  /** The boards as last agreed with the server (null: never downloaded here). */
  base: Record<string, Board> | null;
  baseRev: number;
  /** The first version has arrived (or one was kept on this device). */
  ready: boolean;
  /** A version that arrived mid-drag, applied once the drag is over. */
  waiting: ShareDoc | null;
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
}

export function startSharing(store: Store, backend: CollabBackend, opts: SharingOptions) {
  const shares = new Map<string, Share>();
  let listLoaded = false;
  let readyFired = false;
  let applying = false;
  let stopped = false;

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
    for (const s of shares.values()) {
      const ids = s.root && s.base ? groupBoardIds(ws, s.root, s.base, taken, s.cameWith) : [];
      ids.forEach((id) => taken.add(id));
      out.set(s.id, ids);
    }
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

  /** The shares this device had (see sharesKey). */
  function readRemembered(): { id: string; owner: boolean; ownerUid: string }[] {
    try {
      const got = JSON.parse(opts.storage?.getItem(sharesKey(backend.me.uid)) ?? '[]') as unknown;
      if (!Array.isArray(got)) return [];
      return got.filter((x): x is { id: string; owner: boolean; ownerUid: string } => typeof x?.id === 'string' && typeof x?.owner === 'boolean' && typeof x?.ownerUid === 'string');
    } catch {
      return [];
    }
  }

  let remembered = '';
  function remember() {
    if (stopped) return;
    const list = JSON.stringify([...shares.values()].map((s) => ({ id: s.id, owner: s.owner, ownerUid: s.ownerUid })));
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
  function refuse(s: Share) {
    s.root = null;
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
    for (const [id, b] of Object.entries(next)) if (b !== now[id] && !deepEqual(b, now[id])) changes[id] = b;
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
      .map((s) => ({ id: s.id, root: s.root!, boards: idsOf(s), owner: s.owner, ownerUid: s.ownerUid, people: s.people, link: s.link }));
    if (!deepEqual(infos, store.getState().ui.shares)) store.setShares(infos);
  }

  function report() {
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
          // Online boards this page can't read (saved by a newer app) are never overwritten.
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
          // Refused (too big, say): the red banner, and the next change tries again (trying the
          // same save again would only be refused again). No connection: it tries again quietly.
          s.failed = e?.code === 'permission-denied';
          // A change made while this one was on its way is a new version: it is tried once.
          if (s.failed && s.again && !s.timer && shares.has(s.id)) schedule(s);
          s.again = false;
          if (!s.failed && !s.timer && shares.has(s.id)) s.timer = setTimeout(() => upload(s), RETRY_MS);
          report();
        },
      );
  }

  /** A new version arrived from the server. */
  function received(s: Share, doc: ShareDoc | null) {
    if (stopped) return;
    // Someone else's share now (security review fix): this one was deleted and its id used again.
    if (!doc || (s.ownerUid && doc.owner !== s.ownerUid)) return gone(s, 'deleted');
    s.owner = doc.owner === backend.me.uid;
    s.ownerUid = doc.owner;
    s.link = doc.link;
    remember();
    const now = boardsOf(s);
    // Its starting board missing here (gone from this device while the page was closed, say): the
    // share's version is taken again, rather than its deletion sent to everyone.
    const missing = !s.root || !now[s.root];
    if (doc.rev > s.baseRev || !s.base || missing) {
      const got = readShare(doc.data);
      if (!got) return;
      if (busy()) {
        s.waiting = doc;
        return;
      }
      // Only boards in the share's data, never one of this person's own, and its starting board must
      // be one of them (security review fix: whatever is saved online can't take this person's boards).
      const boards = safeBoards(s, got.boards, doc.root);
      // A version without its starting board: one it had before stays as it was (anyone it is
      // shared with can save anything in it); one never opened here can't be used.
      if (!boards[doc.root] || (s.root && doc.root !== s.root)) return s.base ? undefined : refuse(s);
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
    close(s);
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
    s.stops.splice(0).forEach((stop) => stop());
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    shares.delete(s.id);
    remember();
  }

  function open(id: string, start?: { root: string; boards: Record<string, Board>; rev: number; owner: boolean; link: string }, owner = false, ownerUid = '') {
    if (shares.has(id) || stopped) return shares.get(id);
    const saved = start ?? readBase(id);
    const s: Share = {
      id,
      root: saved?.root ?? null,
      owner: start?.owner ?? owner,
      ownerUid: start ? backend.me.uid : ownerUid,
      link: start?.link ?? null,
      people: start ? [backend.me] : [],
      base: saved?.boards ?? null,
      baseRev: saved?.rev ?? 0,
      ready: Boolean(saved),
      waiting: null,
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
          publish();
        },
        () => {},
      ),
    );
    publish();
    return s;
  }

  // The shares this device had, straight away: their boards are known as shared before the server
  // answers (or if it can't), so the person's own boards never take them as theirs.
  for (const r of readRemembered()) open(r.id, undefined, r.owner, r.ownerUid);

  const stopList = backend.watchMyShares(
    (ids, confirmed) => {
      for (const id of ids) open(id);
      // Left on another device (only by the server's own list: the offline copy may be out of date).
      if (confirmed) for (const s of [...shares.values()]) if (!ids.includes(s.id) && s.ready && !s.deleting) gone(s, 'left');
      listLoaded = true;
      checkReady();
    },
    () => {
      // Can't read the list (offline with nothing kept, or sharing not switched on online):
      // carry on without shared boards rather than keep the page waiting.
      listLoaded = true;
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

  return {
    /** Whether board `id` is shared (it then syncs with its share, not with its owner's other boards). */
    isShared: (boardId: string) => shareOf(boardId) !== null,
    shareOf,
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
      open(id, { root: boardId, boards, rev: 1, owner: true, link });
      // Changes made while it was being shared.
      if (!deepEqual(boardsOf(shares.get(id)!), boards)) schedule(shares.get(id)!);
      return id;
    },
    /** Joins a share from its link; resolves with its board's id once that has arrived. */
    async join(id: string, key: string): Promise<string> {
      // Opening a link to a board already here just opens it.
      if (!shares.has(id)) await backend.join(id, key);
      const s = open(id) ?? need(id);
      if (!s.ready) await new Promise<void>((done) => s.arrived.push(done));
      if (!s.root) {
        // Can't be used here (see refuse): off this person's list again.
        await backend.leave(id).catch(() => {});
        gone(s, 'left');
        throw new Error('This shared board can’t be opened');
      }
      return s.root;
    },
    /** The share link (null while turned off). */
    link(id: string, page: string): string | null {
      const s = shares.get(id);
      return s?.link ? joinLink(page, id, s.link) : null;
    },
    /** Owner: turn the link off, or on again with a new link (the old one stays off). */
    setLinkOn: (id: string, on: boolean) => backend.setLink(id, on ? randomKey(20) : null),
    /** Owner: removes someone. The link changes too, so the copy of it they have stops working. */
    removePerson: (id: string, uid: string) => backend.removePerson(id, uid, randomKey(20)),
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

export type Sharing = ReturnType<typeof startSharing>;
