import { describe, expect, it } from 'vitest';
import { safeToEdit } from '../../mcp/boards';
import * as B from './board';
import { createCard } from './cards';
import { cleanUp, restoreEntry } from './completed';
import { mergeBoards, mergeBoardSets } from './merge';
import { readBoard, serializeBoard } from './persist';
import type { Board, CompletedCard, TodoCard, TodoItem } from './types';
import { serializeWorkspace } from './workspace';

// Review 137-A, the rest (job 150): combining two people's edits, and saved fields read back.

const item = (id: string, done = false): TodoItem => ({ id, text: id, done, children: [] });
const list = (id: string, items: TodoItem[]): TodoCard => ({ ...(createCard('todo', id) as TodoCard), title: id, items });
const withItems = (b: Board, id: string, items: TodoItem[]): Board => ({ ...b, cards: { ...b.cards, [id]: { ...(b.cards[id] as TodoCard), items } } });
const ids = (b: Board, id: string) => (b.cards[id] as TodoCard).items.map((i) => i.id);

describe('Clean up on two pages at once (M4)', () => {
  function board() {
    let b = B.addCard(B.createBoard(), list('l1', [item('a', true), item('a2')]), { type: 'loose', x: 0, y: 0 });
    b = B.addCard(b, list('l2', [item('b', true), item('b2')]), { type: 'loose', x: 400, y: 0 });
    const done: CompletedCard = { id: 'done', kind: 'completed', color: 'stone', collapsed: false, x: 0, y: 0, w: null, h: null, groups: [{ date: '2026-10-20', entries: [{ item: item('old', true), fromCardId: 'l1', fromTitle: 'l1', fromParentId: null }] }] };
    return B.addCard(b, done, { type: 'loose', x: 800, y: 0 });
  }
  const entries = (b: Board) => (b.cards.done as CompletedCard).groups.map((g) => [g.date, g.entries.map((e) => e.item.id)]);
  const place = { type: 'loose', x: 0, y: 600 } as const;

  it('keeps both sides’ cleaned-up items in the Completed card', () => {
    const base = board();
    const mine = cleanUp(base, '2026-10-21', place, undefined, 'l1').board;
    const theirs = cleanUp(base, '2026-10-21', place, undefined, 'l2').board;
    const merged = mergeBoards(base, mine, theirs);
    expect(entries(merged)).toEqual([
      ['2026-10-21', ['a', 'b']],
      ['2026-10-20', ['old']],
    ]);
    expect(ids(merged, 'l2')).toEqual(['b2']);
  });

  it('an item put back from Completed on one side stays put back', () => {
    const base = cleanUp(board(), '2026-10-21', place, undefined, 'l1').board;
    const mine = restoreEntry(base, 'a', place).board;
    const theirs = cleanUp(base, '2026-10-22', place, undefined, 'l2').board;
    const merged = mergeBoards(base, mine, theirs);
    expect(entries(merged)).toEqual([
      ['2026-10-22', ['b']],
      ['2026-10-20', ['old']],
    ]);
    expect(ids(merged, 'l1')).toEqual(['a2', 'a']);
  });
});

describe('Completed groups nobody changed (M4)', () => {
  it('keep their order when only something else changed', () => {
    const done: CompletedCard = {
      id: 'done', kind: 'completed', color: 'stone', collapsed: false, x: 0, y: 0, w: null, h: null,
      groups: ['2026-10-22', '2026-10-23'].map((date) => ({ date, entries: [{ item: item(date, true), fromCardId: 'l', fromTitle: 'l', fromParentId: null }] })),
    };
    const base = B.addCard(B.addCard(B.createBoard(), done, { type: 'loose', x: 0, y: 0 }), list('l', [item('x')]), { type: 'loose', x: 400, y: 0 });
    const mine = { ...base, name: 'Renamed' };
    const theirs = withItems(base, 'l', [item('x'), item('y')]);
    expect((mergeBoards(base, mine, theirs).cards.done as CompletedCard).groups.map((g) => g.date)).toEqual(['2026-10-22', '2026-10-23']);
  });
});

describe('checklists after combining (M7)', () => {
  const base = withItems(B.addCard(B.createBoard(), list('L', []), { type: 'loose', x: 0, y: 0 }), 'L', [item('i1'), item('i2'), item('i3')]);

  it('a list both sides emptied keeps one blank item to type in, the same one on both pages', () => {
    const two = withItems(base, 'L', [item('i1'), item('i2')]);
    const mine = withItems(two, 'L', [item('i2')]);
    const theirs = withItems(two, 'L', [item('i1')]);
    const a = mergeBoards(two, mine, theirs);
    const b = mergeBoards(two, theirs, mine);
    expect((a.cards.L as TodoCard).items).toEqual([{ id: 'L_i0', text: '', done: false, children: [] }]);
    expect(b).toEqual(a);
    // What is saved reads back the same (a reload doesn't change it).
    expect(readBoard(serializeBoard(a))).toEqual(a);
  });

  it('the blank item never takes an id already on the board', () => {
    const two = withItems(base, 'L', [item('i1'), item('i2')]);
    const used = { ...B.addCard(two, list('M', [item('L_i0')]), { type: 'loose', x: 400, y: 0 }) };
    const merged = mergeBoards(used, withItems(used, 'L', [item('i2')]), withItems(used, 'L', [item('i1')]));
    expect(ids(merged, 'L')).toEqual(['L_i1']);
  });

  it('my reorder survives when they only added an item', () => {
    const mine = withItems(base, 'L', [item('i3'), item('i1'), item('i2')]);
    const theirs = withItems(base, 'L', [item('i1'), item('i2'), item('i3'), item('i4')]);
    // Their new item goes after the item it followed on their page (i3), as any added item does.
    expect(ids(mergeBoards(base, mine, theirs), 'L')).toEqual(['i3', 'i4', 'i1', 'i2']);
  });

  it('their reorder still wins over mine', () => {
    const mine = withItems(base, 'L', [item('i2'), item('i1'), item('i3')]);
    const theirs = withItems(base, 'L', [item('i3'), item('i1'), item('i2')]);
    expect(ids(mergeBoards(base, mine, theirs), 'L')).toEqual(['i3', 'i1', 'i2']);
  });
});

describe('a deleted board and blocks that only re-arranged (U4)', () => {
  const sub = B.addCard(B.createBoard(), createCard('note', 'n1'), { type: 'loose', x: 0, y: 0 });

  it('stays deleted when the other side only moved its blocks', () => {
    const moved = B.updateCard(sub, 'n1', (c) => ({ ...c, x: 40, y: 80 }));
    expect(Object.keys(mergeBoardSets({ r: B.createBoard(), s: sub }, { r: B.createBoard() }, { r: B.createBoard(), s: moved }))).toEqual(['r']);
  });

  it('comes back when the other side edited it', () => {
    const typed = B.updateCard(sub, 'n1', (c) => ({ ...c, text: 'hello' }));
    expect(Object.keys(mergeBoardSets({ r: B.createBoard(), s: sub }, { r: B.createBoard() }, { r: B.createBoard(), s: typed })).sort()).toEqual(['r', 's']);
  });
});

describe('a header color set back to none (L2)', () => {
  const colored = B.recolour(B.addCard({ ...B.createBoard(), name: 'Home' }, createCard('note', 'n1'), { type: 'loose', x: 0, y: 0 }), ['n1'], 'rose');
  const none = B.recolour(colored, ['n1'], null);

  it('reads back exactly as saved', () => {
    expect(readBoard(serializeBoard(none))).toEqual(none);
  });

  it('leaves the connector able to change the boards', () => {
    expect(safeToEdit(serializeWorkspace({ home: 'home', boards: { home: none } }))).toEqual({ ok: true });
  });
});
