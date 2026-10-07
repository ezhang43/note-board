import { describe, expect, it } from 'vitest';
import { problems } from '../src/model/board';
import { findItem } from '../src/model/checklist';
import type { NoteCard, TodoCard, TodoItem } from '../src/model/types';
import { readWorkspace, serializeWorkspace, type Workspace } from '../src/model/workspace';
import { addItems, addNote, editItems, moveItems, setItemsDone, type Edit } from './edits';
import { ownRaw } from './sample';

// The connector's changes to a board (pure): each tool's edit on the sample boards.

const sample = (): Workspace => readWorkspace(ownRaw())!.ws;

function ok(edit: Edit, ws = sample()) {
  const r = edit(ws);
  if ('error' in r) throw new Error(r.error);
  for (const b of Object.values(r.ws.boards)) expect(problems(b)).toEqual([]);
  return r;
}
function fails(edit: Edit, ws = sample()) {
  const r = edit(ws);
  if (!('error' in r)) throw new Error('expected an error');
  return r.error;
}
const list = (ws: Workspace, id: string, board = 'home') => ws.boards[board].cards[id] as TodoCard;
const texts = (items: TodoItem[]): unknown[] => items.map((it) => (it.children.length ? [it.text, texts(it.children)] : it.text));
const item = (ws: Workspace, listId: string, id: string, board = 'home') => findItem(list(ws, listId, board).items, id);

describe('add_items', () => {
  it('adds items at the end of a list named by its title, in order, with due dates', () => {
    const r = ok(addItems('home', 'groceries', [{ text: 'Apples' }, { text: 'Pears', due: '2026-10-09' }], ['n1', 'n2']));
    const items = list(r.ws, 'listGroceries').items;
    expect(items.map((i) => i.id)).toEqual(['iMilk', 'iEggs', 'iBread', 'n1', 'n2']);
    expect(items.at(-1)).toEqual({ id: 'n2', text: 'Pears', done: false, children: [], due: '2026-10-09' });
    expect(r.changed).toEqual(['Added "Apples" (id: n1) to Groceries', 'Added "Pears" (id: n2, due 2026-10-09) to Groceries']);
  });

  it('after an item (several keep their order) and under an item (as its last sub-items)', () => {
    const r = ok(addItems('home', 'listGroceries', [{ text: 'A', after: 'iMilk' }, { text: 'B', after: 'iMilk' }, { text: 'C', under: 'iEggs' }, { text: 'D', under: 'iEggs' }], ['a', 'b', 'c', 'd']));
    expect(texts(list(r.ws, 'listGroceries').items)).toEqual([['Milk', ['Semi-skimmed']], 'A', 'B', ['Eggs', [['Free range', ['Box of 12']], 'C', 'D']], 'Bread']);
  });

  it('under an item with no sub-items yet', () => {
    const r = ok(addItems('home', 'listGroceries', [{ text: 'Brown', under: 'iBread' }], ['n']));
    expect(item(r.ws, 'listGroceries', 'n')!.parent!.id).toBe('iBread');
  });

  it('runs again with the same ids without adding anything twice', () => {
    const edit = addItems('home', 'Groceries', [{ text: 'Apples' }], ['n1']);
    const once = ok(edit);
    const twice = ok(edit, once.ws);
    expect(serializeWorkspace(twice.ws)).toBe(serializeWorkspace(once.ws));
    expect(twice.changed).toEqual([]);
  });

  it('puts one line of text per item (line breaks become spaces) and refuses blank text', () => {
    expect(list(ok(addItems('home', 'Groceries', [{ text: '  Oat\nmilk ' }], ['n'])).ws, 'listGroceries').items.at(-1)!.text).toBe('Oat milk');
    expect(fails(addItems('home', 'Groceries', [{ text: '  ' }], ['n']))).toMatch(/blank/);
  });

  it('refuses unknown lists, items, bad dates and going past 6 levels', () => {
    expect(fails(addItems('home', 'Shopping', [{ text: 'x' }], ['n']))).toMatch(/No checklist called "Shopping".*\n- Groceries \(id: listGroceries\)/s);
    expect(fails(addItems('home', 'Groceries', [{ text: 'x', after: 'nope' }], ['n']))).toMatch(/No item with id "nope" in Groceries/);
    expect(fails(addItems('home', 'Groceries', [{ text: 'x', due: '2026-02-30' }], ['n']))).toMatch(/YYYY-MM-DD/);
    const deep = ['iBox', 'n1', 'n2', 'n3'];
    let ws = sample();
    for (let i = 1; i < deep.length; i++) ws = ok(addItems('home', 'Groceries', [{ text: `L${i}`, under: deep[i - 1] }], [deep[i]]), ws).ws;
    expect(fails(addItems('home', 'Groceries', [{ text: 'too deep', under: 'n3' }], ['n4']), ws)).toMatch(/6 levels/);
  });

  it('a list title that two lists have asks which, by id', () => {
    const ws = sample();
    ws.boards.home.cards.list2 = { ...list(ws, 'listGroceries'), id: 'list2', items: [{ id: 'z', text: 'z', done: false, children: [] }] };
    ws.boards.home.order = [...ws.boards.home.order, 'list2'];
    expect(fails(addItems('home', 'Groceries', [{ text: 'y' }], ['m']), ws)).toMatch(/2 checklists are called "Groceries"/);
    expect(list(ok(addItems('home', 'list2', [{ text: 'y' }], ['m']), ws).ws, 'list2').items).toHaveLength(2);
  });

  it('a board that is gone is an error', () => {
    expect(fails(addItems('nope', 'Groceries', [{ text: 'x' }], ['n']))).toMatch(/board/);
  });
});

describe('edit_items', () => {
  it('changes text and due dates, and removes a due date', () => {
    const r = ok(editItems('home', [{ item: 'iEggs', text: 'Eggs (6)' }, { item: 'iMilk', due: null }, { item: 'iBread', due: '2026-10-10' }]));
    expect(item(r.ws, 'listGroceries', 'iEggs')!.item.text).toBe('Eggs (6)');
    expect(item(r.ws, 'listGroceries', 'iMilk')!.item.due).toBeUndefined();
    expect(item(r.ws, 'listGroceries', 'iBread')!.item.due).toBe('2026-10-10');
    expect(r.changed).toEqual(['Changed "Eggs" to "Eggs (6)"', 'Removed the due date from "Milk"', 'Set "Bread" due 2026-10-10']);
  });

  it('finds items on any list of the board, nested too', () => {
    expect(item(ok(editItems('home', [{ item: 'iBox', text: 'Box of 6' }])).ws, 'listGroceries', 'iBox')!.item.text).toBe('Box of 6');
  });

  it('nothing to change, an unknown item, blank text or a bad date is an error', () => {
    expect(fails(editItems('home', [{ item: 'iEggs' }]))).toMatch(/what to change/);
    expect(fails(editItems('home', [{ item: 'nope', text: 'x' }]))).toMatch(/No item with id "nope"/);
    expect(fails(editItems('home', [{ item: 'iEggs', text: ' ' }]))).toMatch(/blank/);
    expect(fails(editItems('home', [{ item: 'iEggs', due: 'tomorrow' }]))).toMatch(/YYYY-MM-DD/);
  });

  it('an item on another board isn’t found', () => {
    expect(fails(editItems('home', [{ item: 'iReport', text: 'x' }]))).toMatch(/No item with id "iReport"/);
  });
});

describe('set_items_done', () => {
  it('ticks items (the last open sub-item ticks its parent, as in the app) and unticks', () => {
    const r = ok(setItemsDone('home', ['iBox'], true));
    expect(item(r.ws, 'listGroceries', 'iEggs')!.item.done).toBe(true);
    expect(r.changed).toEqual(['Ticked "Box of 12"']);
    const back = ok(setItemsDone('home', ['iBread'], false));
    expect(item(back.ws, 'listGroceries', 'iBread')!.item.done).toBe(false);
    expect(back.changed).toEqual(['Unticked "Bread"']);
  });

  it('an item already in that state changes nothing', () => {
    const r = ok(setItemsDone('home', ['iBread'], true));
    expect(r.changed).toEqual([]);
    expect(serializeWorkspace(r.ws)).toBe(serializeWorkspace(sample()));
  });

  it('an unknown item is an error', () => {
    expect(fails(setItemsDone('home', ['nope'], true))).toMatch(/No item with id "nope"/);
  });
});

describe('move_items', () => {
  it('moves items (with their sub-items) to another list on the board, at its end', () => {
    const ws = ok(addItems('home', 'Groceries', [{ text: 'x' }], ['n'])).ws;
    ws.boards.home.cards.listOther = { ...list(ws, 'listGroceries'), id: 'listOther', title: 'Other', items: [{ id: 'o1', text: 'One', done: false, children: [] }] };
    ws.boards.home.columns.colIdeas = { ...ws.boards.home.columns.colIdeas, cardIds: [...ws.boards.home.columns.colIdeas.cardIds, 'listOther'] };
    const r = ok(moveItems('home', ['iEggs'], { list: 'Other' }), ws);
    expect(texts(list(r.ws, 'listOther').items)).toEqual(['One', ['Eggs', [['Free range', ['Box of 12']]]]]);
    expect(item(r.ws, 'listGroceries', 'iEggs')).toBeNull();
    expect(r.changed).toEqual(['Moved "Eggs" to Other']);
  });

  it('within a list: before, after and under an item', () => {
    expect(texts(list(ok(moveItems('home', ['iEggs'], { list: 'Groceries', before: 'iMilk' })).ws, 'listGroceries').items)[0]).toEqual(['Eggs', [['Free range', ['Box of 12']]]]);
    expect(list(ok(moveItems('home', ['iMilk'], { list: 'Groceries', after: 'iEggs' })).ws, 'listGroceries').items.map((i) => i.id)).toEqual(['iEggs', 'iMilk', 'iBread']);
    const under = ok(moveItems('home', ['iBread', 'iMilk'], { list: 'Groceries', under: 'iEggs' })).ws;
    expect(item(under, 'listGroceries', 'iEggs')!.item.children.map((c) => c.id)).toEqual(['iFree', 'iMilk', 'iBread']); // in the order shown, as when dragging
  });

  it('a list emptied by the move stays, with one blank item (the connector never deletes)', () => {
    const ws = sample();
    ws.boards.home.cards.listOther = { ...list(ws, 'listGroceries'), id: 'listOther', title: 'Other', items: [{ id: 'o1', text: 'One', done: false, children: [] }] };
    ws.boards.home.order = [...ws.boards.home.order, 'listOther'];
    const r = ok(moveItems('home', ['o1'], { list: 'Groceries' }), ws);
    const left = list(r.ws, 'listOther');
    expect(left).toBeDefined();
    expect(left.items).toHaveLength(1);
    expect(left.items[0].text).toBe('');
  });

  it('running again changes nothing', () => {
    const edit = moveItems('home', ['iMilk'], { list: 'Groceries', after: 'iEggs' });
    const once = ok(edit);
    expect(serializeWorkspace(ok(edit, once.ws).ws)).toBe(serializeWorkspace(once.ws));
  });

  it('refuses moving items next to or under themselves, past 6 levels, or with two places given', () => {
    expect(fails(moveItems('home', ['iEggs'], { list: 'Groceries', under: 'iBox' }))).toMatch(/themselves/);
    expect(fails(moveItems('home', ['iEggs'], { list: 'Groceries', after: 'iMilk', before: 'iBread' }))).toMatch(/only one of/);
    let ws = sample();
    for (const [id, under] of [['n1', 'iBox'], ['n2', 'n1'], ['n3', 'n2']]) ws = ok(addItems('home', 'Groceries', [{ text: id, under }], [id]), ws).ws;
    expect(fails(moveItems('home', ['iEggs'], { list: 'Groceries', under: 'iSkim' }), ws)).toMatch(/6 levels/);
  });
});

describe('add_note', () => {
  it('at the end of a column named by its title', () => {
    const r = ok(addNote('home', 'Buy stamps', { column: 'ideas' }, 'k1'));
    expect(r.ws.boards.home.columns.colIdeas.cardIds).toEqual(['noteIdea', 'k1']);
    expect((r.ws.boards.home.cards.k1 as NoteCard).text).toBe('Buy stamps');
    expect(r.changed).toEqual(['Added a note (id: k1) to the column Ideas: "Buy stamps"']);
  });

  it('near a card in a column: just below it', () => {
    const r = ok(addNote('home', 'Below', { near: 'listGroceries' }, 'k1'));
    expect(r.ws.boards.home.columns.colTodo.cardIds).toEqual(['listGroceries', 'k1', 'noteCall']);
  });

  it('near a loose card, or with no place: loose, without touching other blocks', () => {
    for (const where of [{ near: 'linkDocs' }, {}]) {
      const r = ok(addNote('home', 'Loose\nnote', where, 'k1'));
      expect(r.ws.boards.home.order).toContain('k1');
      expect(r.changed[0]).toMatch(/^Added a note \(id: k1\)/);
    }
  });

  it('runs again without adding a second note', () => {
    const edit = addNote('home', 'Once', {}, 'k1');
    const once = ok(edit);
    expect(serializeWorkspace(ok(edit, once.ws).ws)).toBe(serializeWorkspace(once.ws));
  });

  it('refuses blank text, an unknown column or card, and both places at once', () => {
    expect(fails(addNote('home', '  ', {}, 'k1'))).toMatch(/blank/);
    expect(fails(addNote('home', 'x', { column: 'Nope' }, 'k1'))).toMatch(/No column called "Nope"/);
    expect(fails(addNote('home', 'x', { near: 'nope' }, 'k1'))).toMatch(/No card or column with id "nope"/);
    expect(fails(addNote('home', 'x', { column: 'Ideas', near: 'linkDocs' }, 'k1'))).toMatch(/only one of/);
  });
});
