import { addDays, addMonths, dayLabel, MONTH_NAMES, MONTHS, weekStart, type DayKey } from './calendar';
import { dayKey } from './completed';
import { BLOCK_GAP, CARD_W, GRID, NEW_BLOCK_H } from './constants';
import { addCard, deleteBlocks, updateCard } from './board';
import { blockRect, spotForNewBlock, topLevelRects, type MeasuredHeight } from './layout';
import type { Board, Card, NoteCard, Point } from './types';
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
  const note = Object.values(board.cards).find((c) => c.kind === 'note' && !isGeneral(c) && isDay(c.text, dateLine));
  return note?.id ?? null;
}

/**
 * Where today's note goes: straight above every other block, level with the leftmost, so the
 * newest sits on top and nothing moves. On an empty board, the middle of the screen (`centre`).
 */
export function journalSpot(board: Board, measured: MeasuredHeight, centre: Point): Point {
  // The general notes are left out, wherever they were moved, so they never shift the days' column.
  const rects = topLevelRects(board, measured, generalNotes(board));
  if (!rects.length) return spotForNewBlock(board, CARD_W, NEW_BLOCK_H.note, centre, measured);
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  // Clear of the block below even after rounding to the grid.
  return spotForNewBlock(board, CARD_W, NEW_BLOCK_H.note, { x: left + CARD_W / 2, y: top - GRID - BLOCK_GAP - NEW_BLOCK_H.note / 2 }, measured);
}

// General notes (owner request, 2026-10-29): notes on the Journal board, not tied to a day, shown at
// the top of the panel. The first was known by its first line alone, "General notes"; since there can
// be several, each with a name (2026-11-10), a note added or renamed in the panel also carries its place
// in the list (`general`). Otherwise they are ordinary notes: sync, backups, export and import, copying
// and Version history carry them like any other.

/** The first line of the general notes. A date line never is this, so they are never mistaken for a day. */
export const JOURNAL_NOTES = 'General notes';

/** The name a general note gets when added, or when its name is cleared (owner decision, 2026-11-10). */
export const UNTITLED_NOTE = 'Untitled note';

/**
 * A general note added or renamed in the panel (owner request, 2026-11-10: several, with names): it
 * carries its place in the list, so it is known whatever its first line (its name) says.
 */
const isGeneral = (c: Card): boolean => c.kind === 'note' && typeof c.general === 'number';

/**
 * The note whose first line is exactly "General notes" and has no place in the list: the one general
 * note a Journal had before there could be several. With more than one (written on two devices before
 * they synced, or a copy), the smallest id, so every device shows the same one; the others are ordinary notes.
 */
function firstStyleNote(board: Board): string | null {
  let id: string | null = null;
  for (const c of Object.values(board.cards)) if (c.kind === 'note' && !isGeneral(c) && firstLine(c.text) === JOURNAL_NOTES && (id === null || c.id < id)) id = c.id;
  return id;
}

/**
 * The general notes on `board`, in the panel's order: those with a place, by place (ties by id). With
 * none (a Journal saved before there could be several, or by an older copy of the app, which drops the
 * place), the "General notes" note found by its first line (see firstStyleNote). Adding or renaming
 * numbers that one, so once any has a place, another note named "General notes" stays an ordinary note.
 */
export function generalNotes(board: Board): string[] {
  const placed = Object.values(board.cards)
    .filter((c): c is NoteCard => isGeneral(c))
    .sort((a, b) => a.general! - b.general! || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c) => c.id);
  if (placed.length) return placed;
  const first = firstStyleNote(board);
  return first ? [first] : [];
}

/** The first general note, or null. */
export const generalNote = (board: Board): string | null => generalNotes(board)[0] ?? null;

/** A general note's name: its first line. */
export const noteName = (text: string): string => firstLine(text).trim();

/** A name as typed, on one line and trimmed; an empty one is "Untitled note". */
export function cleanNoteName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim() || UNTITLED_NOTE;
}

/** `board` with the general notes `ids` numbered 1, 2, 3… in that order (only those whose number changes are touched). */
function numbered(board: Board, ids: string[]): Board {
  const cards = { ...board.cards };
  let changed = false;
  ids.forEach((id, i) => {
    const c = cards[id];
    if (c?.kind === 'note' && c.general !== i + 1) {
      cards[id] = { ...c, general: i + 1 };
      changed = true;
    }
  });
  return changed ? { ...board, cards } : board;
}

/**
 * Adds `note` (a new "Untitled note") as a general note right after the general note `after`, loose
 * at `at`, and numbers them all. Unchanged when `after` isn't a general note.
 */
export function addGeneralNote(board: Board, after: string, note: NoteCard, at: Point): Board {
  const ids = generalNotes(board);
  const i = ids.indexOf(after);
  if (i < 0 || board.cards[note.id]) return board;
  const added = addCard(board, { ...note, general: 0 }, { type: 'loose', ...at });
  return numbered(added, [...ids.slice(0, i + 1), note.id, ...ids.slice(i + 1)]);
}

/**
 * Renames the general note `id`: its first line becomes `name` (see cleanNoteName), and what is
 * written under it, with its formatting, stays. All are numbered, so a renamed "General notes" note
 * is still known. Unchanged when the name is the same or `id` isn't a general note.
 */
export function renameGeneralNote(board: Board, id: string, name: string): Board {
  const ids = generalNotes(board);
  const c = board.cards[id];
  if (!ids.includes(id) || c?.kind !== 'note') return board;
  const next = cleanNoteName(name);
  if (next === firstLine(c.text)) return board;
  const i = c.text.indexOf('\n');
  const text = `${next}${i < 0 ? '\n\n' : c.text.slice(i)}`;
  return numbered(updateCard(board, id, (card) => ({ ...card, text }) as NoteCard), ids);
}

/** Deletes the general note `id`, unless it is the last one (or isn't a general note). */
export function deleteGeneralNote(board: Board, id: string): Board {
  const ids = generalNotes(board);
  return ids.length > 1 && ids.includes(id) ? deleteBlocks(board, [id]) : board;
}

/**
 * Where a general note added after `after` goes on the Journal board: straight below it, on a free
 * spot; when `after` isn't on the board loose, where the first general notes go (see generalSpot).
 */
export function generalSpotBelow(board: Board, after: string, measured: MeasuredHeight, centre: Point): Point {
  const r = board.order.includes(after) ? blockRect(board, after, measured) : null;
  if (!r) return generalSpot(board, measured, centre);
  return spotForNewBlock(board, CARD_W, NEW_BLOCK_H.note, { x: r.x + CARD_W / 2, y: r.y + r.h + GRID + BLOCK_GAP + NEW_BLOCK_H.note / 2 }, measured);
}

/**
 * Where the general notes go when first written: to the right of everything on the Journal board,
 * level with its top, so the days' column (today's note straight above it, see journalSpot) is left alone.
 */
export function generalSpot(board: Board, measured: MeasuredHeight, centre: Point): Point {
  const rects = topLevelRects(board, measured);
  if (!rects.length) return spotForNewBlock(board, CARD_W, NEW_BLOCK_H.note, centre, measured);
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const top = Math.min(...rects.map((r) => r.y));
  return spotForNewBlock(board, CARD_W, NEW_BLOCK_H.note, { x: right + GRID + BLOCK_GAP + CARD_W / 2, y: top + NEW_BLOCK_H.note / 2 }, measured);
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DATE_LINE = new RegExp(`^(?:${DAYS.join('|')}) (\\d{1,2}) (${MONTHS.join('|')}) (\\d{4})(?: |$)`);

/**
 * A Journal divider's words (owner decision 2026-10-31; see richText.ts): always these, never shown, so
 * its plain text, which search, export and the board card read, is `---`; and an older app, which reads
 * a kind of line it doesn't know as a plain line with its words, shows `---` and keeps the note's other formatting.
 */
export const DIVIDER = '---';

/** What is written under a note's date line (the date line and the blank line after it left out). */
export function journalBody(text: string): string {
  const i = text.indexOf('\n');
  return i < 0 ? '' : text.slice(i + 1).replace(/^\r?\n/, '');
}

/** The first line with words in what is written under a note's date line, trimmed: what a folded day shows after its date ('' when nothing is written). */
export function journalPeek(body: string): string {
  return body.split('\n').map((l) => l.trim()).find((l) => l && l !== DIVIDER) ?? '';
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
    const m = c.kind === 'note' && !isGeneral(c) ? DATE_LINE.exec(firstLine(c.text)) : null;
    if (c.kind !== 'note' || !m) continue;
    out.push({ id: c.id, date: firstLine(c.text), body: journalBody(c.text), day: Number(m[3]) * 10000 + MONTHS.indexOf(m[2]) * 100 + Number(m[1]) });
  }
  const rank = (e: (typeof out)[number]) => (today && isDay(e.date, today) ? 1e9 : e.day);
  return out.sort((a, b) => rank(b) - rank(a)).map(({ id, date, body }) => ({ id, date, body }));
}

/**
 * The Journal board kept out of the Boards menu: the one the panel uses (see findJournalBoard),
 * when no card opens it and it holds only dated notes and its general notes, so nothing on it is out
 * of sight (a second "General notes" note without a place in the list isn't in the panel, so it lists the board). A Journal
 * board with a card on Home (as the Journal button used to make) stays listed. Never the home board.
 */
export function hiddenJournal(ws: Workspace, shared: string[]): string | null {
  const id = findJournalBoard(ws, shared);
  if (!id || id === ws.home) return null;
  const board = ws.boards[id];
  const shown = journalEntries(board).length + generalNotes(board).length;
  if (Object.keys(board.columns).length || shown !== Object.keys(board.cards).length) return null;
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

// Journal redesign (owner pick, 2026-10-22, jobs 166 + 167): today's page has a heading, a week number and a word count.

/** "Wednesday, 21 October": a day as a page heading. */
export function journalLongDate(key: DayKey): string {
  const d = new Date(`${key}T12:00:00Z`);
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
  return `${weekday}, ${Number(key.slice(8))} ${MONTH_NAMES[Number(key.slice(5, 7)) - 1]}`;
}

/** The week's number the ISO way (Monday first; week 1 holds the year's first Thursday). */
export function isoWeek(key: DayKey): number {
  const thursday = addDays(weekStart(key), 3);
  const jan1 = Date.parse(`${thursday.slice(0, 4)}-01-01T12:00:00Z`);
  return Math.floor((Date.parse(`${thursday}T12:00:00Z`) - jan1) / 86400000 / 7) + 1;
}

/** The words in a note's text under its date line; the "• " and "1. " list markers are not words. */
export function journalWords(body: string): number {
  // A divider's line is not a word.
  return body.split('\n').flatMap((l) => (l === DIVIDER ? [] : l.replace(/^\s*(•|\d+\.)\s/, '').split(/\s+/))).filter(Boolean).length;
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
