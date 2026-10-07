import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_CARDS, readImport, TOO_LONG, UNKNOWN_JSON } from './importFile';
import type { Card, LinkCard, NoteCard, TodoCard, TodoItem } from './types';

let n = 0;
const makeId = (p: string) => `${p}${++n}`;
const noHtml = (): Document => {
  throw new Error('JSON must not go through the HTML parser');
};
const read = (name: string, data: unknown) => readImport(name, typeof data === 'string' ? data : JSON.stringify(data), noHtml, makeId);
const outline = (items: TodoItem[]): unknown[] =>
  items.map((it) => (it.children.length ? [`${it.done ? '[x] ' : ''}${it.text}`, outline(it.children)] : `${it.done ? '[x] ' : ''}${it.text}`));
const summary = (cards: Card[]) =>
  cards.map((c) => [c.kind, c.kind === 'note' ? c.text : c.kind === 'link' ? `${c.title} ${c.url}` : c.kind === 'todo' ? c.title : '']);

// A small Trello board export (Board menu → Print, export and share → Export as JSON), trimmed.
const trello = {
  id: 'b1',
  name: 'Home jobs',
  lists: [
    { id: 'L2', name: 'Doing', closed: false, pos: 2 },
    { id: 'L1', name: 'To do', closed: false, pos: 1 },
    { id: 'L3', name: 'Old stuff', closed: true, pos: 3 },
    { id: 'L4', name: 'Empty', closed: false, pos: 4 },
  ],
  cards: [
    { id: 'c1', name: 'Paint fence', desc: '', closed: false, idList: 'L1', pos: 2, dueComplete: false },
    { id: 'c2', name: 'Fix tap', desc: 'Washer is <b>size 3</b>\n**not** 4', closed: false, idList: 'L1', pos: 1, dueComplete: false },
    { id: 'c3', name: 'Mow lawn', desc: '', closed: false, idList: 'L2', pos: 1, dueComplete: true },
    { id: 'c4', name: 'Archived card', desc: '', closed: true, idList: 'L1', pos: 3 },
    { id: 'c5', name: 'In a closed list', desc: '', closed: false, idList: 'L3', pos: 1 },
    { id: 'c6', name: 'Shopping', desc: '', closed: false, idList: 'L2', pos: 2 },
  ],
  checklists: [
    {
      id: 'k1',
      idCard: 'c1',
      name: 'Checklist',
      pos: 1,
      checkItems: [
        { id: 'i2', name: 'Second coat', state: 'incomplete', pos: 2 },
        { id: 'i1', name: 'Sand', state: 'complete', pos: 1 },
      ],
    },
    { id: 'k3', idCard: 'c6', name: 'Hardware', pos: 2, checkItems: [{ id: 'i4', name: 'Nails', state: 'incomplete', pos: 1 }] },
    { id: 'k2', idCard: 'c6', name: 'Food', pos: 1, checkItems: [{ id: 'i3', name: 'Bread', state: 'complete', pos: 1 }] },
  ],
};

describe('readImport: Trello board exports', () => {
  it('turns each open list into a checklist: cards → items, card checklists → sub-items, ticks kept', () => {
    const { cards, note } = read('abc123.json', trello);
    expect(note).toBe('');
    expect(summary(cards)).toEqual([
      ['todo', 'To do'],
      ['note', 'Fix tap\nWasher is <b>size 3</b>\n**not** 4'],
      ['todo', 'Doing'],
      ['todo', 'Empty'],
    ]);
    const [todo, , doing, empty] = cards as TodoCard[];
    expect(outline(todo.items)).toEqual(['Fix tap', ['Paint fence', ['[x] Sand', 'Second coat']]]);
    // Several checklists on one card: each is a sub-item with its own items under it.
    expect(outline(doing.items)).toEqual(['[x] Mow lawn', ['Shopping', [['Food', ['[x] Bread']], ['Hardware', ['Nails']]]]]);
    expect(outline(empty.items)).toEqual(['']);
    expect(new Set(cards.map((c) => c.id)).size).toBe(4);
  });

  it('skips closed cards and closed lists, and refuses broken fields without crashing', () => {
    const { cards } = read('t.json', {
      lists: [{ id: 'L1', name: 7, closed: false }, null, 'x'],
      cards: [{ id: 'c1', name: { evil: true }, idList: 'L1' }, { name: 'no list' }, 5],
      checklists: 'nope',
    });
    expect(summary(cards)).toEqual([['todo', '']]);
    expect(outline((cards[0] as TodoCard).items)).toEqual(['']);
  });

  it('keeps to the limits', () => {
    const lists = Array.from({ length: IMPORT_MAX_CARDS + 5 }, (_, i) => ({ id: `L${i}`, name: `List ${i}`, pos: i }));
    const { cards, note } = read('big.json', { lists, cards: [] });
    expect(cards).toHaveLength(IMPORT_MAX_CARDS);
    expect(note).toBe(TOO_LONG);
  });
});

// Google Takeout → Keep: one .json file per note.
describe('readImport: Google Keep notes', () => {
  it('turns a text note into a note, its title on the first line', () => {
    const { cards, note } = read('Shopping idea.json', {
      color: 'DEFAULT',
      isTrashed: false,
      isPinned: false,
      isArchived: false,
      title: 'Gift idea',
      textContent: 'A <script>alert(1)</script> kite\n\nfor Sam',
      userEditedTimestampUsec: 1700000000000000,
    });
    expect(note).toBe('');
    expect(summary(cards)).toEqual([['note', 'Gift idea\nA <script>alert(1)</script> kite\n\nfor Sam']]);
    expect((cards[0] as NoteCard).text).toContain('<script>'); // kept as plain text, never run
  });

  it('turns a list note into a checklist with its ticks', () => {
    const { cards } = read('Groceries.json', {
      isTrashed: false,
      title: 'Groceries',
      listContent: [
        { text: 'Milk', isChecked: false },
        { text: 'Eggs', isChecked: true },
      ],
    });
    expect(summary(cards)).toEqual([['todo', 'Groceries']]);
    expect(outline((cards[0] as TodoCard).items)).toEqual(['Milk', '[x] Eggs']);
  });

  it('turns a note that is only a web address into a link card', () => {
    const cards = read('link.json', { isTrashed: false, title: 'Recipe', textContent: ' https://example.com/soup \n' }).cards;
    expect(cards).toHaveLength(1);
    expect((cards[0] as LinkCard).title).toBe('Recipe');
    expect((cards[0] as LinkCard).url).toBe('https://example.com/soup');
  });

  it('skips trashed and empty notes, and reads a list of notes in one file', () => {
    const { cards, note } = read('notes.json', [
      { isTrashed: true, title: 'Gone', textContent: 'bin' },
      { isTrashed: false, isArchived: true, title: '', textContent: 'Archived but kept' },
      { isTrashed: false, title: '', textContent: '   ' },
    ]);
    expect(note).toBe('');
    expect(summary(cards)).toEqual([['note', 'Archived but kept']]);
    expect(read('gone.json', { isTrashed: true, title: 'Gone', textContent: 'bin' })).toEqual({ cards: [], note: '' });
  });
});

describe('readImport: other JSON', () => {
  it('refuses JSON from anywhere else, and broken JSON, with a short note', () => {
    for (const text of ['{"version":3,"home":"b","boards":{}}', '[1,2]', '"hi"', '{ not json', 'null', '{}'])
      expect(read('x.json', text)).toEqual({ cards: [], note: UNKNOWN_JSON });
  });
});
