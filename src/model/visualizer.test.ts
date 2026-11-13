import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard } from './cards';
import { cleanUp } from './completed';
import {
  MAX_CELLS,
  MAX_FLYING,
  WAVE_GAP_MS,
  WAVE_MAX,
  cardLines,
  startOf,
  waveSize,
  MAX_CHART_DAYS,
  MAX_WEDGES,
  LOOP_REST_MS,
  OTHER_BOARDS,
  OTHER_LISTS,
  VIZ_DEFAULT_GROUP,
  VIZ_GROUPS,
  VIZ_GROUP_KEY,
  chartPath,
  counts,
  discOf,
  doneItems,
  gapMs,
  inRange,
  keepIfSame,
  loopMs,
  loopOrder,
  parseGroupBy,
  perDay,
  playhead,
  rangeStart,
  summaryOf,
} from './visualizer';
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
    const home = cleaned('Home', [{ day: '2026-11-10', lists: [['', ['a']]] }]);
    const journal = cleaned('Journal', [{ day: '2026-11-10', lists: [['Notes', ['b']]] }]);
    const unnamed = cleaned('', [{ day: '2026-11-10', lists: [['Misc', ['c']]] }]);
    const got = doneItems(ws({ home, journal, unnamed }));
    expect(got.map((i) => [i.boardName, i.list])).toEqual([
      ['Home', 'List'],
      ['Journal', 'Notes'],
      ['Untitled board', 'Misc'],
    ]);
  });

  it('counts a ticked item with sub-items once, and a board with nothing cleaned up not at all', () => {
    let b: Board = { ...B.createBoard(), name: 'Home' };
    const parent: TodoItem = { ...item('p'), children: [item('c1'), item('c2')] };
    b = B.addCard(b, { ...list('l', 'Chores', []), items: [parent] }, { type: 'loose', x: 0, y: 0 });
    b = cleanUp(b, '2026-11-10', { type: 'loose', x: 0, y: 0 }, makeId).board;
    expect(doneItems(ws({ home: b, other: B.createBoard() })).map((i) => i.text)).toEqual(['p']);
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
    { day: '2026-11-12', lists: [['A', ['today']]] },
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
    expect(inRange(all, '7', today).map((i) => i.text).sort()).toEqual(['edge7', 'today']);
    expect(inRange(all, '30', today).map((i) => i.text).sort()).toEqual(['edge30', 'edge7', 'just out', 'today']);
    expect(inRange(all, 'all', today)).toHaveLength(6);
  });

  it('crosses a month and a year end by calendar days', () => {
    const b = cleaned('Home', [{ day: '2025-12-31', lists: [['A', ['x']]] }]);
    expect(inRange(doneItems(ws({ b })), '7', '2026-01-02')).toHaveLength(1);
    expect(inRange(doneItems(ws({ b })), '7', '2026-01-06')).toHaveLength(1);
    expect(inRange(doneItems(ws({ b })), '7', '2026-01-07')).toHaveLength(0);
  });

  it('counts today, this calendar week (Monday to today) and the range', () => {
    // 2026-11-12 is a Thursday: its week began Monday 2026-11-09.
    const week = cleaned('Home', [
      { day: '2026-11-08', lists: [['A', ['sun']]] },
      { day: '2026-11-09', lists: [['A', ['mon']]] },
      { day: '2026-11-12', lists: [['A', ['a', 'b']]] },
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
    const home = cleaned('Home', [{ day: '2026-11-11', lists: [['A', ['x']]] }, { day: '2026-11-10', lists: [['A', ['y']]] }]);
    const items = doneItems(ws({ home }));
    const copy = [...items];
    loopOrder(items);
    expect(items).toEqual(copy);
  });
});

describe('keepIfSame', () => {
  const home = cleaned('Home', [{ day: '2026-11-10', lists: [['A', ['a', 'b']]] }]);
  const items = doneItems(ws({ home }));

  it('hands back the earlier list when the new one holds the same items, so the loop does not restart for nothing', () => {
    const again = doneItems(ws({ home }));
    expect(again).not.toBe(items);
    expect(keepIfSame(items, again)).toBe(items);
  });

  it('hands back the new list when anything differs (text, list, board, day or count)', () => {
    const edited = cleaned('Home', [{ day: '2026-11-10', lists: [['A', ['a', 'c']]] }]);
    const next = doneItems(ws({ home: edited }));
    expect(keepIfSame(items, next)).toBe(next);
    expect(keepIfSame(items, items.slice(1))).not.toBe(items);
    expect(keepIfSame(undefined, items)).toBe(items);
  });
});

describe('perDay', () => {
  const today = '2026-11-12';
  const home = cleaned('Home', [
    { day: '2026-11-10', lists: [['A', ['a', 'b']]] },
    { day: '2026-11-12', lists: [['A', ['c']]] },
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
      { day: 'soon', lists: [['A', ['a']]] },
      { day: '2026-13-45', lists: [['A', ['b']]] },
      { day: '', lists: [['A', ['c']]] },
      { day: '2026-2-3', lists: [['A', ['d']]] },
      { day: '0001-01-01', lists: [['A', ['e']]] },
      { day: '9999-12-31', lists: [['A', ['f']]] },
      { day: '2026-11-12', lists: [['A', ['g']]] },
    ]);
    const got = doneItems(ws({ bad }));
    expect(got.map((i) => i.text)).toEqual(expect.arrayContaining(['f', 'g']));
    expect(got.map((i) => i.text)).not.toEqual(expect.arrayContaining(['a']));
    expect(got.map((i) => i.text)).not.toEqual(expect.arrayContaining(['b']));
    expect(got.map((i) => i.text)).not.toEqual(expect.arrayContaining(['c']));
    expect(got.map((i) => i.text)).not.toEqual(expect.arrayContaining(['d']));
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
      { day: '1970-01-01', lists: [['A', ['x']]] },
      { day: '2099-01-01', lists: [['A', ['y']]] },
      { day: '2026-11-12', lists: [['A', ['z']]] },
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
    { day: '2026-11-10', lists: [['Groceries', ['a', 'b']], ['Chores', ['c']]] },
    { day: '2026-11-11', lists: [['Groceries', ['d']]] },
  ]);
  const garage = cleaned('Garage', [{ day: '2026-11-10', lists: [['Tools', ['e']]] }]);
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

  it('describes it in words for a screen reader', () => {
    expect(summaryOf(discOf(items, 'board').wedges, items.length)).toBe('5 items cleaned up: Home 4, Garage 1.');
    expect(summaryOf([], 0)).toBe('Nothing cleaned up in this range.');
    expect(summaryOf([{ key: 'h', name: 'Home', count: 1, cells: [], hue: 0 }], 1)).toBe('1 item cleaned up: Home 1.');
  });
});

describe('discOf by category', () => {
  const home = cleaned('Home', [
    { day: '2026-11-10', lists: [['Groceries', ['a', 'b']], ['Chores', ['c']]] },
    { day: '2026-11-11', lists: [['Groceries', ['d']]] },
  ]);
  const garage = cleaned('Garage', [{ day: '2026-11-10', lists: [['Tools', ['e']], ['Groceries', ['f']]] }]);
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
      expect(wedges[slots[i].wedge].name).toBe({ a: 'Errands & shopping', b: 'Errands & shopping', c: 'Home & chores', d: 'Errands & shopping', e: 'Other', f: 'Errands & shopping' }[it.text]);
      expect(wedges[slots[i].wedge].cells[slots[i].cell].list).toBe(it.list);
    });
  });

  it('gives a category the same color whichever others have items, and Other the neutral ninth hue', () => {
    expect(discOf(items, 'category').wedges.map((w) => w.hue)).toEqual([0, 3, 8]);
    const onlyHome = items.filter((i) => i.text === 'c');
    expect(discOf(onlyHome, 'category').wedges.map((w) => w.hue)).toEqual([3]);
  });

  it('asks the categorizer once per item, with its text and list title, and sends an id it does not know to Other', () => {
    const asked: string[] = [];
    const { wedges } = discOf(
      items,
      'category',
      (item, title) => {
        asked.push(`${item.text}|${title}`);
        return item.text === 'a' ? 'work' : 'made-up';
      },
    );
    expect(asked.sort()).toEqual(['a|Groceries', 'b|Groceries', 'c|Chores', 'd|Groceries', 'e|Tools', 'f|Groceries']);
    expect(wedges.map((w) => [w.name, w.count])).toEqual([['Work', 1], ['Other', 5]]);
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

describe('pace', () => {
  it('is about a second an item for a short loop, quicker for many, never under 60 ms', () => {
    expect(gapMs(3)).toBe(1000);
    expect(gapMs(45)).toBe(1000);
    expect(gapMs(90)).toBe(500);
    expect(gapMs(100000)).toBe(60);
    expect(gapMs(0)).toBe(1000);
  });

  it('lasts about 45 seconds for 45 to 750 items, and a short loop rests at the end', () => {
    for (const n of [45, 100, 300, 750]) {
      expect(loopMs(n, 900)).toBeGreaterThan(30000);
      expect(loopMs(n, 900)).toBeLessThan(60000);
    }
    expect(loopMs(0, 900)).toBe(0);
    expect(loopMs(1, 900)).toBe(900 + LOOP_REST_MS);
  });

  it('lands items one after another and says when to start again', () => {
    expect(playhead(0, 3, 900)).toEqual({ landed: 0, flying: [{ index: 0, progress: 0 }], wrapped: false });
    expect(playhead(450, 3, 900).flying).toEqual([{ index: 0, progress: 0.5 }]);
    const mid = playhead(1450, 3, 900);
    expect(mid.landed).toBe(1);
    expect(mid.flying).toEqual([{ index: 1, progress: 0.5 }]);
    const end = playhead(2000 + 900, 3, 900);
    expect(end.landed).toBe(3);
    expect(end.flying).toEqual([]);
    expect(end.wrapped).toBe(false);
    expect(playhead(loopMs(3, 900), 3, 900).wrapped).toBe(true);
  });

  it('can land an item part-way through its trip: the beam hits its cell, the comet is still on its way', () => {
    // 1000 ms trip, the cell is hit 200 ms in.
    expect(playhead(199, 3, 1000, 200).landed).toBe(0);
    const hit = playhead(200, 3, 1000, 200);
    expect(hit.landed).toBe(1);
    expect(hit.flying).toEqual([{ index: 0, progress: 0.2 }]); // still animating after it landed
    const next = playhead(1000 + 200, 3, 1000, 200); // item 1 starts at 1000 ms (gap 1000)
    expect(next.landed).toBe(2);
    expect(next.flying.map((f) => f.index)).toEqual([1]);
    expect(playhead(2000 + 1000, 3, 1000, 200).flying).toEqual([]);
    expect(playhead(2000 + 1000, 3, 1000, 200).landed).toBe(3);
  });

  it('has several in the air at once when the pace is quick, never more than MAX_FLYING', () => {
    const p = playhead(5000, 1000, 900);
    expect(p.flying.length).toBe(MAX_FLYING);
    expect(p.flying.every((f) => f.progress >= 0 && f.progress < 1)).toBe(true);
    // the ones kept are the newest that have started
    const idx = p.flying.map((f) => f.index);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(Math.max(...idx)).toBeGreaterThanOrEqual(p.landed - 1);
    // landing is not capped: every item still lands
    expect(p.landed).toBeGreaterThan(50);
  });
});

describe('waves (owner request 2026-11-13: many arrivals overlap)', () => {
  it('lands one at a time for a few items, in waves of several for more, up to WAVE_MAX', () => {
    expect(waveSize(1)).toBe(1);
    expect(waveSize(3)).toBe(1);
    expect(waveSize(30)).toBeGreaterThanOrEqual(4);
    expect(waveSize(30)).toBeLessThanOrEqual(WAVE_MAX);
    expect(waveSize(100000)).toBe(WAVE_MAX);
    expect(waveSize(0)).toBe(1);
  });

  it('starts the items of one wave a moment apart and the next wave one wave-gap later', () => {
    const n = 30;
    const wave = waveSize(n);
    expect(startOf(0, n)).toBe(0);
    expect(startOf(1, n)).toBe(Math.min(WAVE_GAP_MS, gapMs(n)));
    expect(startOf(wave, n)).toBe(wave * gapMs(n));
    for (let i = 1; i < n; i++) expect(startOf(i, n)).toBeGreaterThan(startOf(i - 1, n)); // always in order
  });

  it('has several beams in the air together for 30 items, then settles down to one at the end', () => {
    const n = 30;
    const flight = 1400;
    let most = 0;
    for (let t = 0; t < loopMs(n, flight); t += 50) most = Math.max(most, playhead(t, n, flight).flying.length);
    expect(most).toBeGreaterThanOrEqual(4);
    expect(most).toBeLessThanOrEqual(MAX_FLYING);
    const calm = startOf(n - 1, n) + flight + 100;
    expect(playhead(calm, n, flight).flying).toEqual([]);
    expect(playhead(calm, n, flight).landed).toBe(n);
  });

  it('lands every item once, in order, and finishes within the loop, for any count', () => {
    for (const n of [1, 2, 7, 30, 100, 750]) {
      const flight = 1400;
      let seen = 0;
      for (let t = 0; t <= loopMs(n, flight); t += 37) {
        const p = playhead(t, n, flight, flight * 0.25);
        expect(p.landed).toBeGreaterThanOrEqual(seen);
        seen = p.landed;
      }
      expect(seen).toBe(n);
      expect(loopMs(n, flight)).toBe(startOf(n - 1, n) + flight + LOOP_REST_MS);
    }
  });
});

describe('cardLines', () => {
  const it1 = { id: 'a', text: 'Buy milk', boardId: 'b', boardName: 'Home', list: 'Groceries', date: '2026-11-01', boardRank: 0, order: 0 };

  it('reads the item, then "category · board" (or "list · board" By board)', () => {
    expect(cardLines(it1, 'Errands & shopping', 'category')).toEqual(['Buy milk', 'Errands & shopping · Home']);
    expect(cardLines(it1, 'Home', 'board')).toEqual(['Buy milk', 'Groceries · Home']);
  });

  it('names an item with no text, and leaves out an empty part', () => {
    expect(cardLines({ ...it1, text: '  ' }, 'Other', 'category')[0]).toBe('Untitled item');
    expect(cardLines({ ...it1, boardName: '' }, 'Other', 'category')[1]).toBe('Other');
  });
});
