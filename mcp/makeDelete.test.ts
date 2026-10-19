import { describe, expect, it } from 'vitest';
import { addCard, createBoard, problems } from '../src/model/board';
import { createBoardCard, createCard } from '../src/model/cards';
import type { Board, BoardCard, NoteCard, TodoCard, TodoItem } from '../src/model/types';
import { readWorkspace, serializeWorkspace, type Workspace } from '../src/model/workspace';
import { addChecklist, addItems, deleteThings, newBoard, newColumn, planDelete, type Edit } from './edits';
import { homeBoard, ownRaw, workBoard } from './sample';

// The connector's making and deleting (job 110), pure, on the sample boards.

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

// ---------- making things ----------

describe('add_checklist', () => {
  it('a checklist with items at the end of a column, ids made up front', () => {
    const r = ok(addChecklist('home', 'Packing', ['Socks', ' Tooth\nbrush '], { column: 'Ideas' }, 'kList', ['a', 'b']));
    const c = list(r.ws, 'kList');
    expect(c.title).toBe('Packing');
    expect(c.items.map((i) => [i.id, i.text])).toEqual([['a', 'Socks'], ['b', 'Tooth brush']]);
    expect(r.ws.boards.home.columns.colIdeas.cardIds).toEqual(['noteIdea', 'kList']);
    expect(r.changed).toEqual(['Added the checklist "Packing" (id: kList) with 2 items to the column Ideas']);
  });

  it('with no items: one blank item, as a new checklist in the app; loose when no place is given', () => {
    const r = ok(addChecklist('home', 'Later', [], {}, 'kList', ['a']));
    expect(list(r.ws, 'kList').items).toEqual([{ id: 'a', text: '', done: false, children: [] }]);
    expect(r.ws.boards.home.order).toContain('kList');
    expect(r.changed).toEqual(['Added the checklist "Later" (id: kList) on the board']);
  });

  it('runs again without adding a second one; refuses a blank title or item', () => {
    const edit = addChecklist('home', 'Once', ['x'], {}, 'kList', ['a']);
    const once = ok(edit);
    expect(ok(edit, once.ws).changed).toEqual([]);
    expect(fails(addChecklist('home', ' ', [], {}, 'k', ['a']))).toMatch(/blank/);
    expect(fails(addChecklist('home', 'T', ['ok', ' '], {}, 'k', ['a', 'b']))).toMatch(/blank/);
  });
});

describe('add_column', () => {
  it('a column, loose; runs again without a second one', () => {
    const edit = newColumn('home', 'Later', undefined, 'cNew');
    const r = ok(edit);
    const col = r.ws.boards.home.columns.cNew;
    expect([col.title, col.cardIds]).toEqual(['Later', []]);
    expect(r.ws.boards.home.order).toContain('cNew');
    expect(r.changed).toEqual(['Added the column "Later" (id: cNew) on the board']);
    expect(ok(edit, r.ws).changed).toEqual([]);
  });

  it('refuses a blank title and an unknown near', () => {
    expect(fails(newColumn('home', ' ', undefined, 'c'))).toMatch(/blank/);
    expect(fails(newColumn('home', 'x', 'nope', 'c'))).toMatch(/No card or column with id "nope"/);
  });
});

describe('create_board', () => {
  it('a board inside another: the named board, and a board card opening it on that board', () => {
    const r = ok(newBoard('Garden', { boardId: 'home', where: { column: 'Ideas' } }, 'bNew', 'kCard'));
    expect(r.ws.boards.bNew.name).toBe('Garden');
    expect(r.ws.boards.bNew.order).toEqual([]);
    expect((r.ws.boards.home.cards.kCard as BoardCard).boardId).toBe('bNew');
    expect(r.ws.boards.home.columns.colIdeas.cardIds).toEqual(['noteIdea', 'kCard']);
    expect(r.changed).toEqual(['Made the board "Garden" (id: bNew) inside Home, with a board card (id: kCard) to the column Ideas']);
  });

  it('a board on its own (no board opens it), like New board in the app', () => {
    const r = ok(newBoard('Side project', undefined, 'bNew', 'kCard'));
    expect(r.ws.boards.bNew.name).toBe('Side project');
    expect(JSON.stringify(r.ws.boards.home)).not.toContain('bNew');
    expect(r.changed).toEqual(['Made the board "Side project" (id: bNew), on its own (no board opens it)']);
  });

  it('runs again without a second board; refuses a blank name and a missing board to put it in', () => {
    const edit = newBoard('Once', { boardId: 'home', where: {} }, 'bNew', 'kCard');
    const once = ok(edit);
    expect(serializeWorkspace(ok(edit, once.ws).ws)).toBe(serializeWorkspace(once.ws));
    expect(fails(newBoard('  ', undefined, 'b', 'k'))).toMatch(/blank/);
    expect(fails(newBoard('X', { boardId: 'gone', where: {} }, 'b', 'k'))).toMatch(/isn’t there/);
  });
});

// ---------- deleting ----------

/** Home with a sub-board "Garden" (card kGarden), which has its own sub-board "Seeds" (card kSeeds). */
function withGarden(): Workspace {
  const home = addCard(homeBoard(), createBoardCard('garden', 'kGarden'), { type: 'loose', x: 0, y: 900 });
  let garden: Board = { ...createBoard(), name: 'Garden' };
  garden = addCard(garden, { ...(createCard('note', 'nRoses') as NoteCard), text: 'Roses' }, { type: 'loose', x: 40, y: 40 });
  garden = addCard(garden, createBoardCard('seeds', 'kSeeds'), { type: 'loose', x: 400, y: 40 });
  const seeds: Board = { ...createBoard(), name: 'Seeds' };
  return { home: 'home', boards: { home, work: workBoard(), garden, seeds } };
}
const none = new Set<string>();
const blank = (p: string) => `${p}_blank`;
function plan(ws: Workspace, ids: string[], shared = none, board = 'home') {
  const r = planDelete(ws, board, ids, shared, blank);
  if ('error' in r) throw new Error(r.error);
  for (const b of Object.values(r.ws.boards)) expect(problems(b)).toEqual([]);
  return r;
}
function planError(ws: Workspace, ids: string[], shared = none, board = 'home') {
  const r = planDelete(ws, board, ids, shared, blank);
  if (!('error' in r)) throw new Error('expected an error');
  return r.error;
}

describe('planning a delete (preview_delete)', () => {
  it('items: with their sub-items, as the app’s delete does, each listed', () => {
    const r = plan(sample(), ['iEggs', 'iBread']);
    expect(texts(list(r.ws, 'listGroceries').items)).toEqual([['Milk', ['Semi-skimmed']]]);
    expect(r.lines).toEqual([
      'the item "Eggs" (id: iEggs) from Groceries on Home',
      'the item "Free range" (id: iFree) from Groceries on Home',
      'the item "Box of 12" (id: iBox) from Groceries on Home',
      'the item "Bread" (id: iBread) from Groceries on Home',
    ]);
  });

  it('every item of a list: the list keeps one blank item (as in the app)', () => {
    const r = plan(sample(), ['iMilk', 'iEggs', 'iBread']);
    expect(list(r.ws, 'listGroceries').items).toEqual([{ id: 'i_blank', text: '', done: false, children: [] }]);
  });

  it('cards: a checklist (with its item count), a note, a link and a board card (the board it opens is kept)', () => {
    const r = plan(sample(), ['listGroceries', 'noteCall', 'linkDocs', 'cardWork']);
    expect(Object.keys(r.ws.boards.home.cards).sort()).toEqual(['cardDone', 'noteIdea']);
    expect(r.ws.boards.work).toBeDefined();
    expect(r.lines).toEqual([
      'the checklist "Groceries" (id: listGroceries) on Home, with 6 items',
      'the note "Call the bank" (id: noteCall) on Home',
      'the link "Docs" (id: linkDocs) on Home',
      'the board card (id: cardWork) on Home, which opens Work (the board Work itself is kept)',
    ]);
  });

  it('a column: with its cards (counted, not listed again)', () => {
    const r = plan(sample(), ['colTodo', 'noteCall']);
    expect(r.ws.boards.home.columns.colTodo).toBeUndefined();
    expect(r.ws.boards.home.cards.listGroceries).toBeUndefined();
    expect(r.lines).toEqual(['the column "To do" (id: colTodo) on Home, with 2 cards']);
  });

  it('a column holding the Completed card: the Completed card is kept, loose', () => {
    const ws = sample();
    const home = ws.boards.home;
    const cols = { ...home.columns, colIdeas: { ...home.columns.colIdeas, cardIds: [...home.columns.colIdeas.cardIds, 'cardDone'] } };
    const moved: Workspace = { ...ws, boards: { ...ws.boards, home: { ...home, order: home.order.filter((id) => id !== 'cardDone'), columns: cols } } };
    const r = plan(moved, ['colIdeas']);
    expect(r.ws.boards.home.cards.cardDone).toBeDefined();
    expect(r.lines).toEqual(['the column "Ideas" (id: colIdeas) on Home, with 1 card']);
  });

  it('a sub-board (by its id, from the board with its card): it and its card go; boards inside it are kept', () => {
    const r = plan(withGarden(), ['garden']);
    expect(r.ws.boards.garden).toBeUndefined();
    expect(r.ws.boards.home.cards.kGarden).toBeUndefined();
    expect(r.ws.boards.seeds).toBeDefined();
    expect(r.lines).toEqual([
      'the board "Garden" (id: garden), with 2 cards (the boards inside it are kept and then stand alone: Seeds)',
      'the board card (id: kGarden) on Home, which opens Garden',
    ]);
  });

  it('refuses the home board, a board not inside this one, the board itself, the Completed card and unknown ids', () => {
    const ws = withGarden();
    expect(planError(ws, ['home'])).toMatch(/home board/);
    expect(planError(ws, ['work'], none, 'garden')).toMatch(/No item, card, column or board inside Garden with id "work"/);
    expect(planError(ws, ['garden'], none, 'garden')).toMatch(/itself/);
    expect(planError(ws, ['cardDone'])).toMatch(/Completed card/);
    expect(planError(ws, ['nope'])).toMatch(/No item, card, column or board inside Home with id "nope"/);
    expect(planError(ws, ['seeds'])).toMatch(/No item, card, column or board inside Home with id "seeds"/);
  });

  it('never a whole top-level board, even one a card on this board opens (two boards opening each other)', () => {
    const ws = withGarden();
    let x: Board = { ...createBoard(), name: 'X' };
    let y: Board = { ...createBoard(), name: 'Y' };
    x = addCard(x, createBoardCard('y', 'kY'), { type: 'loose', x: 0, y: 0 });
    y = addCard(y, createBoardCard('x', 'kX'), { type: 'loose', x: 0, y: 0 });
    // X is listed at the top (no way down from Home reaches it), with Y inside it.
    expect(planError({ ...ws, boards: { ...ws.boards, x, y } }, ['x'], none, 'y')).toMatch(/top-level/);
  });

  it('refuses when a shared board would change (a sub-board in a share, or a board holding its card)', () => {
    expect(planError(withGarden(), ['garden'], new Set(['garden']))).toMatch(/shared/);
    expect(planError(withGarden(), ['kSeeds'], new Set(['garden']), 'garden')).toMatch(/shared/);
  });

  it('refuses the same id twice', () => {
    expect(planError(sample(), ['iMilk', 'iMilk'])).toMatch(/twice/);
  });
});

describe('deleting (confirm_delete)', () => {
  const expected = (ws: Workspace, ids: string[]) => plan(ws, ids).lines;

  it('makes the planned delete, each line saying Deleted', () => {
    const ws = sample();
    const r = ok(deleteThings('home', ['noteCall', 'iBread'], none, expected(ws, ['noteCall', 'iBread']), 'z'), ws);
    expect(r.ws.boards.home.cards.noteCall).toBeUndefined();
    expect(r.changed).toEqual(['Deleted the note "Call the bank" (id: noteCall) on Home', 'Deleted the item "Bread" (id: iBread) from Groceries on Home']);
  });

  it('runs again (everything already gone) without changing anything', () => {
    const edit = deleteThings('home', ['noteCall', 'garden'], none, expected(withGarden(), ['noteCall', 'garden']), 'z');
    const once = ok(edit, withGarden());
    const twice = ok(edit, once.ws);
    expect(twice.changed).toEqual([]);
    expect(serializeWorkspace(twice.ws)).toBe(serializeWorkspace(once.ws));
  });

  it('refuses when the boards changed since the preview (something more would go, or some is already gone)', () => {
    const ws = sample();
    const lines = expected(ws, ['listGroceries']);
    const more = ok(addItems('home', 'Groceries', [{ text: 'Apples' }], ['n1']), ws).ws;
    expect(fails(deleteThings('home', ['listGroceries'], none, lines, 'z'), more)).toMatch(/changed since the preview/);
    const both = expected(ws, ['noteCall', 'linkDocs']);
    const half = ok(deleteThings('home', ['noteCall'], none, expected(ws, ['noteCall']), 'z'), ws).ws;
    expect(fails(deleteThings('home', ['noteCall', 'linkDocs'], none, both, 'z'), half)).toMatch(/changed since the preview/);
  });
});
