import { isDeepStrictEqual } from 'node:util';
import { shownName } from '../src/model/board';
import { hrefOf } from '../src/model/cards';
import { sections } from '../src/model/checklist';
import { readShare } from '../src/model/sharing';
import type { Board, Card, TodoItem } from '../src/model/types';
import { boardTree, pathTo, readWorkspace, serializeWorkspace, type Workspace } from '../src/model/workspace';

// The connector's view of a person's boards (pure: no network). What Firestore holds is read in
// firestore.ts; here it becomes the board list, a board's outline, and the "safe to edit" check.

/** Everything read online for one person: their own boards' saved data, and the shares they have. */
export interface Snapshot {
  /** boards/{uid}.data, or null when nothing is saved online yet. */
  own: string | null;
  shares: { id: string; owner: string; ownerName: string; mine: boolean; raw: string }[];
}

export interface BoardEntry {
  id: string;
  name: string;
  board: Board;
  home: boolean;
  /** Who shared it ("you" for a board this person shared), or null for one of their own boards. */
  sharedBy: string | null;
  /** The board whose board card opens it, if any. */
  parent: string | null;
}

export interface Collected {
  entries: BoardEntry[];
  /** True when own data is saved online but can't be read (damaged, or from a newer app). */
  ownUnreadable: boolean;
}

/** Own boards (home first, in the Boards menu's order), then each share's boards. */
export function collectBoards(snap: Snapshot): Collected {
  const own = snap.own == null ? null : readWorkspace(snap.own);
  const ws: Workspace = { home: own?.ws.home ?? '', boards: { ...own?.ws.boards } };
  const sharedBy: Record<string, string> = {};
  let firstRoot: string | undefined;
  for (const s of snap.shares) {
    const share = readShare(s.raw);
    if (!share) continue;
    if (!ws.boards[share.root]) firstRoot ??= share.root;
    for (const [id, board] of Object.entries(share.boards)) {
      // A board with the id of one already listed is left out (as the app does).
      if (ws.boards[id]) continue;
      ws.boards[id] = board;
      sharedBy[id] = s.mine ? 'you' : s.ownerName;
    }
  }
  // The Boards menu's order over all of them together, so a shared board opened from an own board
  // is "inside" it. With no own boards, the first share's board goes first.
  const all: Workspace = { home: own ? ws.home : (firstRoot ?? ''), boards: ws.boards };
  const isShared = (id: string) => (sharedBy[id] === undefined ? 0 : 1);
  const entries = (all.home ? boardTree(all) : [])
    .map((r) => r.id)
    .sort((a, b) => isShared(a) - isShared(b))
    .map((id): BoardEntry => {
      const path = pathTo(all, id);
      return { id, name: ws.boards[id].name, board: ws.boards[id], home: Boolean(own) && id === ws.home, sharedBy: sharedBy[id] ?? null, parent: path.length > 1 ? path[path.length - 2] : null };
    });
  return { entries, ownUnreadable: snap.own != null && !own };
}

function tags(e: BoardEntry): string {
  if (e.home) return ' [home board]';
  if (e.sharedBy) return ` [shared by ${e.sharedBy}, read-only]`;
  return '';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function openCount(items: TodoItem[]): number {
  return items.reduce((n, it) => n + (it.done ? 0 : 1) + openCount(it.children), 0);
}

function counts(b: Board): string {
  const cards = Object.values(b.cards);
  const open = cards.reduce((n, c) => n + (c.kind === 'todo' ? openCount(c.items) : 0), 0);
  return `${plural(Object.keys(b.columns).length, 'column')}, ${plural(cards.length, 'card')}, ${plural(open, 'open item')}`;
}

/** The list_boards answer. */
export function listBoardsText(got: Collected): string {
  const lines: string[] = [];
  if (got.ownUnreadable) lines.push('Your own boards couldn’t be read (the saved data is damaged or from a newer version of the app).');
  if (!got.entries.length) {
    if (!got.ownUnreadable) lines.push('No boards saved online yet. Open BusyAnts, sign in, and add something.');
    return lines.join('\n');
  }
  const nameOf = (id: string) => shownName(got.entries.find((e) => e.id === id)?.name ?? '');
  for (const e of got.entries) {
    const inside = e.parent ? ` inside ${nameOf(e.parent)}` : '';
    lines.push(`- ${shownName(e.name)} (id: ${e.id})${inside}${tags(e)} — ${counts(e.board)}`);
  }
  return lines.join('\n');
}

const norm = (s: string) => s.trim().toLowerCase();

/** A board named by its id, or by its name when only one board has it. */
export function findBoard(entries: BoardEntry[], query: string): { entry: BoardEntry } | { error: string } {
  const byId = entries.find((e) => e.id === query.trim());
  if (byId) return { entry: byId };
  const named = entries.filter((e) => norm(shownName(e.name)) === norm(query));
  if (named.length === 1) return { entry: named[0] };
  const choices = (list: BoardEntry[]) => list.map((e) => `- ${shownName(e.name)} (id: ${e.id})`).join('\n');
  if (named.length > 1) return { error: `${named.length} boards are called "${shownName(named[0].name)}". Say which by id:\n${choices(named)}` };
  return { error: `No board called "${query.trim()}". The boards are:\n${choices(entries)}` };
}

function itemLines(items: TodoItem[], depth = 0): string[] {
  return items.flatMap((it) => [
    `${'  '.repeat(depth)}- [${it.done ? 'x' : ' '}] ${it.text} (id: ${it.id})${it.due ? ` (due ${it.due})` : ''}`,
    ...itemLines(it.children, depth + 1),
  ]);
}

function cardLines(card: Card, nameOf: (boardId: string) => string | null): string[] {
  switch (card.kind) {
    case 'todo': {
      const { open, done } = sections(card.items);
      return [`### Checklist: ${card.title.trim() || 'Untitled list'} (id: ${card.id})`, ...itemLines(open), ...(done.length ? ['Completed:', ...itemLines(done)] : [])];
    }
    case 'note':
      return [`### Note (id: ${card.id})`, ...(card.text.trim() ? card.text.split('\n').map((l) => `> ${l}`) : ['(empty)'])];
    case 'link':
      return [`### Link: ${card.title.trim() || 'Untitled link'} (id: ${card.id})${hrefOf(card.url) ? ` ${hrefOf(card.url)}` : ''}`];
    case 'board': {
      const name = nameOf(card.boardId);
      return [`### Board card: ${name == null ? '(a board that can’t be opened)' : shownName(name)} (id: ${card.id}, opens board id: ${card.boardId})`];
    }
    case 'completed':
      return [
        `### Completed card (id: ${card.id})`,
        ...card.groups.flatMap((g) => [`#### ${g.date}`, ...g.entries.flatMap((e) => itemLines([e.item]).map((l, i) => (i === 0 && e.fromTitle ? `${l} (from ${e.fromTitle})` : l)))]),
      ];
  }
}

/** The read_board answer: columns left to right with their cards top to bottom, then loose cards top to bottom. */
export function boardOutline(got: Collected, e: BoardEntry): string {
  const b = e.board;
  const nameOf = (id: string) => got.entries.find((x) => x.id === id)?.name ?? null;
  const out = [`# ${shownName(e.name)} (id: ${e.id})${tags(e)}`];
  const columns = b.order.filter((id) => b.columns[id]).sort((x, y) => b.columns[x].x - b.columns[y].x || b.columns[x].y - b.columns[y].y);
  for (const id of columns) {
    const col = b.columns[id];
    out.push('', `## Column: ${col.title.trim() || 'Untitled column'} (id: ${col.id})`);
    for (const cardId of col.cardIds) if (b.cards[cardId]) out.push('', ...cardLines(b.cards[cardId], nameOf));
  }
  const loose = b.order.filter((id) => b.cards[id]).sort((x, y) => b.cards[x].y - b.cards[y].y || b.cards[x].x - b.cards[y].x);
  if (loose.length) {
    out.push('', '## Loose cards');
    for (const id of loose) out.push('', ...cardLines(b.cards[id], nameOf));
  }
  if (!columns.length && !loose.length) out.push('', '(This board is empty.)');
  return out.join('\n');
}

/**
 * Whether saved data can be changed by this connector without losing anything: it must read as a
 * workspace and write back exactly as it was. Data from a newer app (fields this code doesn't
 * know) or an old single board is read-only.
 */
export function safeToEdit(raw: string | null): { ok: true } | { ok: false; reason: string } {
  if (raw == null) return { ok: false, reason: 'nothing is saved online yet' };
  const got = readWorkspace(raw);
  if (!got) return { ok: false, reason: 'the saved boards can’t be read (damaged, or from a newer version of the app)' };
  if (got.legacy) return { ok: false, reason: 'the boards were saved by an older version of the app; open BusyAnts once to update them' };
  if (!isDeepStrictEqual(JSON.parse(serializeWorkspace(got.ws)), JSON.parse(raw))) {
    return { ok: false, reason: 'the boards hold data this connector doesn’t know (saved by a newer version of the app?)' };
  }
  return { ok: true };
}
