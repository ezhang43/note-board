import { journalBody } from './journal';

// Rich text in Journal notes only (owner request, 2026-10-19). A small typed format of our own,
// kept in `NoteCard.rich` beside the note's plain text. The plain text stays the truth for every
// other part of the app (search, export, copy, the board card, sync merges): the formatting is
// only used while its plain text still matches the note's (see `journalRich`).

export type BlockType = 'p' | 'h1' | 'h2' | 'bullet' | 'number';
/**
 * A size in px, from SIZE_STEPS' first to its last (the size box, owner pick 2026-10-30). 'small' and
 * 'large' are the words saved before it: still read, and shown as they always were.
 */
export type RunSize = 'small' | 'large' | number;
export type RunFont = 'serif' | 'rounded' | 'hand' | 'mono';
export type Highlight = 'yellow' | 'green' | 'blue' | 'pink';

/** A stretch of text with one look. Marks are left out when off. */
export interface Run {
  text: string;
  b?: true;
  i?: true;
  u?: true;
  s?: true;
  size?: RunSize;
  font?: RunFont;
  hl?: Highlight;
}
/** One line: a paragraph, a heading or a list item. `indent` (1 to 4) only on list items. */
export interface Block {
  type: BlockType;
  indent?: number;
  runs: Run[];
}
export type Rich = Block[];

/** A place in the text: block number and letter offset in it. */
export interface Pos {
  b: number;
  o: number;
}
export interface Sel {
  start: Pos;
  end: Pos;
}
/** The result of an edit: the new text and where the caret goes. */
export interface Edit {
  rich: Rich;
  at: Pos;
}
export type Toggle = 'b' | 'i' | 'u' | 's';
export type Marks = Omit<Run, 'text'>;
/** What the toolbar shows for a selection. */
export interface Look {
  type: BlockType;
  b: boolean;
  i: boolean;
  u: boolean;
  s: boolean;
  size?: RunSize;
  font?: RunFont;
  hl?: Highlight;
  /** Size, font or highlight that differ across the selection (the menus show "Mixed"). */
  mixed?: ('size' | 'font' | 'hl')[];
}

const TYPES: BlockType[] = ['p', 'h1', 'h2', 'bullet', 'number'];
/** The sizes in the size box's list, in px; 16 is the Journal's normal text. */
export const SIZE_STEPS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36];
export const NORMAL_SIZE = 16;
/** The old Small and Large were 0.85em and 1.3em of the 16px text. */
const OLD_SIZES: Record<string, number> = { small: 13.6, large: 20.8 };
const RUN_FONTS: RunFont[] = ['serif', 'rounded', 'hand', 'mono'];
export const HIGHLIGHTS: Highlight[] = ['yellow', 'green', 'blue', 'pink'];
const MAX_INDENT = 4;
const MAX_BLOCKS = 20000;
const MAX_RUNS = 2000;
const MARK_KEYS = ['b', 'i', 'u', 's', 'size', 'font', 'hl'] as const;

export const isList = (t: BlockType) => t === 'bullet' || t === 'number';

// ---- small helpers ----

const len = (blk: Block) => blk.runs.reduce((n, r) => n + r.text.length, 0);
const marksOf = (r: Run): Marks => {
  const m: Marks = {};
  for (const k of MARK_KEYS) if (r[k] !== undefined) (m as Record<string, unknown>)[k] = r[k];
  return m;
};
const sameMarks = (a: Run, b: Run) => MARK_KEYS.every((k) => a[k] === b[k]);

/** Joins neighbouring runs with the same look and drops empty ones. */
function norm(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameMarks(last, r)) out[out.length - 1] = { ...last, text: last.text + r.text };
    else out.push({ ...r });
  }
  return out;
}

/** The runs between two letter offsets. */
function slice(runs: Run[], from: number, to = Infinity): Run[] {
  const out: Run[] = [];
  let pos = 0;
  for (const r of runs) {
    const a = Math.max(from, pos);
    const z = Math.min(to, pos + r.text.length);
    if (z > a) out.push({ ...r, text: r.text.slice(a - pos, z - pos) });
    pos += r.text.length;
  }
  return out;
}

/** A block with the given type, dropping `indent` where it does not belong. */
function block(type: BlockType, indent: number | undefined, runs: Run[]): Block {
  const n = isList(type) ? Math.min(MAX_INDENT, Math.max(0, indent ?? 0)) : 0;
  return n ? { type, indent: n, runs: norm(runs) } : { type, runs: norm(runs) };
}
const withRuns = (blk: Block, runs: Run[]) => block(blk.type, blk.indent, runs);

/** Start before end. */
function ordered(sel: Sel): Sel {
  const { start, end } = sel;
  return start.b < end.b || (start.b === end.b && start.o <= end.o) ? sel : { start: end, end: start };
}

/** Applies `fn` to the runs inside the selection, block by block. */
function mapSel(rich: Rich, sel: Sel, fn: (r: Run) => Run): Rich {
  const { start, end } = ordered(sel);
  return rich.map((blk, b) => {
    if (b < start.b || b > end.b) return blk;
    const from = b === start.b ? start.o : 0;
    const to = b === end.b ? end.o : Infinity;
    return withRuns(blk, [...slice(blk.runs, 0, from), ...slice(blk.runs, from, to).map(fn), ...slice(blk.runs, to)]);
  });
}

/** The runs inside the selection (each block's share). */
function selRuns(rich: Rich, sel: Sel): Run[] {
  const { start, end } = ordered(sel);
  const out: Run[] = [];
  for (let b = start.b; b <= end.b && b < rich.length; b++) {
    out.push(...slice(rich[b].runs, b === start.b ? start.o : 0, b === end.b ? end.o : Infinity));
  }
  return out;
}

// ---- plain text ----

/** Plain text as one paragraph a line. Splits on '\n' only, so '\r' is kept and comes back exactly. */
export function fromPlain(text: string): Rich {
  return text.split('\n').map((line) => block('p', 0, [{ text: line }]));
}

/** The plain text of the formatting, as search, export, copy and the board card see it. */
export function plainOf(rich: Rich): string {
  const counts: number[] = [];
  return rich
    .map((blk) => {
      const text = blk.runs.map((r) => r.text).join('');
      const indent = blk.indent ?? 0;
      if (!isList(blk.type)) {
        counts.length = 0;
        return text;
      }
      counts.length = Math.min(counts.length, indent + 1);
      while (counts.length < indent + 1) counts.push(0);
      let marker = '• ';
      if (blk.type === 'number') marker = `${++counts[indent]}. `;
      else counts[indent] = 0;
      return '  '.repeat(indent) + marker + text;
    })
    .join('\n');
}

/** The number shown before each numbered item ('' for anything else), as `plainOf` counts them. */
export function numbers(rich: Rich): string[] {
  return plainOf(rich)
    .split('\n')
    .map((line, b) => (rich[b]?.type === 'number' ? line.trim().split(' ')[0] : ''));
}

/** False when loading would cut the formatting short (`parseRich`'s caps), so it is not saved at all. */
export function withinLimits(rich: Rich): boolean {
  return rich.length <= MAX_BLOCKS && rich.every((blk) => blk.runs.length <= MAX_RUNS);
}

/** True when anything differs from plain text, so a plain note keeps the old saved shape. */
export function hasFormatting(rich: Rich): boolean {
  return rich.some((blk) => blk.type !== 'p' || blk.runs.some((r) => MARK_KEYS.some((k) => r[k] !== undefined)));
}

/** A Journal note's body to show: its saved formatting while that still matches its text, else the text, plain. */
export function journalRich(text: string, rich: Rich | undefined): Rich {
  const body = journalBody(text);
  return rich && rich.length && plainOf(rich) === body ? rich : fromPlain(body);
}

/** The plain text of a selection, without list markers (for copy and cut). */
export function plainOfSel(rich: Rich, sel: Sel): string {
  const { start, end } = ordered(sel);
  const lines: string[] = [];
  for (let b = start.b; b <= end.b && b < rich.length; b++) {
    lines.push(slice(rich[b].runs, b === start.b ? start.o : 0, b === end.b ? end.o : Infinity).map((r) => r.text).join(''));
  }
  return lines.join('\n');
}

// ---- checking saved or imported formatting (it is untrusted) ----

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (allowed.includes(v as T) ? (v as T) : undefined);

function parseRun(v: unknown): Run | null {
  if (typeof v !== 'object' || v === null || typeof (v as Run).text !== 'string') return null;
  const r = v as Record<string, unknown>;
  const out: Run = { text: (r.text as string).replace(/\n/g, ' ') };
  if (r.b === true) out.b = true;
  if (r.i === true) out.i = true;
  if (r.u === true) out.u = true;
  if (r.s === true) out.s = true;
  const size = r.size;
  if (typeof size === 'number' ? size >= SIZE_STEPS[0] && size <= SIZE_STEPS[SIZE_STEPS.length - 1] && size !== NORMAL_SIZE : size === 'small' || size === 'large') out.size = size as RunSize;
  const font = pick(r.font, RUN_FONTS);
  if (font) out.font = font;
  const hl = pick(r.hl, HIGHLIGHTS);
  if (hl) out.hl = hl;
  return out;
}

/** Saved formatting, keeping only known blocks and marks; undefined for anything that is not a list of blocks. */
export function parseRich(v: unknown): Rich | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Rich = [];
  for (const x of v) {
    if (out.length >= MAX_BLOCKS) break;
    if (typeof x !== 'object' || x === null) continue;
    const o = x as Record<string, unknown>;
    const runs = Array.isArray(o.runs) ? o.runs.slice(0, MAX_RUNS).map(parseRun).filter((r): r is Run => r !== null) : [];
    const indent = typeof o.indent === 'number' && Number.isFinite(o.indent) ? Math.round(o.indent) : 0;
    out.push(block(pick(o.type, TYPES) ?? 'p', indent, runs));
  }
  return out.length ? out : undefined;
}

// ---- editing ----

/** Removes the selected text; the first block keeps its kind. */
export function deleteSel(rich: Rich, sel: Sel): Edit {
  const { start, end } = ordered(sel);
  const first = rich[start.b];
  const last = rich[end.b];
  const joined = withRuns(first, [...slice(first.runs, 0, start.o), ...slice(last.runs, end.o)]);
  return { rich: [...rich.slice(0, start.b), joined, ...rich.slice(end.b + 1)], at: start };
}

/** The look new typing takes at a place: the letter before it, or the first letter of an empty start. */
function marksBefore(blk: Block, o: number): Marks {
  const r = o > 0 ? slice(blk.runs, o - 1, o)[0] : blk.runs[0];
  return r ? marksOf(r) : {};
}

/** Types or pastes text over the selection. New lines make new blocks of the same kind. */
export function insertText(rich: Rich, sel: Sel, text: string, marks?: Marks): Edit {
  const cleared = deleteSel(rich, sel);
  const { b, o } = cleared.at;
  const blk = cleared.rich[b];
  const look = marks ?? marksBefore(blk, o);
  const lines = text.split('\n');
  const before = slice(blk.runs, 0, o);
  const after = slice(blk.runs, o);
  const made = lines.map((line, n) =>
    withRuns(blk, [...(n === 0 ? before : []), { ...look, text: line }, ...(n === lines.length - 1 ? after : [])]),
  );
  const lastLen = (lines.length === 1 ? o : 0) + lines[lines.length - 1].length;
  return { rich: [...cleared.rich.slice(0, b), ...made, ...cleared.rich.slice(b + 1)], at: { b: b + lines.length - 1, o: lastLen } };
}

/**
 * Enter: splits the block. A list continues; an empty list item ends the list; after a heading comes a paragraph.
 * `marks`: the look chosen for the next letters at the caret, if any. `look`: when the new line starts
 * empty, the size its first letters take, kept from the caret (owner, 2026-10-30; only the size carries).
 */
export function splitAt(rich: Rich, sel: Sel, marks?: Marks): Edit & { look?: Marks } {
  const cleared = deleteSel(rich, sel);
  const { b, o } = cleared.at;
  const blk = cleared.rich[b];
  const out = [...cleared.rich];
  const size = (marks ?? marksBefore(blk, o)).size;
  const look = size === undefined ? {} : { look: { size } };
  if (isList(blk.type) && len(blk) === 0) {
    out[b] = block('p', 0, []);
    return { rich: out, at: { b, o: 0 }, ...look };
  }
  const atEnd = o >= len(blk);
  const nextType = atEnd && (blk.type === 'h1' || blk.type === 'h2') ? 'p' : blk.type;
  out.splice(b, 1, withRuns(blk, slice(blk.runs, 0, o)), block(nextType, blk.indent, slice(blk.runs, o)));
  return { rich: out, at: { b: b + 1, o: 0 }, ...(atEnd ? look : {}) };
}

/** Backspace at the start of a block: a list item outdents, then becomes a paragraph; otherwise it joins the line above. */
export function joinBackward(rich: Rich, b: number): Edit {
  const blk = rich[b];
  const out = [...rich];
  if (isList(blk.type)) {
    out[b] = blk.indent ? block(blk.type, blk.indent - 1, blk.runs) : block('p', 0, blk.runs);
    return { rich: out, at: { b, o: 0 } };
  }
  if (b === 0) return { rich, at: { b, o: 0 } };
  const above = rich[b - 1];
  out.splice(b - 1, 2, withRuns(above, [...above.runs, ...blk.runs]));
  return { rich: out, at: { b: b - 1, o: len(above) } };
}

/** Delete at the end of a block: joins the next one onto it. */
export function joinForward(rich: Rich, b: number): Edit {
  const blk = rich[b];
  if (b >= rich.length - 1) return { rich, at: { b, o: len(blk) } };
  const out = [...rich];
  out.splice(b, 2, withRuns(blk, [...blk.runs, ...rich[b + 1].runs]));
  return { rich: out, at: { b, o: len(blk) } };
}

/** Tab / Shift+Tab: indents or outdents the list items in blocks b0..b1 (0 to 4 levels). */
export function indentBlocks(rich: Rich, b0: number, b1: number, dir: 1 | -1): Rich {
  return rich.map((blk, b) => (b >= b0 && b <= b1 && isList(blk.type) ? block(blk.type, (blk.indent ?? 0) + dir, blk.runs) : blk));
}

// ---- formatting ----

/** The look of a selection: a mark is on when all of it has it; size, font and highlight when all share one. */
export function marksAt(rich: Rich, sel: Sel): Look {
  const s = ordered(sel);
  const type = rich[s.start.b]?.type ?? 'p';
  const collapsed = s.start.b === s.end.b && s.start.o === s.end.o;
  const runs: Run[] = collapsed ? [{ text: 'x', ...marksBefore(rich[s.start.b] ?? block('p', 0, []), s.start.o) }] : selRuns(rich, s);
  const all = (k: (typeof MARK_KEYS)[number]) => (runs.length && runs.every((r) => r[k] === runs[0][k]) ? runs[0][k] : undefined);
  const out: Look = { type, b: !!all('b'), i: !!all('i'), u: !!all('u'), s: !!all('s') };
  const size = all('size') as RunSize | undefined;
  const font = all('font') as RunFont | undefined;
  const hl = all('hl') as Highlight | undefined;
  if (size) out.size = size;
  if (font) out.font = font;
  if (hl) out.hl = hl;
  const mixed = (['size', 'font', 'hl'] as const).filter((k) => runs.some((r) => r[k] !== runs[0][k]));
  if (mixed.length) out.mixed = mixed;
  return out;
}

/** Look as Marks (only what is on), for typing with a look chosen before any letter is typed. */
export function marksOfLook(look: Look): Marks {
  const m: Marks = {};
  for (const k of ['b', 'i', 'u', 's'] as const) if (look[k]) m[k] = true;
  if (look.size) m.size = look.size;
  if (look.font) m.font = look.font;
  if (look.hl) m.hl = look.hl;
  return m;
}

/** Bold, italic, underline or strikethrough on the selection: on for all, unless all have it, then off. */
export function toggleMark(rich: Rich, sel: Sel, mark: Toggle): Rich {
  const on = !marksAt(rich, sel)[mark];
  return mapSel(rich, sel, (r) => {
    const next = { ...r };
    if (on) next[mark] = true;
    else delete next[mark];
    return next;
  });
}

/** Size, font or highlight on the selection; undefined takes it off. */
export function setMark<K extends 'size' | 'font' | 'hl'>(rich: Rich, sel: Sel, mark: K, value: Run[K] | undefined): Rich {
  return mapSel(rich, sel, (r) => {
    const next = { ...r };
    if (value === undefined) delete next[mark];
    else next[mark] = value;
    return next;
  });
}

// ---- the size box ----

/** A size in px (no size is normal). */
export const sizePx = (size: RunSize | undefined): number => (size === undefined ? NORMAL_SIZE : typeof size === 'number' ? size : OLD_SIZES[size]);

/** The mark for a size in px: normal is no mark, so plain text keeps its plain saved shape. */
export const sizeMark = (px: number): RunSize | undefined => (px === NORMAL_SIZE ? undefined : px);

/** − and +: the next size in the list below or above, stopping at the ends. */
export function stepSize(size: RunSize | undefined, dir: 1 | -1): number {
  const px = Math.round(sizePx(size)); // from the number the box shows (Small shows 14)
  const next = dir > 0 ? SIZE_STEPS.find((s) => s > px) : [...SIZE_STEPS].reverse().find((s) => s < px);
  return next ?? (dir > 0 ? SIZE_STEPS[SIZE_STEPS.length - 1] : SIZE_STEPS[0]);
}

/** − and + on a selection: each part steps from its own size, as in Google Docs. */
export function stepSizes(rich: Rich, sel: Sel, dir: 1 | -1): Rich {
  return mapSel(rich, sel, (r) => {
    const { size: _old, ...rest } = r;
    const size = sizeMark(stepSize(r.size, dir));
    return size === undefined ? rest : { ...rest, size };
  });
}

/** Normal, Heading 1 or Heading 2 (or a list kind) on blocks b0..b1. */
export function setBlockType(rich: Rich, b0: number, b1: number, type: BlockType): Rich {
  return rich.map((blk, b) => (b >= b0 && b <= b1 ? block(type, blk.indent, blk.runs) : blk));
}

/** The list buttons: make blocks b0..b1 that kind of list, or back to paragraphs when all already are. */
export function toggleList(rich: Rich, b0: number, b1: number, type: 'bullet' | 'number'): Rich {
  const all = rich.slice(b0, b1 + 1).every((blk) => blk.type === type);
  return setBlockType(rich, b0, b1, all ? 'p' : type);
}
