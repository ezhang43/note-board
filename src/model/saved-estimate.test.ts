import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard } from './cards';
import { setItemsDone } from './checklist';
import { mergeBoards } from './merge';
import type { Board, NoteCard, TodoCard, TodoItem } from './types';
import { WORKSPACE_VERSION, asVersion, readWorkspace, serializeWorkspace } from './workspace';

// Time estimates on notes and checklist items, and the day an item was ticked (job saved-estimate-doneon):
// how they are saved, loaded, checked and combined.

const item = (id: string, extra: Partial<TodoItem> = {}): TodoItem => ({ id, text: id, done: false, children: [], ...extra });
const note = (id: string, extra: Partial<NoteCard> = {}): NoteCard => ({ ...(createCard('note', id) as NoteCard), text: id, ...extra });
const list = (id: string, items: TodoItem[]): TodoCard => ({ ...(createCard('todo', id) as TodoCard), title: id, items });

function board(n: NoteCard, items: TodoItem[]): Board {
  let b = B.createBoard();
  b = B.addCard(b, n, { type: 'loose', x: 0, y: 0 });
  return B.addCard(b, list('t1', items), { type: 'loose', x: 300, y: 0 });
}
const saved = (b: Board) => JSON.parse(serializeWorkspace({ home: 'home', boards: { home: b } }));
/** The workspace text with board `home`'s cards replaced by `cards` (as raw, possibly bad, saved data). */
function withCards(cards: Record<string, unknown>, version = WORKSPACE_VERSION): string {
  const data = saved(B.createBoard());
  data.boards.home.cards = cards;
  data.boards.home.order = Object.keys(cards);
  data.version = version;
  return JSON.stringify(data);
}
const loaded = (raw: string) => readWorkspace(raw)!.ws.boards.home;

describe('saving and loading', () => {
  it('boards are saved as version 6', () => {
    expect(WORKSPACE_VERSION).toBe(6);
    expect(saved(B.createBoard()).version).toBe(6);
  });

  it('an estimate on a note and on items (and a ticked day) comes back as saved', () => {
    const b = board(note('n1', { estimate: 45 }), [item('a', { estimate: 30, done: true, doneOn: '2026-11-10', children: [item('a1', { estimate: 5 })] })]);
    const back = loaded(serializeWorkspace({ home: 'home', boards: { home: b } }));
    expect((back.cards.n1 as NoteCard).estimate).toBe(45);
    const [a] = (back.cards.t1 as TodoCard).items;
    expect(a.estimate).toBe(30);
    expect(a.doneOn).toBe('2026-11-10');
    expect(a.children[0].estimate).toBe(5);
  });

  it('boards saved as version 5 (before estimates) open unchanged, and save as 6 with nothing added', () => {
    const b = board(note('n1'), [item('a', { done: true }), item('b')]);
    const v5 = asVersion(serializeWorkspace({ home: 'home', boards: { home: b } }), 5);
    const got = readWorkspace(v5);
    expect(got).not.toBeNull();
    const again = JSON.parse(serializeWorkspace(got!.ws));
    expect(again).toEqual({ ...JSON.parse(v5), version: 6 });
    expect(serializeWorkspace(got!.ws)).not.toMatch(/estimate|doneOn/);
  });

  it('boards saved by a version above 6 are refused, so they are never saved over', () => {
    expect(readWorkspace(asVersion(serializeWorkspace({ home: 'home', boards: { home: B.createBoard() } }), 7))).toBeNull();
  });
});

describe('loaded and imported values are checked', () => {
  const bad = [0, -10, 2.5, 24 * 60 + 1, '30', null, true, NaN];
  it('a bad estimate on a note is dropped; the note is kept', () => {
    for (const estimate of bad) {
      const raw = withCards({ n1: { kind: 'note', text: 'hi', x: 0, y: 0, estimate } });
      const n = loaded(raw).cards.n1 as NoteCard;
      expect(n.text).toBe('hi');
      expect('estimate' in n).toBe(false);
    }
  });

  it('a bad estimate or ticked day on an item is dropped; the item, its tick and sub-items are kept', () => {
    for (const estimate of bad) {
      const raw = withCards({ t1: { kind: 'todo', title: 'L', x: 0, y: 0, items: [{ id: 'a', text: 'a', done: true, doneOn: 'yesterday', estimate, children: [{ id: 'a1', text: 'a1', done: true, children: [], doneOn: '2026-02-30' }] }] } });
      const [a] = (loaded(raw).cards.t1 as TodoCard).items;
      expect(a).toEqual({ id: 'a', text: 'a', done: true, children: [{ id: 'a1', text: 'a1', done: true, children: [] }] });
    }
  });

  it('good values in a Completed card’s items are kept, bad ones dropped', () => {
    const entry = (extra: object) => ({ item: { id: 'x', text: 'x', done: true, children: [], ...extra }, fromCardId: 't', fromTitle: 'T', fromParentId: null });
    const raw = withCards({ k1: { kind: 'completed', x: 0, y: 0, groups: [{ date: '2026-11-10', entries: [entry({ estimate: 20, doneOn: '2026-11-09' }), { ...entry({ estimate: -1, doneOn: 5 }), item: { id: 'y', text: 'y', done: true, children: [], estimate: -1, doneOn: 5 } }] }] } });
    const groups = (loaded(raw).cards.k1 as { groups: { entries: { item: TodoItem }[] }[] }).groups;
    expect(groups[0].entries[0].item).toMatchObject({ estimate: 20, doneOn: '2026-11-09' });
    expect(groups[0].entries[1].item).toEqual({ id: 'y', text: 'y', done: true, children: [] });
  });

  it('a ticked day on an open item is kept as saved (another device may have unticked it at the same time), so the board reads back exactly', () => {
    const raw = withCards({ t1: { kind: 'todo', title: 'L', x: 0, y: 0, items: [{ id: 'a', text: 'a', done: false, doneOn: '2026-11-10', children: [] }] } });
    expect((loaded(raw).cards.t1 as TodoCard).items[0].doneOn).toBe('2026-11-10');
  });
});

describe('combining two people’s edits keeps the new fields', () => {
  const base = () => board(note('n1'), [item('a'), item('b')]);
  const items = (b: Board) => (b.cards.t1 as TodoCard).items;
  const tick = (b: Board, id: string, day: string) => B.updateCard(b, 't1', (c) => ({ ...c, items: setItemsDone((c as TodoCard).items, [id], true, day) }) as TodoCard);

  it('their estimate on a note and my estimate on an item are both kept', () => {
    const b = base();
    const theirs = B.updateCard(b, 'n1', (c) => ({ ...c, estimate: 25 }) as NoteCard);
    const mine = B.updateCard(b, 't1', (c) => ({ ...c, items: [{ ...(c as TodoCard).items[0], estimate: 10 }, (c as TodoCard).items[1]] }) as TodoCard);
    const out = mergeBoards(b, mine, theirs);
    expect((out.cards.n1 as NoteCard).estimate).toBe(25);
    expect(items(out)[0].estimate).toBe(10);
  });

  it('their tick (with its day) and my tick of another item are both kept, each with its day', () => {
    const b = base();
    const out = mergeBoards(b, tick(b, 'a', '2026-11-11'), tick(b, 'b', '2026-11-10'));
    expect(items(out).map((i) => [i.done, i.doneOn])).toEqual([
      [true, '2026-11-11'],
      [true, '2026-11-10'],
    ]);
  });

  it('their estimate cleared while I tick the same item: both kept', () => {
    const b = B.updateCard(base(), 't1', (c) => ({ ...c, items: [{ ...(c as TodoCard).items[0], estimate: 30 }, (c as TodoCard).items[1]] }) as TodoCard);
    const theirs = B.updateCard(b, 't1', (c) => ({ ...c, items: [{ ...(c as TodoCard).items[0], estimate: undefined }, (c as TodoCard).items[1]] }) as TodoCard);
    const out = mergeBoards(b, tick(b, 'a', '2026-11-11'), theirs);
    expect(items(out)[0]).toMatchObject({ done: true, doneOn: '2026-11-11' });
    expect('estimate' in items(out)[0]).toBe(false);
  });
});
