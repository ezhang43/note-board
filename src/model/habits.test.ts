import { describe, expect, it } from 'vitest';
import { addCard, createBoard } from './board';
import { createBoardCard, createCard } from './cards';
import { HABITS_NAME, WEIGHT_TITLE, habitList, habitViewLabel, habitViewRange, habitYear, doneToday, habitColor, hiddenHabits, isHabit, periodCount, weekCount, withHabitColor, isHabitViewNow, moveHabitView, parseKg, isWeightDay, tickedDays, weightCard, weightChart, weightEntries, withDay, withWeight, withoutWeight } from './habits';
import type { Board, TodoCard } from './types';
import type { Workspace } from './workspace';

// Habits (owner request, 2026-10-19): daily habits kept on a board called "Habits", one checklist
// card per habit, one item per ticked day ("YYYY-MM-DD", local).

const habit = (title: string, days: string[] = []): TodoCard => ({
  ...(createCard('todo') as TodoCard),
  title,
  items: days.map((d, i) => ({ id: `i${i}${d}`, text: d, done: true, children: [] })),
});
const boardWith = (...cards: TodoCard[]): Board => cards.reduce((b, c) => addCard(b, c, { type: 'loose', x: 0, y: 0 }), { ...createBoard(), name: HABITS_NAME });

describe('habits', () => {
  it('a habit is a checklist whose items are all ticked days', () => {
    expect(isHabit(habit('Walk'))).toBe(true);
    expect(isHabit(habit('Walk', ['2026-10-19']))).toBe(true);
    // A checklist loads with one blank item when it has none, so a habit with no ticks comes back so.
    const blank = { id: 'b', text: '', done: false, children: [] };
    const loaded = { ...habit('Walk', ['2026-10-19']), items: [blank, ...habit('', ['2026-10-19']).items] };
    expect(isHabit(loaded)).toBe(true);
    expect([...tickedDays(loaded)]).toEqual(['2026-10-19']);
    expect(withDay(withDay(loaded, '2026-10-19', false), '2026-10-18', true).items.map((i) => i.text)).toEqual(['', '2026-10-18']);
    // A day unticked on the board itself (open the Habits board, untick an item) is not a tick, but still a habit.
    const unticked = { ...habit('Walk', ['2026-10-19']), items: [{ id: 'u', text: '2026-10-18', done: false, children: [] }, ...habit('', ['2026-10-19']).items] };
    expect(isHabit(unticked)).toBe(true);
    expect([...tickedDays(unticked)]).toEqual(['2026-10-19']);
    expect([...tickedDays(withDay(unticked, '2026-10-18', true))].sort()).toEqual(['2026-10-18', '2026-10-19']);
    // Ticking it again ticks that same item rather than adding a second one.
    expect(withDay(unticked, '2026-10-18', true).items.filter((i) => i.text === '2026-10-18')).toEqual([{ id: 'u', text: '2026-10-18', done: true, children: [] }]);
    expect(withDay(unticked, '2026-10-18', false)).toBe(unticked); // not ticked: unchanged
    const other = createCard('todo') as TodoCard;
    expect(isHabit({ ...other, items: [{ ...other.items[0], text: 'buy milk' }] })).toBe(false);
    expect(isHabit(createCard('note'))).toBe(false);
  });

  it('lists the habits in board order, leaving other cards out', () => {
    const a = habit('A');
    const b = habit('B');
    const board = addCard(boardWith(a, b), createCard('note'), { type: 'loose', x: 0, y: 0 });
    expect(habitList(board).map((h) => h.title)).toEqual(['A', 'B']);
  });

  it('ticked days are counted once, even when two devices ticked the same day', () => {
    expect([...tickedDays(habit('A', ['2026-10-19', '2026-10-19', '2026-10-18']))].sort()).toEqual(['2026-10-18', '2026-10-19']);
  });

  it('ticking adds one day; unticking removes every copy of it', () => {
    const h = habit('A', ['2026-10-19', '2026-10-19']);
    const off = withDay(h, '2026-10-19', false);
    expect(off.items).toEqual([]);
    const on = withDay(off, '2026-10-17', true);
    expect(on.items.map((i) => [i.text, i.done, i.children])).toEqual([['2026-10-17', true, []]]);
    expect(withDay(on, '2026-10-17', true)).toBe(on); // already ticked: unchanged
  });

  it('moves a view by a week, a month or a year', () => {
    expect(moveHabitView('week', '2026-10-20', 1)).toBe('2026-10-27');
    expect(moveHabitView('week', '2026-10-20', -3)).toBe('2026-09-29');
    expect(moveHabitView('month', '2026-10-20', 1)).toBe('2026-11-20');
    expect(moveHabitView('month', '2026-12-31', 2)).toBe('2027-02-28'); // the short month clamps
    expect(moveHabitView('month', '2026-01-15', -1)).toBe('2025-12-15');
    expect(moveHabitView('year', '2026-10-20', 1)).toBe('2027-10-20');
    expect(moveHabitView('year', '2028-02-29', 1)).toBe('2029-02-28');
  });

  it('labels a view', () => {
    expect(habitViewLabel('week', '2026-10-21')).toBe('19–25 Oct 2026');
    expect(habitViewLabel('week', '2026-09-30')).toBe('28 Sep – 4 Oct 2026');
    expect(habitViewLabel('week', '2026-12-31')).toBe('28 Dec 2026 – 3 Jan 2027');
    expect(habitViewLabel('month', '2026-10-20')).toBe('October 2026');
    expect(habitViewLabel('year', '2026-10-20')).toBe('2026');
  });

  it('knows when a view is the current one (so Today is only offered when away from it)', () => {
    const today = '2026-10-20';
    expect(isHabitViewNow('week', '2026-10-25', today)).toBe(true);
    expect(isHabitViewNow('week', '2026-10-26', today)).toBe(false);
    expect(isHabitViewNow('month', '2026-10-01', today)).toBe(true);
    expect(isHabitViewNow('month', '2026-09-30', today)).toBe(false);
    expect(isHabitViewNow('year', '2026-01-01', today)).toBe(true);
    expect(isHabitViewNow('year', '2025-10-20', today)).toBe(false);
  });

  it('a year is twelve months, each with all of its days', () => {
    const year = habitYear('2026-10-20');
    expect(year.map((m) => m.month)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`));
    expect(year.map((m) => m.days.length)).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    expect(year[9].days[0]).toBe('2026-10-01');
    expect(year[9].days[30]).toBe('2026-10-31');
    expect(habitYear('2028-03-01')[1].days.length).toBe(29); // a leap year
  });

  it('the Habits board is hidden only while it holds nothing but habits and no card opens it', () => {
    const board = boardWith(habit('A'));
    const ws: Workspace = { home: 'home', boards: { home: createBoard(), h: board } };
    expect(hiddenHabits(ws, [])).toBe('h');
    expect(hiddenHabits(ws, ['h'])).toBeNull(); // a share holds it
    expect(hiddenHabits({ ...ws, boards: { ...ws.boards, h: addCard(board, createCard('note'), { type: 'loose', x: 0, y: 0 }) } }, [])).toBeNull();
    const opened = addCard(createBoard(), createBoardCard('h'), { type: 'loose', x: 0, y: 0 });
    expect(hiddenHabits({ ...ws, boards: { ...ws.boards, home: opened } }, [])).toBeNull();
    expect(hiddenHabits({ home: 'h', boards: { h: board } }, [])).toBeNull(); // never the home board
  });
});

// Weight (owner request, 2026-10-21): one card titled "Weight" on the Habits board, one item per day, "2026-10-19 72.4".

const blank = { id: 'b', text: '', done: false, children: [] };
const weight = (...entries: string[]): TodoCard => ({
  ...(createCard('todo') as TodoCard),
  title: WEIGHT_TITLE,
  items: [blank, ...entries.map((e, i) => ({ id: `w${i}`, text: e, done: false, children: [] }))],
});

describe('weight', () => {
  it('a weight can be entered for today or any earlier real day, never a later one (job 177)', () => {
    expect(isWeightDay('2026-10-21', '2026-10-21')).toBe(true);
    expect(isWeightDay('2026-10-01', '2026-10-21')).toBe(true);
    expect(isWeightDay('2000-01-01', '2026-10-21')).toBe(true);
    for (const bad of ['2026-10-22', '2999-01-01', '2026-02-30', '2026-13-01', '', 'x', '21 Oct', '2026-1-5', '1999-12-31']) expect(isWeightDay(bad, '2026-10-21')).toBe(false);
  });

  it('weights entered out of date order are listed and charted by date; entering an earlier day again replaces it (job 177)', () => {
    let card = { ...(createCard('todo') as TodoCard), title: WEIGHT_TITLE };
    for (const [d, kg] of [['2026-10-20', 72], ['2026-10-05', 74.1], ['2026-10-12', 73.3], ['2026-10-05', 74.5]] as const) card = withWeight(card, d, kg);
    expect(weightEntries(card)).toEqual([
      { day: '2026-10-05', kg: 74.5 },
      { day: '2026-10-12', kg: 73.3 },
      { day: '2026-10-20', kg: 72 },
    ]);
    expect(weightChart(weightEntries(card), 'month', '2026-10-21').points.map((p) => p.day)).toEqual(['2026-10-05', '2026-10-12', '2026-10-20']);
    expect(card.items.filter((i) => i.text.startsWith('2026-10-05'))).toHaveLength(1);
  });

  it('reads kilograms with a dot or a comma, 20.0 to 400.0, rounded to one decimal; anything else is refused', () => {
    expect(parseKg('72.4')).toBe(72.4);
    expect(parseKg(' 72,4 ')).toBe(72.4);
    expect(parseKg('72')).toBe(72);
    expect(parseKg('72.46')).toBe(72.5);
    expect(parseKg('20')).toBe(20);
    expect(parseKg('400')).toBe(400);
    for (const bad of ['', '  ', '19.9', '19.96x', '400.1', '0', '-5', 'abc', '72.4kg', '7e1', '1,000.5', '72..4', '.5', 'Infinity', '19.94']) expect(parseKg(bad)).toBeNull();
  });

  it('is a checklist titled Weight with day-and-kilogram items, and is not a habit', () => {
    const card = weight('2026-10-19 72.4');
    expect(isHabit(card)).toBe(false);
    expect(habitList(boardWith(habit('Walk'), card))).toHaveLength(1);
    expect(weightCard(boardWith(habit('Walk'), card))?.id).toBe(card.id);
    expect(weightCard(boardWith(habit('Walk')))).toBeUndefined();
    // A habit the person named Weight is still a habit, not the weight card.
    expect(weightCard(boardWith(habit('Weight', ['2026-10-19'])))).toBeUndefined();
    expect(isHabit(habit('Weight', ['2026-10-19']))).toBe(true);
    expect(weightCard(boardWith(weight()))).toBeUndefined(); // no entry: nothing to read
  });

  it('lists entries by day, ignoring malformed items and keeping the last of a doubled day', () => {
    const card = weight('2026-10-20 72.1', 'banana', '2026-10-19 72.4', '2026-10-19 99.9', '2026-13-45 72.0', '2026-02-30 72.0','2026-10-18 19.9', '2026-10-17 400.1', '2026-10-16 72.45', '2026-10-15 72.4 kg');
    expect(weightEntries(card)).toEqual([
      { day: '2026-10-19', kg: 99.9 },
      { day: '2026-10-20', kg: 72.1 },
    ]);
    expect(weightEntries(undefined)).toEqual([]);
  });

  it('a day is entered once; entering it again replaces it, in the same place', () => {
    const one = withWeight(weight(), '2026-10-19', 72.4);
    expect(one.items.map((i) => i.text)).toEqual(['', '2026-10-19 72.4']);
    const two = withWeight(one, '2026-10-20', 72);
    expect(two.items.map((i) => i.text)).toEqual(['', '2026-10-19 72.4', '2026-10-20 72.0']);
    const again = withWeight(two, '2026-10-19', 71.9);
    expect(again.items.map((i) => i.text)).toEqual(['', '2026-10-19 71.9', '2026-10-20 72.0']);
    expect(again.items[1].id).toBe(two.items[1].id);
    // A doubled day (two devices) collapses to one item.
    expect(withWeight(weight('2026-10-19 70.0', '2026-10-19 71.0'), '2026-10-19', 72).items.map((i) => i.text)).toEqual(['', '2026-10-19 72.0']);
  });

  it('removes a day, and nothing else', () => {
    const card = weight('2026-10-19 72.4', '2026-10-20 72.0');
    expect(withoutWeight(card, '2026-10-20').items.map((i) => i.text)).toEqual(['', '2026-10-19 72.4']);
    expect(withoutWeight(card, '2026-10-01')).toBe(card);
  });

  it('the view range is the week, month or year shown, both ends included', () => {
    expect(habitViewRange('week', '2026-10-21')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(habitViewRange('month', '2026-10-21')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(habitViewRange('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(habitViewRange('year', '2026-10-21')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('the chart holds only the entries in the shown period, placed by day and by weight', () => {
    const entries = [
      { day: '2026-10-18', kg: 80 }, // the week before
      { day: '2026-10-19', kg: 72 },
      { day: '2026-10-22', kg: 73 },
      { day: '2026-10-25', kg: 71 },
      { day: '2026-10-26', kg: 90 }, // the week after
    ];
    const week = weightChart(entries, 'week', '2026-10-21');
    expect(week.points.map((p) => p.day)).toEqual(['2026-10-19', '2026-10-22', '2026-10-25']);
    expect(week.points.map((p) => p.x)).toEqual([0, 0.5, 1]);
    expect(week.min).toBe(71);
    expect(week.max).toBe(73);
    expect(week.points.map((p) => p.y)).toEqual([0.5, 1, 0]); // 0 is the lowest weight, 1 the highest
    expect(weightChart(entries, 'month', '2026-10-21').points).toHaveLength(5);
    expect(weightChart(entries, 'year', '2026-10-21').points).toHaveLength(5);
    expect(weightChart(entries, 'month', '2026-09-21').points).toHaveLength(0);
    const one = weightChart([{ day: '2026-10-19', kg: 72.4 }], 'week', '2026-10-21');
    expect(one.points[0].y).toBe(0.5); // a single weight sits in the middle
    expect([one.min, one.max]).toEqual([72.4, 72.4]);
    expect(weightChart([], 'week', '2026-10-21')).toMatchObject({ points: [], min: null, max: null });
  });

  it('the chart says where today falls across the period, or null when today is not in it (job 179)', () => {
    expect(weightChart([], 'week', '2026-10-21', '2026-10-21').todayX).toBeCloseTo(2 / 6);
    expect(weightChart([], 'week', '2026-10-19', '2026-10-19').todayX).toBe(0);
    expect(weightChart([], 'month', '2026-10-21', '2026-10-31').todayX).toBe(1);
    expect(weightChart([], 'month', '2026-10-21', '2026-10-21').todayX).toBeCloseTo(20 / 30);
    expect(weightChart([], 'year', '2026-03-01', '2026-12-31').todayX).toBe(1);
    expect(weightChart([], 'week', '2026-10-28', '2026-10-21').todayX).toBeNull(); // a week ahead
    expect(weightChart([], 'week', '2026-10-14', '2026-10-21').todayX).toBeNull(); // a week back
    expect(weightChart([], 'week', '2026-10-21').todayX).toBeNull(); // no today given
  });

  it('a leap day is a real day, and the chart reaches both ends of a leap year or February (job #156)', () => {
    expect(weightEntries(weight('2028-02-29 70.0', '2027-02-29 71.0'))).toEqual([{ day: '2028-02-29', kg: 70 }]);
    const year = weightChart([{ day: '2028-01-01', kg: 70 }, { day: '2028-12-31', kg: 71 }], 'year', '2028-06-01');
    expect(year.points.map((p) => p.x)).toEqual([0, 1]);
    expect(weightChart([{ day: '2028-02-29', kg: 70 }], 'month', '2028-02-10').points[0].x).toBe(1);
  });

  it('the Habits board stays hidden with a Weight card on it, but not with a card that has anything else', () => {
    const ws = (b: Board): Workspace => ({ home: 'home', boards: { home: createBoard(), h: b } });
    expect(hiddenHabits(ws(boardWith(habit('A'), weight('2026-10-19 72.4'))), [])).toBe('h');
    expect(hiddenHabits(ws(boardWith(weight('2026-10-19 72.4'))), [])).toBe('h'); // before any habit
    expect(hiddenHabits(ws(boardWith(weight('2026-10-19 72.4', 'banana'))), [])).toBeNull(); // something out of sight
    expect(hiddenHabits(ws(boardWith({ ...weight('2026-10-19 72.4'), title: 'Weights' })), [])).toBeNull();
    expect(hiddenHabits(ws(boardWith(weight('2026-10-19 72.4'), weight('2026-10-20 72.0'))), [])).toBeNull(); // a second Weight card is out of sight
  });
});

// Habits redesign (owner picks, 2026-10-22, jobs 166 + 167): per-habit colors and the counts the Ledger shows.
describe('habit colors and counts', () => {
  it('a habit has one of the 8 bold swatches as its color, or none (the default green); anything else counts as none', () => {
    const h = habit('Walk');
    expect(habitColor(h)).toBeNull();
    expect(habitColor(withHabitColor(h, 'ocean'))).toBe('ocean');
    expect(withHabitColor(h, 'ocean').titleColor).toBe('ocean');
    expect(withHabitColor(withHabitColor(h, 'ocean'), null).titleColor).toBeNull();
    expect(withHabitColor(h, null)).toBe(h); // unchanged
    expect(habitColor({ ...h, titleColor: 'butter' })).toBeNull(); // a pastel is not one of the 8
    expect(withHabitColor(h, 'butter' as never)).toBe(h);
    expect(withHabitColor({ ...h, titleColor: 'butter' }, null).titleColor).toBeNull(); // "Default" clears a color that isn't one of the 8
  });

  it('counts the ticks in the week shown (Monday to Sunday), a day ahead included', () => {
    const h = habit('Walk', ['2026-10-18', '2026-10-19', '2026-10-21', '2026-10-25', '2026-10-26']);
    expect(weekCount(h, '2026-10-21')).toBe(3);
    expect(weekCount(h, '2026-10-12')).toBe(1);
    expect(weekCount(habit('Read'), '2026-10-21')).toBe(0);
  });

  it('counts the ticks in the month or year shown, with the days that have passed in a month', () => {
    const h = habit('Walk', ['2026-09-30', '2026-10-01', '2026-10-21', '2027-01-01']);
    expect(periodCount(h, 'month', '2026-10-05', '2026-10-21')).toEqual({ ticked: 2, of: 21 });
    expect(periodCount(h, 'month', '2026-09-05', '2026-10-21')).toEqual({ ticked: 1, of: 30 }); // a past month: all its days
    expect(periodCount(h, 'month', '2026-11-05', '2026-10-21')).toEqual({ ticked: 0, of: 0 }); // a month ahead
    expect(periodCount(h, 'year', '2026-03-03', '2026-10-21')).toEqual({ ticked: 3, of: 294 });
    expect(periodCount(h, 'year', '2025-03-03', '2026-10-21')).toEqual({ ticked: 0, of: 365 });
  });

  it('counts the habits done on a day', () => {
    const hs = [habit('A', ['2026-10-21']), habit('B', ['2026-10-20']), habit('C', ['2026-10-21', '2026-10-20'])];
    expect(doneToday(hs, '2026-10-21')).toBe(2);
    expect(doneToday([], '2026-10-21')).toBe(0);
  });
});
