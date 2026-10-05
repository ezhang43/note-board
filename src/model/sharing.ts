import type { Board } from './types';
import { boardLinks, readWorkspace, serializeWorkspace, type Workspace } from './workspace';

// Sharing a board (owner request, 2026-10-05): a shared board takes every board inside it along, and
// is saved online apart from its owner's other boards, so everyone it is shared with can edit it.

/**
 * The boards that go with shared board `root`: itself, the boards it had before (`known`, still
 * here), and every board inside any of them, however deep. Never the home board, nor a board in
 * `taken` (held by another share).
 */
export function groupBoardIds(ws: Workspace, root: string, known: string[], taken: Set<string>): string[] {
  if (!ws.boards[root] || root === ws.home || taken.has(root)) return [];
  const out: string[] = [];
  const queue = [root, ...known];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.includes(id) || !ws.boards[id] || id === ws.home || taken.has(id)) continue;
    out.push(id);
    queue.push(...boardLinks(ws.boards[id]));
  }
  return out;
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
