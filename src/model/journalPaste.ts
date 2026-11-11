import { newId, type MakeId } from './cards';
import { MAX_DEPTH } from './checklist';
import { isList, MAX_INDENT, parseRich, plainSize, sizePx, type Block, type Marks, type Rich, type Run } from './richText';
import { parseStyle } from './textStyle';
import type { TextStyle, TodoItem } from './types';

// Pasting between the Journal and checklists (owner request, 2026-11-01). A copy made in the app
// carries its lines (or items) as JSON on the clipboard beside the plain text, so a paste keeps
// their looks, also from another tab. Everything read back is checked like loaded data: it comes
// from the clipboard, which anything can write. Nothing here is saved in a new shape.

/** How many items a paste may bring (the clipboard is untrusted); sub-items go as deep as a checklist does. */
const MAX_ITEMS = 5000;
/** A checklist item's Small and Large, as Journal sizes in px: sizes the size box lists (Small one step under the 14px normal text). */
const SMALL_PX = 12;
const LARGE_PX = 20;

// ---- Journal lines <-> checklist items ----

const textOf = (blk: Block) => blk.runs.map((r) => r.text).join('');

/** What the whole line has, as an item's look: only bold, italic, size and font, and only if every letter has it. */
function styleOf(blk: Block): TextStyle | undefined {
  const runs = blk.runs.filter((r) => r.text);
  if (!runs.length) return undefined;
  const same = <T>(get: (r: Run) => T | undefined): T | undefined => {
    const first = get(runs[0]);
    return first !== undefined && runs.every((r) => get(r) === first) ? first : undefined;
  };
  const sizeKind = (r: Run) => {
    const px = sizePx(r.size, blk.type); // the old Small (13.6px) is still Small
    const plain = plainSize(blk.type);
    return px < plain ? 'small' : px > plain ? 'large' : 'normal';
  };
  const kind = same(sizeKind);
  // A heading is bold (Heading 1 also large) unless its words have a size of their own.
  const size = kind && kind !== 'normal' ? kind : kind === 'normal' && blk.type === 'h1' ? 'large' : undefined;
  const style: TextStyle = {};
  if (size) style.size = size;
  if (blk.type === 'h1' || blk.type === 'h2' || same((r) => r.b)) style.bold = true;
  if (same((r) => r.i)) style.italic = true;
  const font = same((r) => r.font);
  if (font) style.font = font;
  return Object.keys(style).length ? style : undefined;
}

/**
 * Journal lines as checklist items: a list line is an item at its indent level, nested under the nearest line
 * above it with a shallower level (one with nothing above it is a top-level item); plain lines and headings are
 * top-level items. Dividers and blank lines are skipped. Nothing is ticked.
 */
export function richToItems(rich: Rich, makeId: MakeId = newId): TodoItem[] {
  const out: TodoItem[] = [];
  const open: { level: number; item: TodoItem }[] = [];
  let budget = MAX_ITEMS;
  for (const blk of rich) {
    if (budget <= 0) break;
    if (blk.type === 'hr' || !textOf(blk).trim()) continue;
    budget--;
    const level = isList(blk.type) ? (blk.indent ?? 0) : 0;
    const style = styleOf(blk);
    const item: TodoItem = { id: makeId('i'), text: textOf(blk), done: false, children: [], ...(style ? { style } : {}) };
    while (open.length && open[open.length - 1].level >= level) open.pop();
    (open.length ? open[open.length - 1].item.children : out).push(item);
    open.push({ level, item });
  }
  return out;
}

/** Checklist items as a bulleted list, sub-items as deeper levels (the fourth is the deepest), keeping the looks the Journal has too. Ticks are not kept. */
export function itemsToRich(items: TodoItem[]): Rich {
  const out: Rich = [];
  const add = (list: TodoItem[], depth: number) => {
    for (const it of list) {
      const marks: Marks = {};
      if (it.style?.bold) marks.b = true;
      if (it.style?.italic) marks.i = true;
      if (it.style?.size) marks.size = it.style.size === 'small' ? SMALL_PX : LARGE_PX;
      if (it.style?.font) marks.font = it.style.font;
      const indent = Math.min(depth, MAX_INDENT);
      out.push({ type: 'bullet', ...(indent ? { indent } : {}), runs: it.text ? [{ text: it.text, ...marks }] : [] });
      add(it.children, depth + 1);
    }
  };
  add(items, 0);
  return out;
}

// ---- the clipboard's JSON ----

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Journal lines as the clipboard's JSON. */
export const encodeRich = (rich: Rich): string => JSON.stringify(rich);

/** Journal lines from the clipboard's JSON, checked like saved formatting; undefined for anything else (the paste is then plain text). */
export function decodeRich(raw: string): Rich | undefined {
  return parseRich(parseJson(raw));
}

/** Checklist items as the clipboard's JSON. */
export const encodeItems = (items: TodoItem[]): string => JSON.stringify(items);

/** Checklist items from the clipboard's JSON, with new ids; undefined for anything that is not a list of items. Only text, tick, look and sub-items are read. */
export function decodeItems(raw: string, makeId: MakeId = newId): TodoItem[] | undefined {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return undefined;
  let budget = MAX_ITEMS;
  const read = (v: unknown, depth: number): TodoItem[] => {
    if (!Array.isArray(v) || depth > MAX_DEPTH) return [];
    const out: TodoItem[] = [];
    for (const x of v) {
      if (budget <= 0) break;
      if (typeof x !== 'object' || x === null || typeof (x as TodoItem).text !== 'string') continue;
      budget--;
      const o = x as Record<string, unknown>;
      const style = parseStyle(o.style);
      out.push({ id: makeId('i'), text: (o.text as string).replace(/\n/g, ' '), done: o.done === true, children: read(o.children, depth + 1), ...(style ? { style } : {}) });
    }
    return out;
  };
  const items = read(parsed, 0);
  return items.length ? items : undefined;
}
