import { addDays, addMonths, dayLabel, MONTH_NAMES, MONTHS, weekStart, type DayKey } from './calendar';
import { dayKey } from './completed';
import { BLOCK_GAP, CARD_W, GRID, NEW_BLOCK_H } from './constants';
import { spotForNewBlock, topLevelRects, type MeasuredHeight } from './layout';
import type { Board, Point } from './types';
import { boardTree, type Workspace } from './workspace';

// Daily journal (owner request, 2026-10-18): the Journal button opens a side panel that writes
// into the board called "Journal": one dated note a day, today's at the top.

/** The board the Journal button uses. */
export const JOURNAL_NAME = 'Journal';

/** Today's heading, in the calendar's style with the year: "Sun 18 Oct 2026" (local time). */
export function journalDateLine(now: Date): string {
  const key = dayKey(now);
  return `${dayLabel(key)} ${key.slice(0, 4)}`;
}

/**
 * The board named exactly "Journal" that is the person's own: the first in the Boards menu order,
 * skipping any board a share holds (`shared`: their ids). Null when there is none.
 */
export function findJournalBoard(ws: Workspace, shared: string[]): string | null {
  // simple: with several boards named Journal the first in the menu is used; they are not merged.
  return boardTree(ws).find(({ id }) => ws.boards[id].name === JOURNAL_NAME && !shared.includes(id))?.id ?? null;
}

/** A note's first line, without trailing spaces or a Windows line end. */
const firstLine = (text: string) => text.split('\n')[0].trimEnd();
const isDay = (text: string, dateLine: string) => firstLine(text) === dateLine || firstLine(text).startsWith(`${dateLine} `);

/** The note on `board` whose first line is `dateLine`, with or without a title after it (today's note), or null. */
export function todaysNote(board: Board, dateLine: string): string | null {
  const note = Object.values(board.cards).find((c) => c.kind === 'note' && isDay(c.text, dateLine));
  return note?.id ?? null;
}

/**
 * Where today's note goes: straight above every other block, level with the leftmost, so the
 * newest sits on top and nothing moves. On an empty board, the middle of the screen (`centre`).
 */
export function journalSpot(board: Board, measured: MeasuredHeight, centre: Point): Point {
  const rects = topLevelRects(board, measured);
  if (!rects.length) return spotForNewBlock(board, CARD_W, NEW_BLOCK_H.note, centre, measured);
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  // Clear of the block below even after rounding to the grid.
  return spotForNewBlock(board, CARD_W, NEW_BLOCK_H.note, { x: left + CARD_W / 2, y: top - GRID - BLOCK_GAP - NEW_BLOCK_H.note / 2 }, measured);
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DATE_LINE = new RegExp(`^(?:${DAYS.join('|')}) (\\d{1,2}) (${MONTHS.join('|')}) (\\d{4})(?: |$)`);

/** What is written under a note's date line (the date line and the blank line after it left out). */
export function journalBody(text: string): string {
  const i = text.indexOf('\n');
  return i < 0 ? '' : text.slice(i + 1).replace(/^\r?\n/, '');
}

/** The first line with words in what is written under a note's date line, trimmed: what a folded day shows after its date ('' when nothing is written). */
export function journalPeek(body: string): string {
  return body.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
}

/**
 * The note's text with `body` under its date line, which is kept as it is, then a blank line, so
 * journalBody reads back exactly `body` (a line break typed at its start included).
 */
export function withJournalBody(text: string, body: string): string {
  return `${text.split('\n')[0].replace(/\r$/, '')}\n\n${body}`;
}

/**
 * The dated notes on a Journal board: today's (`today`: its date line) first, then the others,
 * newest day first. Each is the note's id, its date line and what is written under it.
 */
export function journalEntries(board: Board, today = ''): { id: string; date: string; body: string }[] {
  const out: { id: string; date: string; body: string; day: number }[] = [];
  for (const c of Object.values(board.cards)) {
    const m = c.kind === 'note' ? DATE_LINE.exec(firstLine(c.text)) : null;
    if (c.kind !== 'note' || !m) continue;
    out.push({ id: c.id, date: firstLine(c.text), body: journalBody(c.text), day: Number(m[3]) * 10000 + MONTHS.indexOf(m[2]) * 100 + Number(m[1]) });
  }
  const rank = (e: (typeof out)[number]) => (today && isDay(e.date, today) ? 1e9 : e.day);
  return out.sort((a, b) => rank(b) - rank(a)).map(({ id, date, body }) => ({ id, date, body }));
}

/**
 * The Journal board kept out of the Boards menu: the one the panel uses (see findJournalBoard),
 * when no card opens it and it holds only dated notes, so nothing on it is out of sight. A Journal
 * board with a card on Home (as the Journal button used to make) stays listed. Never the home board.
 */
export function hiddenJournal(ws: Workspace, shared: string[]): string | null {
  const id = findJournalBoard(ws, shared);
  if (!id || id === ws.home) return null;
  const board = ws.boards[id];
  if (Object.keys(board.columns).length || journalEntries(board).length !== Object.keys(board.cards).length) return null;
  const opened = Object.values(ws.boards).some((b) => Object.values(b.cards).some((c) => c.kind === 'board' && c.boardId === id));
  return opened ? null : id;
}

// Entries grouped Year > Month > Week (owner request, 2026-10-19). Weeks run Monday to Sunday, as in
// the calendar. A week that spans two months is split: each month lists its own days.

/** The day a date line names, as 'YYYY-MM-DD' (a day out of range rolls over, as the calendar's days do), or null. */
export function journalDayKey(date: string): DayKey | null {
  const m = DATE_LINE.exec(date);
  if (!m) return null;
  return addDays(`${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`, 0);
}

export interface JournalWeek<T> { id: string; label: string; entries: T[] }
export interface JournalMonth<T> { id: string; label: string; weeks: JournalWeek<T>[] }
export interface JournalYear<T> { id: string; label: string; months: JournalMonth<T>[] }

/** The ids of the year, month and week group a day sits in: "2026", "2026-10", "2026-10/2026-10-12" (the week's Monday). */
const groupIds = (key: DayKey) => [key.slice(0, 4), key.slice(0, 7), `${key.slice(0, 7)}/${weekStart(key)}`] as const;

/** "12–18 Oct": the week's days that fall in the month of `key`. */
function weekLabel(key: DayKey): string {
  const first = `${key.slice(0, 7)}-01`;
  const monday = weekStart(key);
  const from = monday < first ? first : monday;
  const sunday = addDays(monday, 6);
  const lastOfMonth = addDays(addMonths(first, 1), -1);
  const to = sunday > lastOfMonth ? lastOfMonth : sunday;
  const month = MONTHS[Number(key.slice(5, 7)) - 1];
  return from === to ? `${Number(from.slice(8))} ${month}` : `${Number(from.slice(8))}–${Number(to.slice(8))} ${month}`;
}

/**
 * The entries (as journalEntries lists them) grouped Year > Month > Week, newest first, except that
 * today's year, then its month, week and day come first at their level, even when days are written
 * ahead (owner choice, 2026-10-20). Entries on one day keep the order given. An entry without a
 * readable date line is left out.
 */
export function groupJournal<T extends { date: string }>(entries: T[], today: DayKey | '' = ''): JournalYear<T>[] {
  const here = today ? groupIds(today) : [];
  // Sort key, biggest first: in today's year / month / week, is today, then the day itself.
  const rank = (key: DayKey) => groupIds(key).map((id, i) => (id === here[i] ? 1 : 0)).join('') + (key === today ? 1 : 0) + key;
  const dated = entries.flatMap((e) => {
    const key = journalDayKey(e.date);
    return key ? [{ e, key }] : [];
  });
  dated.sort((a, b) => (rank(a.key) < rank(b.key) ? 1 : rank(a.key) > rank(b.key) ? -1 : 0));
  const years: JournalYear<T>[] = [];
  for (const { e, key } of dated) {
    const [yearId, monthId, weekId] = groupIds(key);
    let year = years.find((y) => y.id === yearId);
    if (!year) years.push((year = { id: yearId, label: yearId, months: [] }));
    let month = year.months.find((m) => m.id === monthId);
    if (!month) year.months.push((month = { id: monthId, label: MONTH_NAMES[Number(key.slice(5, 7)) - 1], weeks: [] }));
    let week = month.weeks.find((w) => w.id === weekId);
    if (!week) month.weeks.push((week = { id: weekId, label: weekLabel(key), entries: [] }));
    week.entries.push(e);
  }
  return years;
}

/** What the person chose to open (true) or shut (false), by group id; only choices that differ from the default are kept. */
export type JournalOpen = Record<string, boolean>;

/** Open unless chosen otherwise: the groups holding `today` (the year, month and week it is in). */
export function isGroupOpen(choices: JournalOpen, id: string, today: DayKey): boolean {
  return choices[id] ?? (groupIds(today) as readonly string[]).includes(id);
}

/** The choices after `id` is flipped. */
export function toggleGroup(choices: JournalOpen, id: string, today: DayKey): JournalOpen {
  const next = { ...choices };
  const open = !isGroupOpen(choices, id, today);
  if (open === (groupIds(today) as readonly string[]).includes(id)) delete next[id];
  else next[id] = open;
  return next;
}

/** The choices with today's groups no longer shut, so opening the panel always shows today. */
export function openToday(choices: JournalOpen, today: DayKey): JournalOpen {
  const next = { ...choices };
  for (const id of groupIds(today)) if (next[id] === false) delete next[id];
  return next;
}

const GROUP_ID = /^\d{4}(-\d{2}(\/\d{4}-\d{2}-\d{2})?)?$/;

/** The remembered choices; anything missing or bad is dropped, so the defaults apply. */
export function parseJournalOpen(raw: string | null): JournalOpen {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // simple: a damaged value is ignored; the defaults are used.
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data).filter(([id, v]) => GROUP_ID.test(id) && typeof v === 'boolean'));
}
