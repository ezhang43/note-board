import { describe, expect, it } from 'vitest';
import { addCard, createBoard } from './board';
import { createBoardCard, createCard, createColumn } from './cards';
import { cleanUp } from './completed';
import { CHECKLIST_NAME, CHECKLIST_TITLE, checklistCardOf, findChecklistBoard, hiddenChecklist } from './mainChecklist';
import type { Board, TodoCard } from './types';
import { readWorkspace, serializeWorkspace, type Workspace } from './workspace';

// The main checklist (owner request, 2026-11-12): one checklist kept on an ordinary board called
// "Main checklist", like the Journal and Habits, so saving, sync, undo and backups work as for any board.

/** A Main checklist board as the panel's first typing leaves it: one checklist with one item. */
function newChecklistBoard(): Board {
  const card: TodoCard = { ...(createCard('todo') as TodoCard), title: CHECKLIST_TITLE };
  return addCard({ ...createBoard(), name: CHECKLIST_NAME }, card, { type: 'loose', x: 0, y: 0 });
}
const ws = (boards: Record<string, Board>, home = 'home'): Workspace => ({ home, boards: { home: { ...createBoard(), name: 'Home' }, ...boards } });

describe('main checklist', () => {
  // (What the first typing makes is tested in src/store/store-main-checklist.test.ts.)
  it('is found by its exact name among the person’s own boards, never a shared one', () => {
    const w = ws({ a: { ...createBoard(), name: 'Main checklist ' }, b: newChecklistBoard(), c: newChecklistBoard() });
    w.boards.home = addCard(addCard(addCard(w.boards.home, createBoardCard('a'), { type: 'loose', x: 0, y: 0 }), createBoardCard('b'), { type: 'loose', x: 0, y: 0 }), createBoardCard('c'), { type: 'loose', x: 0, y: 0 });
    expect(findChecklistBoard(w, [])).toBe('b');
    expect(findChecklistBoard(w, ['b'])).toBe('c');
    expect(findChecklistBoard(w, ['b', 'c'])).toBeNull();
    expect(findChecklistBoard(ws({}), [])).toBeNull();
  });

  it('the card it shows is the checklist with the lowest id, the same on every device', () => {
    let b = newChecklistBoard();
    const first = checklistCardOf(b)!;
    const other = { ...(createCard('todo') as TodoCard), id: 'k~later' };
    b = addCard(b, other, { type: 'loose', x: 0, y: 0 });
    expect(checklistCardOf(b)?.id).toBe([first.id, other.id].sort()[0]);
    expect(checklistCardOf(createBoard())).toBeNull();
  });

  it('is hidden from the Boards menu while it holds only its checklist and the Completed record', () => {
    const b = newChecklistBoard();
    expect(hiddenChecklist(ws({ b }), [])).toBe('b');
    // Clean up adds the Completed record: still hidden.
    const id = checklistCardOf(b)!.id;
    const ticked: Board = { ...b, cards: { ...b.cards, [id]: { ...(b.cards[id] as TodoCard), items: [{ id: 'i1', text: 'milk', done: true, children: [] }] } } };
    const cleaned = cleanUp(ticked, '2026-11-12', { type: 'loose', x: 0, y: 400 }).board;
    expect(Object.values(cleaned.cards).map((c) => c.kind).sort()).toEqual(['completed', 'todo']);
    expect(hiddenChecklist(ws({ b: cleaned }), [])).toBe('b');
    // Anything else on it, a second list, a column, a link to it, or it being home: it is listed, to be seen.
    expect(hiddenChecklist(ws({ b: addCard(b, createCard('note'), { type: 'loose', x: 0, y: 0 }) }), [])).toBeNull();
    expect(hiddenChecklist(ws({ b: addCard(b, createCard('todo'), { type: 'loose', x: 0, y: 0 }) }), [])).toBeNull();
    const col = createColumn();
    expect(hiddenChecklist(ws({ b: { ...b, columns: { [col.id]: col }, order: [...b.order, col.id] } }), [])).toBeNull();
    const linked = ws({ b });
    linked.boards.home = addCard(linked.boards.home, createBoardCard('b'), { type: 'loose', x: 0, y: 0 });
    expect(hiddenChecklist(linked, [])).toBeNull();
    expect(hiddenChecklist({ home: 'b', boards: { b } }, [])).toBeNull();
    expect(hiddenChecklist(ws({ b }), ['b'])).toBeNull();
  });

  it('is saved, backed up and read back like any board, with nothing new in the file', () => {
    const b = newChecklistBoard();
    const w = ws({ b });
    const text = serializeWorkspace(w);
    const back = readWorkspace(text);
    expect(back?.legacy).toBe(false);
    expect(back?.ws.boards.b).toEqual(b);
    expect(findChecklistBoard(back!.ws, [])).toBe('b');
    expect(hiddenChecklist(back!.ws, [])).toBe('b');
    // The board is only the usual fields: a device on an older version reads it as an ordinary board.
    expect(Object.keys(JSON.parse(text).boards.b).sort()).toEqual(Object.keys(createBoard()).sort());
  });

  it('a save without it reads back unchanged: nothing is made at load', () => {
    const w = ws({ x: { ...createBoard(), name: 'Groceries' } });
    const text = serializeWorkspace(w);
    expect(serializeWorkspace(readWorkspace(text)!.ws)).toBe(text);
    expect(findChecklistBoard(readWorkspace(text)!.ws, [])).toBeNull();
  });
});
