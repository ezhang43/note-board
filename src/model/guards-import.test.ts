// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { boardAsMarkdown } from './exportText';
import { CANT_READ, htmlToMarkdown, IMPORT_MAX_CARDS, IMPORT_MAX_ITEMS, readImport, TOO_LONG } from './importFile';
import type { PdfText } from './importPdf';
import { parseMilanote } from './milanote';
import type { Card, LinkCard, NoteCard, TodoCard, TodoItem } from './types';

// Guards for importing and Download as text (review pass, job 156). Every test passes today.

let n = 0;
const makeId = (p: string) => `${p}${++n}`;
const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const read = (name: string, text: string) => readImport(name, text, parseHtml, makeId);
const readPdf = (pages: PdfText[][]) =>
  readImport('a.pdf', pages, () => {
    throw new Error('a PDF is never read as HTML');
  }, makeId);
const onePage = (str: string): PdfText[][] => [[{ str, x: 50, y: 700, w: str.length * 5, size: 10 }]];
const outline = (items: TodoItem[]): unknown[] =>
  items.map((it) => (it.children.length ? [`${it.done ? '[x] ' : ''}${it.text}`, outline(it.children)] : `${it.done ? '[x] ' : ''}${it.text}`));
const noteTexts = (cards: Card[]) => cards.map((c) => (c.kind === 'note' ? c.text : `<${c.kind}>`));

describe('Markdown marks in HTML and PDF text stay literal', () => {
  // Text that would turn into a heading, task, list, link and so on if it were read as Markdown.
  const literal = [
    '# not a heading',
    '## Also not',
    '- [ ] not a task',
    '- [x] not ticked',
    '* star',
    '1. one',
    '**bold** and __under__ and ~~strike~~',
    '[text](https://x.example)',
    'a\\b back\\slash',
    'pipe | table | row',
    '``` fence',
  ];

  it.each(literal)('HTML paragraph %j comes in as one note with the same text', (text) => {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    expect(noteTexts(read('p.html', `<p>${escaped}</p>`).cards)).toEqual([text]);
  });

  // A PDF line that starts like a bullet, a tick box or a number is a list item there on purpose.
  const notBullets = literal.filter((t) => !/^(- |\* |\d+\. )/.test(t));
  it.each(notBullets)('PDF line %j comes in as one note with the same text', (text) => {
    expect(noteTexts(readPdf(onePage(text)).cards)).toEqual([text]);
  });
});

describe('import limits at the exact edge', () => {
  it('exactly 300 notes all come in with no note', () => {
    const text = Array.from({ length: IMPORT_MAX_CARDS }, (_, i) => `note ${i}`).join('\n\n');
    const r = read('many.txt', text);
    expect(r.cards).toHaveLength(IMPORT_MAX_CARDS);
    expect(r.note).toBe('');
  });

  it('301 notes: the first 300 come in and the user is told', () => {
    const text = Array.from({ length: IMPORT_MAX_CARDS + 1 }, (_, i) => `note ${i}`).join('\n\n');
    const r = read('many.txt', text);
    expect(r.cards).toHaveLength(IMPORT_MAX_CARDS);
    expect(r.note).toBe(TOO_LONG);
  });

  const items = Array.from({ length: IMPORT_MAX_ITEMS }, (_, i) => `- [ ] item ${i}`).join('\n');

  it('a list of exactly 2000 items comes in whole with no note', () => {
    const r = read('list.md', `## Big\n${items}`);
    expect((r.cards[0] as TodoCard).items).toHaveLength(IMPORT_MAX_ITEMS);
    expect(r.note).toBe('');
  });

  it('after 2000 items a plain note still comes in, but another list does not', () => {
    const withNote = read('list.md', `## Big\n${items}\n\nAfterwards`);
    expect(withNote.note).toBe('');
    expect(withNote.cards).toHaveLength(2);
    const withList = read('list.md', `## Big\n${items}\n\n## Next\n- [ ] x`);
    expect(withList.note).toBe(TOO_LONG);
    expect(withList.cards).toHaveLength(1);
  });
});

describe('odd files', () => {
  it('a UTF-16 text file (read as UTF-8 it is full of null characters) says it cannot be read', () => {
    const text = 'ÿþ' + [...'Hello notes'].map((c) => c + '\u0000').join('');
    expect(read('notes.txt', text)).toEqual({ cards: [], note: CANT_READ });
  });

  it('front matter, a byte-order mark, Windows line endings and the board name are all skipped', () => {
    const r = read('o.md', '﻿---\r\ntitle: x\r\n---\r\n# Name\r\n## List\r\n- [ ] a');
    expect(r.cards).toHaveLength(1);
    expect((r.cards[0] as TodoCard).title).toBe('List');
    expect(outline((r.cards[0] as TodoCard).items)).toEqual(['a']);
  });

  it('HTML lists nested far deeper than 6 levels come in as one list with 6 levels, the rest as siblings', () => {
    let h = '';
    for (let i = 0; i < 40; i++) h += `<ul><li>level ${i}`;
    const r = read('d.html', h);
    expect(r.cards).toHaveLength(1);
    let depth = 0;
    let level = (r.cards[0] as TodoCard).items;
    while (level.length && level[level.length - 1].children.length) {
      depth++;
      level = level[level.length - 1].children;
    }
    expect(depth + 1).toBe(6);
    expect(htmlToMarkdown(parseHtml(h))).toContain('level 39');
  });
});

describe('Download as text, then Import file, gives the lists back', () => {
  it('a list keeps its title, items, nesting and ticks; the container heading becomes an empty list first', () => {
    let b = B.addColumn(B.createBoard(), { ...createColumn('c1'), title: 'This week', x: 400, y: 0 });
    const groceries: TodoCard = {
      ...(createCard('todo', 't1') as TodoCard),
      title: 'Groceries',
      items: [
        { id: 'i1', text: 'Fruit', done: false, children: [{ id: 'i2', text: 'Apples', done: true, children: [] }] },
        { id: 'i3', text: 'Milk', done: true, children: [] },
      ],
    };
    b = B.addCard(b, groceries, { type: 'column', columnId: 'c1', index: 0 });
    b = B.addCard(b, { ...(createCard('note', 'n1') as NoteCard), text: 'Call the plumber' }, { type: 'loose', x: 0, y: 300 });
    b = B.addCard(b, { ...(createCard('link', 'l1') as LinkCard), title: 'Recipe', url: 'https://example.com/soup' }, { type: 'loose', x: 0, y: 0 });
    const cards = parseMilanote(boardAsMarkdown(b), makeId);
    const lists = cards.filter((c): c is TodoCard => c.kind === 'todo');
    expect(lists.map((l) => l.title)).toEqual(['This week', 'Groceries']);
    expect(lists[0].items.every((i) => i.text === '')).toBe(true);
    expect(outline(lists[1].items)).toEqual([['Fruit', ['[x] Apples']], '[x] Milk']);
  });
});
