import type { StorageLike } from '../model/persist';
import { readShare, serializeShare } from '../model/sharing';
import type { Board } from '../model/types';
import type { Workspace } from '../model/workspace';
import { ROLES, type Role } from './collab';

/** Where the last agreed version of share `id` is kept on this device. */
export const baseKey = (id: string) => `note-board:share-base:${id}`;
/** Which shares this device had for person `uid`, so they are known as shared before the server answers. */
export const sharesKey = (uid: string) => `note-board:shares:${uid}`;
/** Up to when person `uid` has seen each card's comments on this device ({"share/card": time}): the chip's "new" dot (D2). */
export const commentsSeenKey = (uid: string) => `note-board:comments-seen:${uid}`;
/** Boards this device has seen as person `uid`'s own (see `own` in startSharing). */
export const ownBoardsKey = (uid: string) => `note-board:own-boards:${uid}`;

/** Reads JSON from storage, returning `fallback` on missing, unreadable, or damaged data. */
function readJson<T>(storage: Pick<StorageLike, 'getItem'> | null, key: string, fallback: T): T {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Writes a string to storage, ignoring storage-full or unavailable errors. */
function writeStorage(storage: StorageLike | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage full or unavailable.
  }
}

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
      const list = readJson<unknown>(storage, key, null);
      return Array.isArray(list) ? list.map((x) => baseKey(String((x as { id?: unknown })?.id))) : null;
    };
    const mine = listed(sharesKey(uid));
    const others = new Set(mine ? [] : keys.filter((k) => k.startsWith(sharesKey('')) && k !== sharesKey(uid)).flatMap((k) => listed(k) ?? []));
    for (const key of keys) {
      if (!key.startsWith(baseKey('')) || (mine ? !mine.includes(key) : others.has(key))) continue;
      const saved = readJson<{ data?: unknown } | null>(storage, key, null);
      const got = typeof saved?.data === 'string' ? readShare(saved.data) : null;
      Object.keys(got?.boards ?? {}).forEach((id) => out.add(id));
    }
  } catch {
    // Storage that can't be read: nothing known.
  }
  return out;
}

export function readSeen(storage: StorageLike | null, uid: string): Record<string, number> {
  const got = readJson<unknown>(storage, commentsSeenKey(uid), {});
  if (!got || typeof got !== 'object' || Array.isArray(got)) return {};
  return Object.fromEntries(Object.entries(got).filter(([, v]) => typeof v === 'number'));
}

/** Kept on the device, along with what another tab of this person's noted meanwhile (the later of the two). */
export function saveSeen(storage: StorageLike | null, uid: string, seen: Record<string, number>, drop?: string): void {
  for (const [k, at] of Object.entries(readSeen(storage, uid))) if (!(seen[k] >= at)) seen[k] = at;
  if (drop) for (const k of Object.keys(seen)) if (k.startsWith(`${drop}/`)) delete seen[k];
  writeStorage(storage, commentsSeenKey(uid), JSON.stringify(seen));
}

export function readOwn(storage: StorageLike | null, uid: string): string[] {
  const got = readJson<unknown>(storage, ownBoardsKey(uid), []);
  return Array.isArray(got) ? got.filter((x): x is string => typeof x === 'string') : [];
}

/** Notes the boards that cards on this person's own boards open (see `own` in startSharing). */
export function noteOwn(storage: StorageLike | null, uid: string, own: Set<string>, ws: Workspace, taken: Set<string>): void {
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
  writeStorage(storage, ownBoardsKey(uid), JSON.stringify([...own].filter((id) => ws.boards[id])));
}

export interface SavedBase {
  root: string;
  boards: Record<string, Board>;
  rev: number;
}

export function readBase(storage: StorageLike | null, id: string): SavedBase | null {
  const saved = readJson<{ rev?: unknown; data?: unknown } | null>(storage, baseKey(id), null);
  if (!saved || typeof saved.rev !== 'number' || typeof saved.data !== 'string') return null;
  const got = readShare(saved.data);
  return got && { ...got, rev: saved.rev };
}

export function saveBase(storage: StorageLike | null, id: string, root: string | null, base: Record<string, Board> | null, rev: number): void {
  writeStorage(storage, baseKey(id), base && root ? JSON.stringify({ rev, data: serializeShare(root, base) }) : '');
}

export interface RememberedShare {
  id: string;
  owner: boolean;
  ownerUid: string;
  role: Role | null;
}

/** The shares this device had (see sharesKey), with this person's role on each when it was known (job 161). */
export function readRemembered(storage: StorageLike | null, uid: string): { items: RememberedShare[]; complete: boolean } {
  const got = readJson<unknown>(storage, sharesKey(uid), null);
  if (!Array.isArray(got)) return { items: [], complete: false };
  const ok = got.filter(
    (x): x is { id: string; owner: boolean; ownerUid: string; role?: unknown } =>
      typeof x?.id === 'string' && typeof x?.owner === 'boolean' && typeof x?.ownerUid === 'string',
  );
  return {
    items: ok.map((x) => ({ id: x.id, owner: x.owner, ownerUid: x.ownerUid, role: ROLES.find((r) => r === x.role) ?? null })),
    complete: ok.length === got.length,
  };
}

export function saveRemembered(storage: StorageLike | null, uid: string, items: RememberedShare[], prev: string): string {
  const list = JSON.stringify(items.map((s) => ({ id: s.id, owner: s.owner, ownerUid: s.ownerUid, role: s.role ?? undefined })));
  if (list === prev) return prev;
  writeStorage(storage, sharesKey(uid), list);
  return list;
}
