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
const HEADING = /^(#{1,6})(?:\s+(.*))?$/;

/** A heading's title: closing #s only count after a space ("## Learn C#" keeps its #); a bare "##" has an empty title. Plain string work: a backtracking regex here is quadratic on long lines. */
function headingTitle(rest = ''): string {
  const t = rest.trimEnd();
  let j = t.length;
  while (j > 0 && t[j - 1] === '#') j--;
  return j > 0 && j < t.length && /\s/.test(t[j - 1]) ? t.slice(0, j).trimEnd() : t;
}

/**
 * Drops paired ** / __ / ~~ marks on one line: an opener (not escaped, a non-space after it) and the
 * next mark of its kind that has a non-space before it. Written by hand because the regex for it is
 * quadratic on a long line of stray marks; here a failed search for a closer rules out every later
 * opener of that kind, so the line is read once.
 */
function unmark(line: string): string {
  const noCloser = new Set<string>();
  let out = '';
  let i = 0;
  while (i < line.length) {
    const mark = line.slice(i, i + 2);
    if ((mark === '**' || mark === '__' || mark === '~~') && line[i - 1] !== '\\' && /\S/.test(line[i + 2] ?? '') && !noCloser.has(mark)) {
      let j = line.indexOf(mark, i + 3);
      while (j !== -1 && /\s/.test(line[j - 1])) j = line.indexOf(mark, j + 1);
      if (j !== -1) {
        out += line.slice(i + 2, j);
        i = j + 2;
        continue;
      }
      noCloser.add(mark);
    }
    out += line[i++];
  }
  return out;
}

/** For each position, the first index at or after it holding a character `hit` accepts (the length if none): one pass, so the scans below never read a stretch twice. */
function firstFrom(s: string, hit: RegExp): Int32Array {
  const at = new Int32Array(s.length + 1).fill(s.length);
  for (let i = s.length - 1; i >= 0; i--) at[i] = hit.test(s[i]) ? i : at[i + 1];
  return at;
}

/** "<https://…>" → "https://…". Hand-scanned like `unmark`: the regex is quadratic on a long run of stray "<". */
function unangle(s: string): string {
  if (!s.includes('<')) return s;
  const stop = firstFrom(s, /[>\s]/);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const from = s[i] === '<' ? (s.startsWith('https://', i + 1) ? i + 9 : s.startsWith('http://', i + 1) ? i + 8 : -1) : -1; // first character after "://"
    if (from > 0 && stop[from] > from && s[stop[from]] === '>') {
      out += s.slice(i + 1, stop[from]);
      i = stop[from] + 1;
    } else out += s[i++];
  }
  return out;
}

/** "[text](address)" → "address" (no text, or the same) or "text (address)". Hand-scanned like `unmark`: the regex is quadratic on a long run of stray "[". */
function unlink(s: string): string {
  if (!s.includes('[')) return s;
  const closeBracket = firstFrom(s, /]/);
  const endOfAddress = firstFrom(s, /[)\s]/);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const close = s[i] === '[' && s[i - 1] !== '\\' ? closeBracket[i + 1] : -1;
    const from = close + 2; // the address starts after "]("
    const end = close >= 0 && s[close + 1] === '(' ? endOfAddress[from] : -1;
    if (end > from && s[end] === ')') {
      const text = s.slice(i + 1, close);
      const url = s.slice(from, end);
      out += !text || text === url ? url : `${text} (${url})`;
      i = end + 1;
    } else out += s[i++];
  }
  return out;
}

/** Markdown inline marks and escapes → plain text. Links keep their address in brackets. */
export function plainText(s: string): string {
  return unlink(unangle(s))
    .split('\n')
    .map(unmark)
    .join('\n')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~<])/g, '$1');
}

/** Text from another kind of file (HTML, PDF) must not be read as Markdown: escapes what the reader would act on. */
export const escapeMarkdown = (s: string) => s.replace(/[\\`*_{}[\]()#+\-.!|~]/g, '\\$&');

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
      if (!isBoardName) title = plainText(headingTitle(heading[2]));
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
const IMPORT_LANES = 4;
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
