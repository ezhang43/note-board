import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBoard, problems } from './board';
import { CARD_W } from './constants';
import { addImported, estimateHeight, IMPORT_GAP, packInLanes, parseMilanote, plainText } from './milanote';
import type { Card, TodoCard, TodoItem } from './types';

let n = 0;
const makeId = (p: string) => `${p}${++n}`;
const parse = (md: string) => parseMilanote(md, makeId);
const todo = (c: Card) => c as TodoCard;
/** Items as a readable outline: "text" or "[x] text", children nested. */
const outline = (items: TodoItem[]): unknown[] =>
  items.map((it) => (it.children.length ? [`${it.done ? '[x] ' : ''}${it.text}`, outline(it.children)] : `${it.done ? '[x] ' : ''}${it.text}`));

const sample = readFileSync(new URL('../../e2e/fixtures/milanote-sample.md', import.meta.url), 'utf8');

describe('parseMilanote', () => {
  it('reads the sample export into cards in reading order', () => {
    const cards = parse(sample);
    expect(cards.map((c) => [c.kind, c.kind === 'note' ? c.text.split('\n')[0] : c.kind === 'completed' ? '' : c.title])).toEqual([
      ['todo', 'Follow Up'],
      ['todo', 'Groceries'],
      ['todo', 'Weekend'],
      ['todo', ''],
      ['todo', 'Notes'],
      ['note', 'Dear [Name],'],
      ['link', 'Reading'],
    ]);
  });

  it('skips the board name at the top', () => {
    expect(parse('# Board\n\n## A\n- [ ] x').map((c) => todo(c).title)).toEqual(['A']);
  });

  it('turns a heading with nothing under it into an empty list with one blank item', () => {
    const [c] = parse('## Follow Up\n\n## Next\n- [ ] a');
    expect(todo(c).title).toBe('Follow Up');
    expect(outline(todo(c).items)).toEqual(['']);
  });

  it('keeps nesting and ticks', () => {
    const groceries = todo(parse(sample)[1]);
    expect(outline(groceries.items)).toEqual(['Bread', ['Fruit', ['Apples', '[x] Pears']], '[x] Milk']);
  });

  it('starts a new untitled list after a blank line between items', () => {
    const cards = parse(sample);
    expect(outline(todo(cards[2]).items)).toEqual(['Clean the bike', 'Call [someone]']);
    expect(todo(cards[3]).title).toBe('');
    expect(outline(todo(cards[3]).items)).toEqual(['Read https://example.com/article']);
  });

  it('makes text after a list a note, keeping paragraphs and removing markdown marks', () => {
    const note = parse(sample)[5];
    expect(note.kind === 'note' && note.text).toBe('Dear [Name],\n\nThis is important and it’s two paragraphs.');
  });

  it('makes a lone web address a link card', () => {
    const link = parse(sample)[6];
    expect(link.kind === 'link' && [link.title, link.url]).toEqual(['Reading', 'https://example.com']);
    const [titled] = parse('[My site](https://site.test/a)');
    expect(titled.kind === 'link' && [titled.title, titled.url]).toEqual(['My site', 'https://site.test/a']);
  });

  it('starts a note with the heading when a heading has text under it', () => {
    const [c] = parse('## Idea\n\nSomething to think about');
    expect(c.kind === 'note' && c.text).toBe('Idea\nSomething to think about');
  });

  it('keeps blank items', () => {
    expect(outline(todo(parse('## insert text here\n\n\n- [ ]')[0]).items)).toEqual(['']);
  });

  it('handles tabs, 2-space indents, Windows line ends and a jump of several levels', () => {
    const [a] = parse('- [ ] a\r\n\t- [ ] b\r\n  - [ ] c\r\n- [ ] d\r\n            - [ ] e');
    expect(outline(todo(a).items)).toEqual([['a', ['b', 'c']], ['d', ['e']]]);
  });

  it('nests no deeper than 6 levels', () => {
    const md = Array.from({ length: 8 }, (_, i) => `${'    '.repeat(i)}- [ ] l${i}`).join('\n');
    let items = todo(parse(md)[0]).items;
    let depth = 0;
    while (items[0].children.length) {
      items = items[0].children;
      depth++;
    }
    expect(depth).toBe(5);
    expect(items.map((i) => i.text)).toEqual(['l5', 'l6', 'l7']);
  });

  it('finds nothing in an empty or blank file', () => {
    expect(parse('')).toEqual([]);
    expect(parse('\n\n  \n')).toEqual([]);
  });

  it('gives every card and item its own id', () => {
    const cards = parse(sample);
    const ids = cards.flatMap((c) => [c.id, ...(c.kind === 'todo' ? flat(c.items) : [])]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

const flat = (items: TodoItem[]): string[] => items.flatMap((i) => [i.id, ...flat(i.children)]);

describe('plainText', () => {
  it('unescapes and removes marks', () => {
    expect(plainText('\\[a\\] **b** ~~c~~ <https://x.test> [t](https://y.test)')).toBe('[a] b c https://x.test t (https://y.test)');
  });
  it('leaves ordinary text alone', () => {
    expect(plainText('5498 is here -- need to refile taxes; snake_case 2*3')).toBe('5498 is here -- need to refile taxes; snake_case 2*3');
  });
});

describe('packInLanes', () => {
  it('puts each card at the bottom of the shortest of 4 lanes', () => {
    const h: Record<string, number> = { a: 100, b: 300, c: 100, d: 100, e: 100, f: 100 };
    const { spots, w, h: total } = packInLanes(Object.keys(h), (id) => h[id], { x: 0, y: 0 });
    const stride = CARD_W + IMPORT_GAP;
    expect(spots).toEqual({
      a: { x: 0, y: 0 },
      b: { x: stride, y: 0 },
      c: { x: 2 * stride, y: 0 },
      d: { x: 3 * stride, y: 0 },
      e: { x: 0, y: 120 },
      f: { x: 2 * stride, y: 120 },
    });
    expect(w).toBe(4 * stride - IMPORT_GAP);
    expect(total).toBe(300);
  });

  it('uses fewer lanes for fewer cards', () => {
    expect(packInLanes(['a', 'b'], () => 100, { x: 40, y: 60 }).w).toBe(2 * CARD_W + IMPORT_GAP);
  });
});

describe('addImported', () => {
  it('adds the cards loose at their spots and keeps the board healthy', () => {
    const cards = parse(sample);
    const { spots } = packInLanes(
      cards.map((c) => c.id),
      (id) => estimateHeight(cards.find((c) => c.id === id)!),
      { x: 0, y: 0 },
    );
    const board = addImported(createBoard(), cards, spots);
    expect(board.order).toEqual(cards.map((c) => c.id));
    expect(problems(board)).toEqual([]);
    for (const c of cards) expect({ x: board.cards[c.id].x, y: board.cards[c.id].y }).toEqual(spots[c.id]);
  });
});
