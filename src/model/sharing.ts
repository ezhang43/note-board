import type { Board } from './types';
import { boardLinks, readWorkspace, serializeWorkspace, type Workspace } from './workspace';

// Sharing a board (owner request, 2026-10-05): a shared board takes every board inside it along, and
// is saved online apart from its owner's other boards, so everyone it is shared with can edit it.

/**
 * The boards that sharing board `root` now takes with it: itself and every board inside it, however
 * deep. Never the home board, nor a board in `taken` (held by another share).
 */
export function boardsToShare(ws: Workspace, root: string, taken: Set<string>): string[] {
  if (!ws.boards[root] || root === ws.home || taken.has(root)) return [];
  const out: string[] = [];
  const queue = [root];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.includes(id) || !ws.boards[id] || id === ws.home || taken.has(id)) continue;
    out.push(id);
    queue.push(...boardLinks(ws.boards[id]));
  }
  return out;
}

/**
 * The boards here that a share holds (security review fix, 2026-10-06). `agreed` is the share's
 * data as last agreed with the server. A share only ever holds:
 * - the boards in its data (its starting board `root` must be one of them, or it holds nothing);
 * - boards that a board card added here since opens (a sub-board made on a shared board), with
 *   the boards inside those.
 * A board card that came with the share's data (on any of its boards, or in an earlier version:
 * `cameWith`, see boardCardKeys) never takes in a board outside it, even once moved, so whatever is
 * saved online can't make one of this person's own boards part of a share. With its starting
 * board gone from here, it still holds its other boards. Never the home board, nor a board in
 * `taken` (held by another share).
 */
export function groupBoardIds(ws: Workspace, root: string, agreed: Record<string, Board>, taken: Set<string>, cameWith = new Set<string>()): string[] {
  const ok = (id: string) => Boolean(ws.boards[id]) && id !== ws.home && !taken.has(id);
  if (!agreed[root] || root === ws.home || taken.has(root)) return [];
  const came = new Set([...cameWith, ...boardCardKeys(agreed)]);
  const out: string[] = [];
  const queue = [root, ...Object.keys(agreed)];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.includes(id) || !ok(id)) continue;
    out.push(id);
    for (const card of Object.values(ws.boards[id].cards)) {
      // A card that came with the data: only boards in the data count (they are queued already).
      if (card.kind === 'board' && !came.has(cardKey(card.id, card.boardId))) queue.push(card.boardId);
    }
  }
  return out;
}

const cardKey = (cardId: string, boardId: string) => `${cardId}>${boardId}`;

/** Every board card in `boards`, as "card>board it opens" (see groupBoardIds). */
export function boardCardKeys(boards: Record<string, Board>): Set<string> {
  const out = new Set<string>();
  for (const b of Object.values(boards)) for (const c of Object.values(b.cards)) if (c.kind === 'board') out.add(cardKey(c.id, c.boardId));
  return out;
}

/**
 * Boards in a share's data (`incoming`) that have the id of a board here that isn't one of the
 * share's (`held`): taking them would replace one of this person's own boards.
 */
export function clashingBoards(ws: Workspace, incoming: Record<string, Board>, held: string[]): string[] {
  return Object.keys(incoming).filter((id) => (ws.boards[id] || id === ws.home) && !held.includes(id));
}

/** The shared boards as saved online: the same shape as a person's boards, with the shared board as "home". */
export function serializeShare(root: string, boards: Record<string, Board>): string {
  const sorted = Object.fromEntries(Object.keys(boards).sort().map((id) => [id, boards[id]]));
  return serializeWorkspace({ home: root, boards: sorted });
}

export function readShare(raw: string | null): { root: string; boards: Record<string, Board> } | null {
  const got = readWorkspace(raw);
  if (!got || got.legacy) return null;
  return { root: got.ws.home, boards: got.ws.boards };
}

/** Share ids and link keys are made of these only, so a link can't point anywhere else. */
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

/** The link that lets someone join share `id` (the page's address with ?join=id.key). */
export function joinLink(page: string, id: string, key: string): string {
  const url = new URL(page);
  url.search = '';
  url.hash = '';
  return `${url.href}?join=${id}.${key}`;
}

/** The share a page address asks to join, if any (its ?join= part). */
export function parseJoin(search: string): { id: string; key: string } | null {
  const value = new URLSearchParams(search).get('join');
  if (!value) return null;
  const [id, key, ...rest] = value.split('.');
  if (rest.length || !id || !key || !SAFE.test(id) || !SAFE.test(key)) return null;
  return { id, key };
}

/** A new random id or link key. */
export function randomKey(length = 20): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
