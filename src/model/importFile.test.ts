// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CANT_READ, htmlToMarkdown, IMPORT_MAX_BYTES, IMPORT_MAX_CARDS, IMPORT_MAX_ITEMS, readImport, TOO_BIG, TOO_LONG } from './importFile';
import { parseMilanote } from './milanote';
import type { Card, TodoCard, TodoItem } from './types';

let n = 0;
const makeId = (p: string) => `${p}${++n}`;
const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const read = (name: string, text: string) => readImport(name, text, parseHtml, makeId);
const todo = (c: Card) => c as TodoCard;
const outline = (items: TodoItem[]): unknown[] =>
  items.map((it) => (it.children.length ? [`${it.done ? '[x] ' : ''}${it.text}`, outline(it.children)] : `${it.done ? '[x] ' : ''}${it.text}`));
/** Each card as [kind, title or note text]. */
const summary = (cards: Card[]) =>
  cards.map((c) => [c.kind, c.kind === 'note' ? c.text : c.kind === 'link' ? `${c.title} ${c.url}` : c.kind === 'todo' ? c.title : '']);
/** Cards without ids, to compare two imports. */
const shape = (cards: Card[]) => JSON.parse(JSON.stringify(cards).replace(/"(id|k|i)\d+"/g, '"x"'));

const sample = readFileSync('e2e/fixtures/milanote-sample.md', 'utf8') // happy-dom: import.meta.url isn't a file;

describe('readImport: Milanote exports', () => {
  it('reads a Milanote .md export exactly as before', () => {
    const { cards, note } = read('Sample board.md', sample);
    expect(note).toBe('');
    expect(shape(cards)).toEqual(shape(parseMilanote(sample, makeId)));
    expect(cards).toHaveLength(7);
  });
});

describe('readImport: Markdown and text', () => {
  it('reads an Obsidian-style note: headings, tasks with nesting and ticks, text and links', () => {
    const md = [
      '---',
      'tags: [home]',
      '---',
      '## Errands',
      '- [ ] Post office',
      '\t- [x] Buy stamps',
      '* [x] Bank',
      '',
      'Remember to call **Sam**.',
      '',
      '## Link',
      'https://obsidian.md',
    ].join('\n');
    const cards = read('Errands.md', md).cards;
    expect(summary(cards)).toEqual([
      ['todo', 'Errands'],
      ['note', 'Remember to call Sam.'],
      ['link', 'Link https://obsidian.md'],
    ]);
    expect(outline(todo(cards[0]).items)).toEqual([['Post office', ['[x] Buy stamps']], '[x] Bank']);
  });

  it('turns plain bullet and numbered lists under a heading into checklist items', () => {
    const cards = read('Plan.md', '## Packing\n- Socks\n  - Wool\n* Hat\n\n## Steps\n1. Book\n2) Pack').cards;
    expect(summary(cards)).toEqual([
      ['todo', 'Packing'],
      ['todo', 'Steps'],
    ]);
    expect(outline(todo(cards[0]).items)).toEqual([['Socks', ['Wool']], 'Hat']);
    expect(outline(todo(cards[1]).items)).toEqual(['Book', 'Pack']);
  });

  it('keeps bullets inside ordinary text as part of the note', () => {
    const cards = read('n.md', 'Shopping thoughts:\n- maybe bread').cards;
    expect(summary(cards)).toEqual([['note', 'Shopping thoughts:\n- maybe bread']]);
  });

  it('reads a .txt file with no Markdown as notes split on blank lines', () => {
    const cards = read('notes.txt', 'First idea\nstill first\n\n\nSecond idea\n\nhttps://example.com/x\r\n').cards;
    expect(summary(cards)).toEqual([
      ['note', 'First idea\nstill first'],
      ['note', 'Second idea'],
      ['link', ' https://example.com/x'],
    ]);
  });

  it('reads a .txt file that has Markdown in it as Markdown', () => {
    const cards = read('todo.txt', '## Today\n- [ ] Run').cards;
    expect(summary(cards)).toEqual([['todo', 'Today']]);
  });

  it('a dashed line alone doesn’t make a .txt file Markdown (review fix)', () => {
    expect(read('t.txt', 'Buy milk\n\nRing bank\n\n- eggs').cards).toHaveLength(3);
  });

  it('adds nothing from an empty file', () => {
    expect(read('empty.md', '').cards).toEqual([]);
    expect(read('empty.txt', '\n \n').cards).toEqual([]);
    expect(read('empty.html', '<html><body></body></html>').cards).toEqual([]);
  });
});

describe('readImport: HTML', () => {
  const page = `<!doctype html><html><head><title>Saved</title><style>p { color: red }</style>
    <script>document.title = 'hacked'</script></head>
    <body><nav><a href="/">Home</a> Menu</nav>
    <h1>Trip</h1>
    <ul>
      <li><input type="checkbox" checked> Passport</li>
      <li>Clothes
        <ol><li><input type="checkbox"> Socks</li><li>Hat <b>warm</b></li></ol>
      </li>
    </ul>
    <!-- a comment -->
    <p>Hotel is <a href="https://hotel.test/">near the beach</a>.</p>
    <p>Second   paragraph<br>with a break</p>
    <p><a href="https://maps.test/x">Map</a></p>
    <p># not a heading - [ ] not an item **not bold**</p>
    <script>alert(1)</script>
    </body></html>`;

  it('makes headings titles, lists items with nesting and ticks, paragraphs notes, link-only paragraphs links', () => {
    const cards = read('trip.html', page).cards;
    expect(summary(cards)).toEqual([
      ['todo', 'Trip'],
      ['note', 'Hotel is near the beach (https://hotel.test/).'],
      ['note', 'Second paragraph\nwith a break'],
      ['link', 'Map https://maps.test/x'],
      ['note', '# not a heading - [ ] not an item **not bold**'],
    ]);
    expect(outline(todo(cards[0]).items)).toEqual(['[x] Passport', ['Clothes', ['Socks', 'Hat warm']]]);
  });

  it('ignores scripts, styles, nav, head and comments', () => {
    const md = htmlToMarkdown(parseHtml(page));
    expect(md).not.toMatch(/hacked|alert|color|Menu|Saved|comment/);
  });

  it('works out HTML from the content when the name does not say', () => {
    expect(summary(read('page', '<!DOCTYPE html><h2>Hi</h2><ul><li>a</li></ul>').cards)).toEqual([['todo', 'Hi']]);
  });

  it('adds a link’s address once, however its text is formatted (review fix)', () => {
    const html = `<p>Stay <a href="https://x.test">near the <b>beach</b></a></p>
      <p><a href="https://maps.test">
        <span>Map</span> </a></p>
      <p><a href="https://d.test">[draft] plan</a></p>
      <p>&lt;https://raw.test&gt;</p>`;
    expect(summary(read('a.html', html).cards)).toEqual([
      ['note', 'Stay near the beach (https://x.test)'],
      ['link', 'Map https://maps.test'],
      ['link', '[draft] plan https://d.test'],
      ['link', ' https://raw.test'],
    ]);
  });

  it('keeps words apart across blocks and cells, and skips empty headings (review fix)', () => {
    const html = '<h1><img src="logo.png"></h1><h2>List</h2><ul><li><p>Buy</p><p>milk</p></li></ul><table><tr><td>Name</td><td>Age</td></tr></table>';
    const cards = read('a.html', html).cards;
    expect(summary(cards)).toEqual([
      ['todo', 'List'],
      ['note', 'Name Age'],
    ]);
    expect(outline(todo(cards[0]).items)).toEqual(['Buy milk']);
  });

  it('turns a heading with a paragraph under it into a note that starts with the heading', () => {
    expect(summary(read('a.htm', '<h3>Idea</h3><p>Think</p>').cards)).toEqual([['note', 'Idea\nThink']]);
  });
});

describe('readImport: files it cannot read, and limits', () => {
  it('says it can’t read other kinds of file, or binary content', () => {
    expect(read('report.pdf', '%PDF-1.7 ...')).toEqual({ cards: [], note: CANT_READ });
    expect(read('photo.md', 'abc\u0000def')).toEqual({ cards: [], note: CANT_READ });
    expect(CANT_READ).toBe('BusyAnts can’t read that file yet.');
  });

  it('refuses a file over 5 MB', () => {
    expect(IMPORT_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(read('big.txt', 'a'.repeat(IMPORT_MAX_BYTES + 1))).toEqual({ cards: [], note: TOO_BIG });
  });

  it('adds at most the first 300 cards, and says so', () => {
    const { cards, note } = read('many.txt', Array.from({ length: IMPORT_MAX_CARDS + 5 }, (_, i) => `note ${i}`).join('\n\n'));
    expect(IMPORT_MAX_CARDS).toBe(300);
    expect(cards).toHaveLength(IMPORT_MAX_CARDS);
    expect(note).toBe(TOO_LONG);
  });

  it('adds at most 2000 checklist items in all, cutting the list that goes over', () => {
    const md = `## Big\n${Array.from({ length: IMPORT_MAX_ITEMS + 10 }, (_, i) => `- [ ] item ${i}\n  - [ ] sub ${i}`).join('\n')}\n\n## After\n- [ ] x`;
    const { cards, note } = read('big.md', md);
    expect(IMPORT_MAX_ITEMS).toBe(2000);
    const count = (items: TodoItem[]): number => items.reduce((s, it) => s + 1 + count(it.children), 0);
    expect(cards).toHaveLength(1);
    expect(count(todo(cards[0]).items)).toBe(IMPORT_MAX_ITEMS);
    expect(note).toBe(TOO_LONG);
  });
});
