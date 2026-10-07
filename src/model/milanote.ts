import { addCard } from './board';
import { createCard, createItem, newId, type MakeId } from './cards';
import { MAX_DEPTH } from './checklist';
import { CARD_W, GRID, NEW_BLOCK_H } from './constants';
import { snapToGrid } from './geometry';
import type { Board, Card, Point, TodoItem } from './types';

// Reading a board exported from Milanote as Markdown ("linear document").
// The export has no positions, sizes or colours, so cards come out in reading order and are laid
// out in a few side-by-side lanes. Rules (owner's answers, 2 Oct 2026):
// - A heading (## …) starts a to-do list with that title; a heading with nothing under it is an
//   empty list. The "# Board name" line at the very top is skipped (imports add to this board).
// - Checklist lines (- [ ] / - [x], indented for sub-items) are the list's items. A blank line
//   between items starts a new list with no title.
// - Any other text becomes a note; text that is only a web address becomes a link card (titled
//   by a heading right above it).

const ITEM = /^(\s*)[-*+]\s+\[([ xX])\](?:\s+(.*))?$/;
// A plain bullet or numbered line ("- a", "* a", "1. a"): an item when right under a heading or
// inside a list (other Markdown apps, owner 2026-10-06); otherwise part of a note.
const BULLET = /^(\s*)(?:[-*+]|\d{1,3}[.)])\s+(.*)$/;
// Closing #s only count after a space ("## Learn C#" keeps its #); a bare "##" has an empty title.
const HEADING = /^(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/;

/** Markdown inline marks and escapes → plain text. Links keep their address in brackets. */
export function plainText(s: string): string {
  return s
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/(?<!\\)\[([^\]]*)\]\(([^)\s]+)\)/g, (_, text: string, url: string) => (!text || text === url ? url : `${text} (${url})`))
    .replace(/(?<!\\)(\*\*|__|~~)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~<])/g, '$1');
}

/** A note's text is only a web address (bare, <…> or [title](…)): it becomes a link card. */
function asLink(text: string): { title: string; url: string } | null {
  const t = text.trim();
  let m = /^<?(https?:\/\/\S+?)>?$/.exec(t);
  if (m) return { title: '', url: m[1] };
  m = /^\[((?:\\.|[^\]\\])*)\]\((https?:\/\/[^)\s]+)\)$/.exec(t); // escaped [ ] allowed in the title
  if (m) return { title: m[1] === m[2] ? '' : plainText(m[1]), url: m[2] };
  return null;
}

/**
 * Turns a Milanote Markdown export (or any Markdown) into cards, in reading order. Positions are
 * all 0,0; `packInLanes` lays them out. `splitNotes`: a blank line ends a note (plain text and
 * HTML imports) instead of separating its paragraphs.
 */
export function parseMilanote(markdown: string, makeId: MakeId = newId, { splitNotes = false } = {}): Card[] {
  const lines = markdown.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const cards: Card[] = [];
  let title: string | null = null; // heading waiting for its list
  let list: TodoItem[] | null = null; // items of the list being read
  let listTitle = '';
  let text: string[] = []; // lines of the note being read
  let textTitle: string | null = null; // heading right above the note
  let indents: number[] = []; // indent of each open level, for nesting
  let parents: TodoItem[] = []; // last item at each level

  const flushList = () => {
    if (list) {
      const card = createCard('todo', makeId('k'));
      if (card.kind === 'todo') cards.push({ ...card, title: listTitle, items: list });
    }
    list = null;
  };
  const flushText = () => {
    const body = text.join('\n').replace(/^\n+|\n+$/g, '');
    const heading = textTitle;
    text = [];
    textTitle = null;
    if (!body.trim()) return;
    const link = asLink(body);
    const card = createCard(link ? 'link' : 'note', makeId('k'));
    if (card.kind === 'link' && link) cards.push({ ...card, ...link, title: heading ?? link.title });
    else if (card.kind === 'note') {
      const paras = body.split('\n').map(plainText);
      cards.push({ ...card, text: (heading === null ? paras : [heading, ...paras]).join('\n') });
    }
  };
  const flushTitle = () => {
    if (title === null) return;
    const card = createCard('todo', makeId('k'));
    if (card.kind === 'todo') cards.push({ ...card, title, items: [createItem(makeId('i'))] });
    title = null;
  };

  let first = true;
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '    ');
    const heading = HEADING.exec(line);
    if (heading) {
      flushList();
      flushText();
      flushTitle();
      const isBoardName = first && heading[1] === '#';
      if (!isBoardName) title = plainText(heading[2] ?? '');
      first = false;
      continue;
    }
    if (line.trim()) first = false;

    const ticked = ITEM.exec(line);
    const bullet = !ticked && (list || (title !== null && !text.length)) ? BULLET.exec(line) : null;
    const item = ticked ?? (bullet && [bullet[0], bullet[1], ' ', bullet[2]]);
    if (item) {
      flushText();
      if (!list) {
        list = [];
        listTitle = title ?? '';
        title = null;
        indents = [];
        parents = [];
      }
      const indent = item[1].length;
      while (indents.length && indents[indents.length - 1] > indent) indents.pop();
      if (!indents.length || indents[indents.length - 1] < indent) indents.push(indent);
      const depth = Math.min(indents.length - 1, MAX_DEPTH, parents.length);
      const it: TodoItem = { ...createItem(makeId('i')), text: plainText((item[3] ?? '').trim()), done: item[2] !== ' ' };
      (depth === 0 ? list : parents[depth - 1].children).push(it);
      parents = [...parents.slice(0, depth), it];
      continue;
    }

    if (!line.trim()) {
      // A blank line ends a list (more items after it make a new, untitled list); inside a note it
      // separates paragraphs.
      flushList();
      if (splitNotes) flushText();
      else if (text.length) text.push('');
      continue;
    }

    // Plain text: ends any list. A heading right above it starts the note (or titles the link).
    flushList();
    if (title !== null && !text.length) {
      textTitle = title;
      title = null;
    }
    text.push(line.replace(/\s+$/, '').replace(/\\$/, ''));
  }
  flushList();
  flushText();
  flushTitle();
  return cards;
}

/** Rough drawn height of a card before it has been measured, so the first layout is close. */
export function estimateHeight(card: Card): number {
  const lines = (s: string, perLine: number) => Math.max(1, Math.ceil(s.length / perLine));
  switch (card.kind) {
    case 'note':
      return snapToGrid(40 + card.text.split('\n').reduce((n, p) => n + lines(p, 30), 0) * 22 + GRID / 2);
    case 'link':
    case 'completed':
    case 'board':
      return NEW_BLOCK_H[card.kind];
    case 'todo': {
      const rows = (items: TodoItem[], depth: number): number =>
        items.reduce((n, it) => n + 30 + (lines(it.text, Math.max(10, 24 - depth * 3)) - 1) * 20 + rows(it.children, depth + 1), 0);
      const done = card.items.some((it) => it.done) ? 36 : 0;
      return snapToGrid(64 + rows(card.items, 0) + done + GRID / 2);
    }
  }
}

/** How many lanes imported cards are laid out in. */
export const IMPORT_LANES = 4;
/** Space between imported cards, side by side and one under another. */
export const IMPORT_GAP = GRID;

/**
 * Lays cards out in up to 4 lanes from `origin` (top-left): each card, in order, goes at the
 * bottom of the shortest lane. Returns each card's spot and the size of the whole group.
 */
export function packInLanes(
  ids: string[],
  heightOf: (id: string) => number,
  origin: Point,
): { spots: Record<string, Point>; w: number; h: number } {
  const lanes = Math.max(1, Math.min(IMPORT_LANES, ids.length));
  const bottoms: number[] = new Array(lanes).fill(0);
  const spots: Record<string, Point> = {};
  for (const id of ids) {
    const lane = bottoms.indexOf(Math.min(...bottoms));
    spots[id] = { x: origin.x + lane * (CARD_W + IMPORT_GAP), y: origin.y + bottoms[lane] };
    bottoms[lane] += snapToGrid(Math.max(GRID, heightOf(id))) + IMPORT_GAP;
  }
  return { spots, w: lanes * (CARD_W + IMPORT_GAP) - IMPORT_GAP, h: Math.max(0, Math.max(...bottoms) - IMPORT_GAP) };
}

/** Moves the listed loose cards to the given spots. */
export function placeCards(board: Board, spots: Record<string, Point>): Board {
  const cards = { ...board.cards };
  let changed = false;
  for (const [id, p] of Object.entries(spots)) {
    const c = cards[id];
    if (!c || (c.x === p.x && c.y === p.y)) continue;
    cards[id] = { ...c, ...p };
    changed = true;
  }
  return changed ? { ...board, cards } : board;
}

/** Adds imported cards loose on the board at their spots, in order. */
export function addImported(board: Board, cards: Card[], spots: Record<string, Point>): Board {
  return cards.reduce((b, c) => addCard(b, c, { type: 'loose', ...(spots[c.id] ?? { x: c.x, y: c.y }) }), board);
}
