import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard } from './cards';
import { cleanUp } from './completed';
import {
  MAX_CELLS,
  MAX_FLYING,
  cardLines,
  startOf,
  launchGapMs,
  MAX_CHART_DAYS,
  MAX_WEDGES,
  OTHER_BOARDS,
  OTHER_LISTS,
  VIZ_DEFAULT_GROUP,
  VIZ_GROUPS,
  VIZ_GROUP_KEY,
  chartPath,
  counts,
  discOf,
  doneItems,
  inRange,
  keepIfSame,
  loopOrder,
  parseGroupBy,
  perDay,
  playhead,
  rangeStart,
  summaryOf,
} from './visualizer';
import { categoryOf } from './categorize';
import type { DoneItem } from './visualizer';
import type { Board, TodoCard, TodoItem } from './types';
import type { Workspace } from './workspace';

// The Visualizer's data (owner request, 2026-11-12): wedges are boards, cells are the lists items came from.

const item = (id: string, text = id): TodoItem => ({ id, text, done: true, children: [] });
const list = (id: string, title: string, ids: string[]): TodoCard => ({ ...(createCard('todo', id) as TodoCard), title, items: ids.map((i) => item(i)) });

let n = 0;
const makeId = (p: string) => `${p}${++n}`;

/** A board named `name` where each [list title, item ids] was cleaned up on `day` (in the order given). */
function cleaned(name: string, runs: { day: string; lists: [string, string[]][] }[]): Board {
  let b: Board = { ...B.createBoard(), name };
  let k = 0;
  for (const run of runs) {
    for (const [title, ids] of run.lists) b = B.addCard(b, list(`${name}-${title}-${run.day}-${k++}`, title, ids), { type: 'loose', x: k * 400, y: 0 });
    b = cleanUp(b, run.day, { type: 'loose', x: 0, y: 0 }, makeId).board;
  }
  return b;
}

const ws = (boards: Record<string, Board>, home = Object.keys(boards)[0]): Workspace => ({ home, boards });

describe('doneItems: an entry with completed sub-items', () => {
  const run = (parent: TodoItem, list = 'Tasks'): DoneItem[] => {
    let b: Board = { ...B.createBoard(), name: 'Home' };
    b = B.addCard(b, { ...(createCard('todo', 'c1') as TodoCard), title: list, items: [parent, item('solo')] }, { type: 'loose', x: 0, y: 0 });
    b = cleanUp(b, '2026-11-10', { type: 'loose', x: 0, y: 0 }, makeId).board;
    return doneItems(ws({ b }));
  };
  it('is replaced by its sub-items, nested ones too: the parent itself is not an item', () => {
    const got = run({ id: 'p-1', text: 'Today', done: true, children: [{ ...item('a-1'), children: [item('a1')] }, item('b-1')] });
    expect(got.map((i) => i.text)).toEqual(['a-1', 'a1', 'b-1', 'solo']);
    expect(got.map((i) => i.list)).toEqual(['Tasks', 'Tasks', 'Tasks', 'Tasks']); // the cell is still the entry's list title
    expect(new Set(got.map((i) => i.id)).size).toBe(4);
  });
  it('gives each sub-item its parents\' words as context, nearest first', () => {
    const got = run({ id: 'p-1', text: 'Clean the garage', done: true, children: [{ ...item('a-1'), children: [item('a1')] }] });
    expect(got.map((i) => [i.text, i.context])).toEqual([['a-1', ['Clean the garage']], ['a1', ['a-1', 'Clean the garage']], ['solo', []]]);
  });
  it('an item that is just a time word ("Today", "daily") is never an item, but its completed sub-items are; "Daily stretch" still is', () => {
    expect(run({ id: 'p-1', text: 'Today', done: true, children: [item('a-1'), { ...item('t-1'), text: 'Now', children: [item('a1')] }] }).map((i) => i.text)).toEqual(['a-1', 'a1', 'solo']);
    expect(run({ id: 'p-1', text: 'Daily!', done: true, children: [] }).map((i) => i.text)).toEqual(['solo']);
    expect(run({ id: 'p-1', text: 'Daily stretch', done: true, children: [] }).map((i) => i.text)).toEqual(['Daily stretch', 'solo']);
    expect(run({ id: 'p-1', text: 'Buy milk', done: true, children: [{ ...item('t-1'), text: 'Soon' }] }).map((i) => i.text)).toEqual(['Buy milk', 'solo']);
  });
  it('every ticked descendant counts, middle levels too (owner 2026-11-14)', () => {
    const got = run({ id: 'p-1', text: 'Clean the garage', done: true, children: [{ ...item('mid'), children: [{ ...item('low'), children: [item('lowest')] }] }] });
    expect(got.map((i) => i.text)).toEqual(['mid', 'low', 'lowest', 'solo']);
  });
  it('an item with no meaning on its own (meow, nowww, test, x, 123) is never an item; a real short task is', () => {
    for (const t of ['meow', 'nowww', 'Test', 'x', '123', '✅'])
      expect(run({ id: 'p-1', text: t, done: true, children: [] }).map((i) => i.text), t).toEqual(['solo']);
    expect(run({ id: 'p-1', text: 'gym', done: true, children: [] }).map((i) => i.text)).toEqual(['gym', 'solo']);
    expect(run({ id: 'p-1', text: 'meow', done: true, children: [item('aa-1')] }).map((i) => i.text)).toEqual(['aa-1', 'solo']);
  });
  it('a parent whose ticked sub-items are all empty words still counts as itself (nothing is lost)', () => {
    expect(run({ id: 'p', text: 'Groceries', done: true, children: [item('1'), item('ok')] }).map((i) => i.text)).toEqual(['Groceries', 'solo']);
  });
  it('stays one item when no sub-item is done', () => {
    const got = run({ id: 'p-1', text: 'p-1', done: true, children: [{ ...item('a-1'), done: false }] });
    expect(got.map((i) => i.text)).toEqual(['p-1', 'solo']);
  });
  it('keepIfSame sees a change in sub-items', () => {
    const a = run({ id: 'p-1', text: 'p-1', done: true, children: [item('x-1')] });
    const b = run({ id: 'p-1', text: 'p-1', done: true, children: [item('y-1')] });
    expect(keepIfSame(a, b)).toBe(b);
  });
});

describe('doneItems', () => {
  it('reads every board, in the Boards menu order, with its list and day', () => {
    const home = cleaned('Home', [{ day: '2026-11-10', lists: [['Groceries', ['milk', 'eggs']]] }]);
    const garage = cleaned('Garage', [{ day: '2026-11-11', lists: [['Tools', ['saw']]] }]);
    const got = doneItems(ws({ home, garage }));
    expect(got.map((i) => [i.boardName, i.list, i.text, i.date])).toEqual([
      ['Home', 'Groceries', 'milk', '2026-11-10'],
      ['Home', 'Groceries', 'eggs', '2026-11-10'],
      ['Garage', 'Tools', 'saw', '2026-11-11'],
    ]);
  });

  it('counts hidden boards (Journal, Habits) and boards with no name or no list title', () => {
    const home = cleaned('Home', [{ day: '2026-11-10', lists: [['', ['a-1']]] }]);
    const journal = cleaned('Journal', [{ day: '2026-11-10', lists: [['Notes', ['b-1']]] }]);
    const unnamed = cleaned('', [{ day: '2026-11-10', lists: [['Misc', ['c-1']]] }]);
    const got = doneItems(ws({ home, journal, unnamed }));
    expect(got.map((i) => [i.boardName, i.list])).toEqual([
      ['Home', 'List'],
      ['Journal', 'Notes'],
      ['Untitled board', 'Misc'],
    ]);
  });

  it('counts the completed sub-items of a ticked item (not the parent), and a board with nothing cleaned up not at all', () => {
    let b: Board = { ...B.createBoard(), name: 'Home' };
    const parent: TodoItem = { ...item('p-1'), children: [item('c1'), item('c2')] };
    b = B.addCard(b, { ...list('l-1', 'Chores', []), items: [parent] }, { type: 'loose', x: 0, y: 0 });
    b = cleanUp(b, '2026-11-10', { type: 'loose', x: 0, y: 0 }, makeId).board;
    expect(doneItems(ws({ home: b, other: B.createBoard() })).map((i) => i.text)).toEqual(['c1', 'c2']);
  });

  it('changes nothing and leaves frozen boards alone', () => {
    const home = cleaned('Home', [{ day: '2026-11-10', lists: [['Groceries', ['milk']]] }]);
    const before = JSON.stringify(home);
    const frozen = JSON.parse(before, (_k, v) => (v && typeof v === 'object' ? Object.freeze(v) : v)) as Board;
    const w = Object.freeze({ home: 'home', boards: Object.freeze({ home: frozen }) }) as Workspace;
    expect(() => discOf(loopOrder(doneItems(w)))).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
  });
});

describe('ranges', () => {
  const home = cleaned('Home', [
    { day: '2026-10-01', lists: [['A', ['old']]] },
    { day: '2026-10-14', lists: [['A', ['edge30']]] }, // 29 days before 2026-11-12
    { day: '2026-11-06', lists: [['A', ['edge7']]] }, // 6 days before
    { day: '2026-11-05', lists: [['A', ['just out']]] },
    { day: '2026-11-12', lists: [['A', ['item-now']]] },
    { day: '2026-11-13', lists: [['A', ['clock ahead']]] },
  ]);
  const all = doneItems(ws({ home }));
  const today = '2026-11-12';

  it('starts 6 days back for 7 days, 29 for 30 days, never for All', () => {
    expect(rangeStart('7', today)).toBe('2026-11-06');
    expect(rangeStart('30', today)).toBe('2026-10-14');
    expect(rangeStart('all', today)).toBeNull();
  });

  it('filters by the Completed day group, ends today, and All keeps everything', () => {
    expect(inRange(all, '7', today).map((i) => i.text).sort()).toEqual(['edge7', 'item-now']);
    expect(inRange(all, '30', today).map((i) => i.text).sort()).toEqual(['edge30', 'edge7', 'item-now', 'just out']);
    expect(inRange(all, 'all', today)).toHaveLength(6);
  });

  it('crosses a month and a year end by calendar days', () => {
    const b = cleaned('Home', [{ day: '2025-12-31', lists: [['A', ['x-1']]] }]);
    expect(inRange(doneItems(ws({ b })), '7', '2026-01-02')).toHaveLength(1);
    expect(inRange(doneItems(ws({ b })), '7', '2026-01-06')).toHaveLength(1);
    expect(inRange(doneItems(ws({ b })), '7', '2026-01-07')).toHaveLength(0);
  });

  it('counts today, this calendar week (Monday to today) and the range', () => {
    // 2026-11-12 is a Thursday: its week began Monday 2026-11-09.
    const week = cleaned('Home', [
      { day: '2026-11-08', lists: [['A', ['sun']]] },
      { day: '2026-11-09', lists: [['A', ['mon']]] },
      { day: '2026-11-12', lists: [['A', ['a-1', 'b-1']]] },
    ]);
    const items = doneItems(ws({ week }));
    expect(counts(items, inRange(items, '30', today), today)).toEqual({ today: 2, week: 3, inRange: 4 });
    expect(counts([], [], today)).toEqual({ today: 0, week: 0, inRange: 0 });
  });
});

describe('loopOrder', () => {
  it("goes oldest to newest, a day's items in the order cleaned up, boards in menu order within a day", () => {
    const home = cleaned('Home', [
      { day: '2026-11-11', lists: [['A', ['h2']]] },
      { day: '2026-11-10', lists: [['A', ['h1']]] },
      { day: '2026-11-11', lists: [['B', ['h3']]] },
    ]);
    const garage = cleaned('Garage', [{ day: '2026-11-10', lists: [['T', ['g1']]] }]);
    const got = loopOrder(doneItems(ws({ home, garage }))).map((i) => i.text);
    expect(got).toEqual(['h1', 'g1', 'h2', 'h3']);
  });

  it('does not change the list it is given', () => {
    const home = cleaned('Home', [{ day: '2026-11-11', lists: [['A', ['x-1']]] }, { day: '2026-11-10', lists: [['A', ['y-1']]] }]);
    const items = doneItems(ws({ home }));
    const copy = [...items];
    loopOrder(items);
    expect(items).toEqual(copy);
  });
});

describe('keepIfSame', () => {
  const home = cleaned('Home', [{ day: '2026-11-10', lists: [['A', ['a-1', 'b-1']]] }]);
  const items = doneItems(ws({ home }));

  it('hands back the earlier list when the new one holds the same items, so the loop does not restart for nothing', () => {
    const again = doneItems(ws({ home }));
    expect(again).not.toBe(items);
    expect(keepIfSame(items, again)).toBe(items);
  });

  it('hands back the new list when anything differs (text, list, board, day or count)', () => {
    const edited = cleaned('Home', [{ day: '2026-11-10', lists: [['A', ['a-1', 'c-1']]] }]);
    const next = doneItems(ws({ home: edited }));
    expect(keepIfSame(items, next)).toBe(next);
    expect(keepIfSame(items, items.slice(1))).not.toBe(items);
    expect(keepIfSame(undefined, items)).toBe(items);
  });
});

describe('perDay', () => {
  const today = '2026-11-12';
  const home = cleaned('Home', [
    { day: '2026-11-10', lists: [['A', ['a-1', 'b-1']]] },
    { day: '2026-11-12', lists: [['A', ['c-1']]] },
  ]);
  const items = doneItems(ws({ home }));

  it('has a point for every day of 7 and 30 days, zeros included', () => {
    const seven = perDay(inRange(items, '7', today), '7', today);
    expect(seven).toHaveLength(7);
    expect(seven.map((d) => d.count)).toEqual([0, 0, 0, 0, 2, 0, 1]);
    expect(seven[0].date).toBe('2026-11-06');
    expect(seven[6].date).toBe(today);
    expect(perDay([], '30', today)).toEqual([]);
    expect(perDay(inRange(items, '30', today), '30', today)).toHaveLength(30);
  });

  it('starts All on the first day anything was cleaned up and runs to today', () => {
    const all = perDay(items, 'all', today);
    expect(all.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(all.map((d) => d.count)).toEqual([2, 0, 1]);
    expect(perDay([], 'all', today)).toEqual([]);
  });

  it('does not blow up on bad dates from a shared board or an imported backup: they are left out, and 0001 and 9999 stay small', () => {
    const bad = cleaned('Bad', [
      { day: 'soon', lists: [['A', ['a-1']]] },
      { day: '2026-13-45', lists: [['A', ['b-1']]] },
      { day: '', lists: [['A', ['c-1']]] },
      { day: '2026-2-3', lists: [['A', ['d-1']]] },
      { day: '0001-01-01', lists: [['A', ['e-1']]] },
      { day: '9999-12-31', lists: [['A', ['f-1']]] },
      { day: '2026-11-12', lists: [['A', ['g-1']]] },
    ]);
    const got = doneItems(ws({ bad }));
    expect(got.map((i) => i.text)).toEqual(expect.arrayContaining(['f-1', 'g-1']));
    expect(got.map((i) => i.text)).not.toEqual(expect.arrayContaining(['a-1']));
    expect(got.map((i) => i.text)).not.toEqual(expect.arrayContaining(['b-1']));
    expect(got.map((i) => i.text)).not.toEqual(expect.arrayContaining(['c-1']));
    expect(got.map((i) => i.text)).not.toEqual(expect.arrayContaining(['d-1']));
    const all = perDay(got, 'all', today);
    expect(all.length).toBeLessThanOrEqual(MAX_CHART_DAYS);
    expect(all[all.length - 1].date).toBe(today);
    for (const range of ['7', '30', 'all'] as const) expect(perDay(inRange(got, range, today), range, today).length).toBeLessThanOrEqual(MAX_CHART_DAYS);
    // Even a list handed in directly with a bad date (not through doneItems) cannot make a huge chart.
    const direct = [{ ...got[0], date: '0001-01-01' }, { ...got[0], date: '9999-12-31' }, { ...got[0], date: 'soon' }];
    expect(perDay(direct, 'all', today).length).toBeLessThanOrEqual(MAX_CHART_DAYS);
  });

  it('stays small whatever the dates: at most the last two years, ending today, even for a date in 1970 or 2099', () => {
    const odd = cleaned('Odd', [
      { day: '1970-01-01', lists: [['A', ['x-1']]] },
      { day: '2099-01-01', lists: [['A', ['y-1']]] },
      { day: '2026-11-12', lists: [['A', ['z-1']]] },
    ]);
    const all = perDay(doneItems(ws({ odd })), 'all', today);
    expect(all).toHaveLength(MAX_CHART_DAYS);
    expect(all[all.length - 1].date).toBe(today);
    expect(all[all.length - 1].count).toBe(1);
  });

  it('draws a line and an area, taller days higher, and nothing for fewer than two days', () => {
    const p = chartPath(perDay(items, 'all', today), 100, 40);
    expect(p.line).toBe('M0 0 L50 40 L100 20');
    expect(p.area).toBe('M0 0 L50 40 L100 20 L100 40 L0 40 Z');
    expect(chartPath([{ date: today, count: 1 }], 100, 40).line).toBe('');
    expect(chartPath(perDay([], '7', today), 100, 40).line).toBe('');
  });
});

describe('discOf', () => {
  const home = cleaned('Home', [
    { day: '2026-11-10', lists: [['Groceries', ['a-1', 'b-1']], ['Chores', ['c-1']]] },
    { day: '2026-11-11', lists: [['Groceries', ['d-1']]] },
  ]);
  const garage = cleaned('Garage', [{ day: '2026-11-10', lists: [['Tools', ['e-1']]] }]);
  const items = loopOrder(doneItems(ws({ home, garage })));

  it('makes a wedge per board and a cell per list, the busiest list first', () => {
    const { wedges } = discOf(items, 'board');
    expect(wedges.map((w) => [w.name, w.count])).toEqual([['Home', 4], ['Garage', 1]]);
    expect(wedges[0].cells).toEqual([{ list: 'Groceries', count: 3 }, { list: 'Chores', count: 1 }]);
    expect(wedges[1].cells).toEqual([{ list: 'Tools', count: 1 }]);
  });

  it('says for every item, in loop order, which wedge and cell it lands in', () => {
    const { wedges, slots } = discOf(items, 'board');
    expect(slots).toHaveLength(items.length);
    items.forEach((it, i) => {
      expect(wedges[slots[i].wedge].name).toBe(it.boardName);
      expect(wedges[slots[i].wedge].cells[slots[i].cell].list).toBe(it.list);
    });
  });

  it('is empty for no items', () => {
    expect(discOf([], 'board')).toEqual({ wedges: [], slots: [] });
    expect(discOf([], 'category')).toEqual({ wedges: [], slots: [] });
  });

  it('colors board wedges one after another, round the eight hues', () => {
    expect(discOf(items, 'board').wedges.map((w) => w.hue)).toEqual([0, 1]);
    const boards: Record<string, Board> = {};
    for (let i = 0; i < 10; i++) boards[`b${i}`] = cleaned(`B${i}`, [{ day: '2026-11-10', lists: [['L', [`x${i}`]]] }]);
    expect(discOf(loopOrder(doneItems(ws(boards))), 'board').wedges.map((w) => w.hue)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1]);
  });

  it('folds boards past the wedge limit into one "Other boards" wedge, and lists past the cell limit into "Other lists"', () => {
    const boards: Record<string, Board> = {};
    for (let i = 0; i < MAX_WEDGES + 4; i++) boards[`b${String(i).padStart(2, '0')}`] = cleaned(`Board ${i}`, [{ day: '2026-11-10', lists: [['L', Array.from({ length: i + 1 }, (_, k) => `b${i}i${k}`)]] }]);
    const { wedges, slots } = discOf(loopOrder(doneItems(ws(boards))), 'board');
    expect(wedges).toHaveLength(MAX_WEDGES);
    expect(wedges[MAX_WEDGES - 1].name).toBe(OTHER_BOARDS);
    expect(wedges.reduce((s, w) => s + w.count, 0)).toBe(slots.length);
    expect(wedges.slice(0, -1).some((w) => w.name === 'Board 0')).toBe(false); // the quietest boards are the ones folded

    const lists: [string, string[]][] = Array.from({ length: MAX_CELLS + 5 }, (_, i) => [`List ${i}`, [`x${i}`]]);
    const wide = discOf(loopOrder(doneItems(ws({ w: cleaned('Wide', [{ day: '2026-11-10', lists }]) }))), 'board');
    expect(wide.wedges[0].cells).toHaveLength(MAX_CELLS);
    expect(wide.wedges[0].cells[MAX_CELLS - 1]).toEqual({ list: OTHER_LISTS, count: 6 });
  });

  it('keeps the Calendar wedge inside the wedge limit when there are many boards', () => {
    const calEvent: DoneItem = { id: 'calendar:e1', text: 'Standup', boardId: 'calendar', boardName: 'Calendar', list: '', date: '2026-11-10', boardRank: Number.MAX_SAFE_INTEGER, order: 0, event: true };
    for (const n of [MAX_WEDGES, MAX_WEDGES + 4]) {
      const boards: Record<string, Board> = {};
      for (let i = 0; i < n; i++) boards[`b${String(i).padStart(2, '0')}`] = cleaned(`Board ${i}`, [{ day: '2026-11-10', lists: [['L', Array.from({ length: i + 1 }, (_, k) => `b${i}i${k}`)]] }]);
      const { wedges } = discOf(loopOrder([...doneItems(ws(boards)), calEvent]), 'board');
      expect(wedges.length).toBeLessThanOrEqual(MAX_WEDGES);
      expect(wedges[wedges.length - 1].name).toBe('Calendar'); // events are always the last wedge
      expect(wedges.filter((w) => w.name === OTHER_BOARDS)).toHaveLength(1); // the overflow boards still fold into one wedge
    }
  });

  it('describes it in words for a screen reader', () => {
    expect(summaryOf(discOf(items, 'board').wedges, items.length)).toBe('5 items cleaned up: Home 4, Garage 1.');
    expect(summaryOf([], 0)).toBe('Nothing cleaned up in this range.');
    expect(summaryOf([{ key: 'h-1', name: 'Home', count: 1, cells: [], hue: 0 }], 1)).toBe('1 item cleaned up: Home 1.');
  });
});

describe('discOf by category', () => {
  const home = cleaned('Home', [
    { day: '2026-11-10', lists: [['Groceries', ['a-1', 'b-1']], ['Chores', ['c-1']]] },
    { day: '2026-11-11', lists: [['Groceries', ['d-1']]] },
  ]);
  const garage = cleaned('Garage', [{ day: '2026-11-10', lists: [['Tools', ['e-1']], ['Groceries', ['f-1']]] }]);
  const items = loopOrder(doneItems(ws({ home, garage })));

  it('groups by category when not told otherwise, like the switch does', () => {
    expect(discOf(items)).toEqual(discOf(items, 'category'));
  });

  it('makes a wedge per category that has items, in the categories\' own order, Other last', () => {
    const { wedges } = discOf(items, 'category');
    expect(wedges.map((w) => [w.key, w.name, w.count])).toEqual([
      ['errands', 'Errands & shopping', 4],
      ['home', 'Home & chores', 1],
      ['other', 'Other', 1],
    ]);
  });

  it('makes the cells the lists the items came from, from every board (same title, one cell), busiest first', () => {
    const { wedges } = discOf(items, 'category');
    expect(wedges[0].cells).toEqual([{ list: 'Groceries', count: 4 }]);
    expect(wedges[1].cells).toEqual([{ list: 'Chores', count: 1 }]);
    expect(wedges[2].cells).toEqual([{ list: 'Tools', count: 1 }]);
  });

  it('says for every item, in loop order, which wedge and cell it lands in', () => {
    const { wedges, slots } = discOf(items, 'category');
    items.forEach((it, i) => {
      expect(wedges[slots[i].wedge].name).toBe({ 'a-1': 'Errands & shopping', 'b-1': 'Errands & shopping', 'c-1': 'Home & chores', 'd-1': 'Errands & shopping', 'e-1': 'Other', 'f-1': 'Errands & shopping' }[it.text]);
      expect(wedges[slots[i].wedge].cells[slots[i].cell].list).toBe(it.list);
    });
  });

  it('gives a category the same color whichever others have items, and Other the neutral ninth hue', () => {
    expect(discOf(items, 'category').wedges.map((w) => w.hue)).toEqual([0, 3, 8]);
    const onlyHome = items.filter((i) => i.text === 'c-1');
    expect(discOf(onlyHome, 'category').wedges.map((w) => w.hue)).toEqual([3]);
  });

  it('asks the categorizer once per item, with its text and list title, and sends an id it does not know to Other', () => {
    const asked: string[] = [];
    const { wedges } = discOf(
      items,
      'category',
      (item, title) => {
        asked.push(`${item.text}|${title}`);
        return item.text === 'a-1' ? 'work' : 'made-up';
      },
    );
    expect(asked.sort()).toEqual(['a-1|Groceries', 'b-1|Groceries', 'c-1|Chores', 'd-1|Groceries', 'e-1|Tools', 'f-1|Groceries']);
    expect(wedges.map((w) => [w.name, w.count])).toEqual([['Work', 1], ['Other', 5]]);
  });

  it('makes a wedge per named label (Sort with AI), busiest first, then the built-in categories, Other last and neutral', () => {
    const named: Record<string, string> = { 'a-1': 'Snacks', 'b-1': 'Snacks', 'c-1': 'Tidying' };
    const { wedges } = discOf(items, 'category', (item, title) => (named[item.text] ? { name: named[item.text] } : categoryOf(item, title)));
    expect(wedges.map((w) => [w.key, w.name, w.count, w.hue])).toEqual([
      ['ai:Snacks', 'Snacks', 2, 0],
      ['ai:Tidying', 'Tidying', 1, 1],
      ['errands', 'Errands & shopping', 2, 2],
      ['other', 'Other', 1, 8],
    ]);
  });

  it('folds lists past the cell limit into "Other lists"', () => {
    const lists: [string, string[]][] = Array.from({ length: MAX_CELLS + 3 }, (_, i) => [`List ${i}`, [`x${i}`]]);
    const wide = discOf(loopOrder(doneItems(ws({ w: cleaned('Wide', [{ day: '2026-11-10', lists }]) }))), 'category');
    expect(wide.wedges).toHaveLength(1);
    expect(wide.wedges[0].cells).toHaveLength(MAX_CELLS);
    expect(wide.wedges[0].cells[MAX_CELLS - 1]).toEqual({ list: OTHER_LISTS, count: 4 });
  });

  it('describes the categories in words for a screen reader', () => {
    expect(summaryOf(discOf(items, 'category').wedges, items.length)).toBe('6 items cleaned up: Errands & shopping 4, Home & chores 1, Other 1.');
  });
});

describe('the group-by switch', () => {
  it('offers By category and By board, opening on By category', () => {
    expect(VIZ_GROUPS.map((g) => g.label)).toEqual(['By category', 'By board']);
    expect(VIZ_DEFAULT_GROUP).toBe('category');
    expect(VIZ_GROUP_KEY).toBe('note-board:viz-group');
  });

  it('reads what this device saved, and falls back to By category for anything else', () => {
    expect(parseGroupBy('board')).toBe('board');
    expect(parseGroupBy('category')).toBe('category');
    expect(parseGroupBy(null)).toBe('category');
    expect(parseGroupBy('wedges')).toBe('category');
    expect(parseGroupBy('')).toBe('category');
  });
});

describe('pace: a steady stream, never a pause (owner request 2026-11-13, "things should always be flowing in")', () => {
  const FLIGHT = 3990; // the real trip
  const STRIKE_MS = 1050; // the beam lands this far in

  it('launches an item at least every second, about every 0.2s, and about 20 trips overlap', () => {
    expect(launchGapMs(FLIGHT)).toBeGreaterThan(190);
    expect(launchGapMs(FLIGHT)).toBeLessThan(210);
    expect(MAX_FLYING).toBeGreaterThanOrEqual(24);
    expect(launchGapMs(FLIGHT)).toBeLessThanOrEqual(1000);
    expect(launchGapMs(FLIGHT)).toBeGreaterThan(0);
    expect(FLIGHT / launchGapMs(FLIGHT)).toBeGreaterThanOrEqual(19); // about 20 in flight
    expect(Math.ceil(FLIGHT / launchGapMs(FLIGHT))).toBeLessThan(MAX_FLYING);
    expect(startOf(0, FLIGHT)).toBe(0);
    expect(startOf(3, FLIGHT) - startOf(2, FLIGHT)).toBe(launchGapMs(FLIGHT));
  });

  for (const n of [1, 5, 36, 200]) {
    it(`with ${n} item${n === 1 ? '' : 's-1'}: never a gap over 1s between launches, never none in flight, never over MAX_FLYING`, () => {
      let landedMost = 0;
      let steady = 0;
      for (let t = 0; t <= 120_000; t += 20) {
        const p = playhead(t, n, FLIGHT, STRIKE_MS);
        expect(p.flying.length).toBeGreaterThan(0); // also during warm-up: the first beam leaves at 0
        expect(p.flying.length).toBeLessThanOrEqual(MAX_FLYING);
        expect(p.flying.every((f) => f.progress >= 0 && f.progress < 1 && f.index >= 0 && f.index < n)).toBe(true);
        // the newest launch is never older than a second
        expect(Math.min(...p.flying.map((f) => f.progress)) * FLIGHT).toBeLessThanOrEqual(1000);
        landedMost = p.landed;
        if (t > FLIGHT) steady = Math.max(steady, p.flying.length);
        if (t > FLIGHT) expect(p.flying.length).toBeGreaterThanOrEqual(19); // and about 20 once going
      }
      for (let k = 1; k < 400; k++) expect(startOf(k, FLIGHT) - startOf(k - 1, FLIGHT)).toBeLessThanOrEqual(1000);
      expect(landedMost).toBeGreaterThan(n); // it went round the list at least once
      expect(steady).toBeLessThanOrEqual(MAX_FLYING);
    });
  }

  it('goes round the list again when it runs out: item 0 follows the last item', () => {
    const n = 5;
    const seen: number[] = [];
    for (let t = 0; t < 20_000; t += 10) {
      for (const f of playhead(t, n, FLIGHT, STRIKE_MS).flying) if (f.progress < 0.01 && seen[seen.length - 1] !== f.index) seen.push(f.index);
    }
    expect(seen.slice(0, 12)).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1]);
  });

  it('counts landings in a row, one per launch, and the count keeps growing', () => {
    expect(playhead(STRIKE_MS - 1, 3, FLIGHT, STRIKE_MS).landed).toBe(0);
    expect(playhead(STRIKE_MS, 3, FLIGHT, STRIKE_MS).landed).toBe(1);
    const g = launchGapMs(FLIGHT);
    expect(playhead(STRIKE_MS + g, 3, FLIGHT, STRIKE_MS).landed).toBe(2);
    expect(playhead(STRIKE_MS + 10 * g, 3, FLIGHT, STRIKE_MS).landed).toBe(11);
  });

  it('keeps the newest trips when more than MAX_FLYING have started, and does nothing with no items', () => {
    const p = playhead(60_000, 100, 40_000, 0); // a very long trip: 40 launches in the air, far more than MAX_FLYING
    expect(p.flying.length).toBe(MAX_FLYING);
    expect(playhead(5000, 0, FLIGHT, STRIKE_MS)).toEqual({ landed: 0, flying: [] });
  });
});

describe('cardLines', () => {
  const it1 = { id: 'a-1', text: 'Buy milk', boardId: 'b-1', boardName: 'Home', list: 'Groceries', date: '2026-11-01', boardRank: 0, order: 0 };

  it('reads the item, then "category · board" (or "list · board" By board)', () => {
    expect(cardLines(it1, 'Errands & shopping', 'category')).toEqual(['Buy milk', 'Errands & shopping · Home']);
    expect(cardLines(it1, 'Home', 'board')).toEqual(['Buy milk', 'Groceries · Home']);
  });

  it('names an item with no text, and leaves out an empty part', () => {
    expect(cardLines({ ...it1, text: '  ' }, 'Other', 'category')[0]).toBe('Untitled item');
    expect(cardLines({ ...it1, boardName: '' }, 'Other', 'category')[1]).toBe('Other');
  });
});

describe("the Calm button", () => {
  it("is saved as note-board:viz-calm, on only for 1; anything unreadable means off", async () => {
    const { VIZ_CALM_KEY, parseCalm } = await import("./visualizer");
    expect(VIZ_CALM_KEY).toBe("note-board:viz-calm");
    expect(parseCalm("1")).toBe(true);
    for (const v of [null, "0", "", "banana", "true"]) expect(parseCalm(v)).toBe(false);
  });
});

describe("the Sort automatically box", () => {
  it("is saved as note-board:viz-ai-auto, off only for 0; anything unreadable means on", async () => {
    const { VIZ_AI_AUTO_KEY, parseAutoSort } = await import("./visualizer");
    expect(VIZ_AI_AUTO_KEY).toBe("note-board:viz-ai-auto");
    expect(parseAutoSort("0")).toBe(false);
    for (const v of [null, "1", "", "banana", "false"]) expect(parseAutoSort(v)).toBe(true);
  });
});
