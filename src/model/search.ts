import { sections } from './checklist';
import type { Board, Card, TodoItem } from './types';

// Search (owner request): find text anywhere on the board, in board order, so the screen can go
// to each match in turn and mark it.

/** One place the search text was found. */
export interface Match {
  /** Which text box: column:<id>, title:<card>, note:<card>, url:<card>, item:<card>:<item>, done:<card>:<item>. */
  key: string;
  start: number;
  end: number;
  /** The card or column to show when the box itself is out of sight (collapsed, or in a closed Completed section). */
  showInstead: string | null;
}

/** Where `query` appears in `text`, ignoring upper / lower case and spaces around the query. */
export function rangesIn(text: string, query: string): [number, number][] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const lower = text.toLowerCase();
  // Lower-casing a few rare letters changes the length; then match exactly as typed instead.
  const hay = lower.length === text.length ? lower : text;
  const needle = lower.length === text.length ? q : query.trim();
  const found: [number, number][] = [];
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) found.push([at, at + needle.length]);
  return found;
}

/** Text boxes on the board, in board order: columns left to right (their cards top to bottom), then loose cards top to bottom. */
function boxes(board: Board): { key: string; text: string; showInstead: string | null }[] {
  const out: { key: string; text: string; showInstead: string | null }[] = [];
  const items = (card: Card, list: TodoItem[], hidden: string | null, prefix: 'item' | 'done') => {
    for (const it of list) {
      out.push({ key: `${prefix}:${card.id}:${it.id}`, text: it.text, showInstead: hidden });
      items(card, it.children, hidden, prefix);
    }
  };
  const cardBoxes = (card: Card, hiddenBy: string | null) => {
    const hidden = hiddenBy ?? (card.collapsed ? card.id : null);
    switch (card.kind) {
      case 'note':
        out.push({ key: `note:${card.id}`, text: card.text, showInstead: hidden });
        break;
      case 'link':
        out.push({ key: `title:${card.id}`, text: card.title, showInstead: hidden });
        out.push({ key: `url:${card.id}`, text: card.url, showInstead: hidden });
        break;
      case 'todo': {
        out.push({ key: `title:${card.id}`, text: card.title, showInstead: hidden });
        const { open, done } = sections(card.items);
        items(card, open, hidden, 'item');
        items(card, done, hidden ?? (card.completedOpen ? null : card.id), 'item');
        break;
      }
      case 'completed':
        for (const g of card.groups) for (const e of g.entries) items(card, [e.item], hidden, 'done');
        break;
    }
  };
  const byPlace = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x - b.x || a.y - b.y;
  const columns = board.order.filter((id) => board.columns[id]).sort((a, b) => byPlace(board.columns[a], board.columns[b]));
  for (const id of columns) {
    const col = board.columns[id];
    out.push({ key: `column:${id}`, text: col.title, showInstead: null });
    for (const cardId of col.cardIds) if (board.cards[cardId]) cardBoxes(board.cards[cardId], col.collapsed ? id : null);
  }
  const loose = board.order.filter((id) => board.cards[id]).sort((a, b) => board.cards[a].y - board.cards[b].y || board.cards[a].x - board.cards[b].x);
  for (const id of loose) cardBoxes(board.cards[id], null);
  return out;
}

/** Every place `query` is found on the board, in board order. */
export function findMatches(board: Board, query: string): Match[] {
  return boxes(board).flatMap((b) => rangesIn(b.text, query).map(([start, end]) => ({ key: b.key, start, end, showInstead: b.showInstead })));
}
