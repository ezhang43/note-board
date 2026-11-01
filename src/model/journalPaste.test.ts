import { describe, expect, it } from 'vitest';
import { decodeItems, decodeRich, encodeItems, encodeRich, itemsToRich, richToItems } from './journalPaste';
import type { Block, Rich } from './richText';
import type { TodoItem } from './types';

// Pasting between the Journal and checklists (owner request, 2026-11-01): pure conversions between
// the Journal's lines and checklist items, and checking what comes off the clipboard.

let n = 0;
const makeId = (prefix: string) => `${prefix}${++n}`;
const run = (text: string, marks: object = {}) => ({ text, ...marks });
const line = (type: Block['type'], text: string, indent?: number, marks: object = {}): Block => ({ type, ...(indent ? { indent } : {}), runs: text ? [run(text, marks)] : [] });
const item = (text: string, children: TodoItem[] = [], extra: Partial<TodoItem> = {}): TodoItem => ({ id: text || 'blank', text, done: false, children, ...extra });
/** An item tree as nested [text, children] for short comparisons. */
const shape = (items: TodoItem[]): unknown[] => items.map((i) => (i.children.length ? [i.text, shape(i.children)] : i.text));

describe('richToItems (a Journal selection pasted into a checklist)', () => {
  it('makes one item a line, with sub-items by indent level', () => {
    const rich: Rich = [line('bullet', 'milk'), line('bullet', 'oat', 1), line('bullet', 'steamed', 2), line('bullet', 'eggs'), line('number', 'one'), line('number', 'one a', 1)];
    expect(shape(richToItems(rich, makeId))).toEqual([['milk', [['oat', ['steamed']]]], 'eggs', ['one', ['one a']]]);
  });

  it('turns plain lines and headings into top-level items, and skips dividers and blank lines', () => {
    const rich: Rich = [line('h1', 'Plan'), line('p', 'intro'), line('hr', ''), line('bullet', 'a'), line('bullet', 'b', 1), line('p', ''), line('bullet', '', 1), line('p', 'after')];
    expect(shape(richToItems(rich, makeId))).toEqual(['Plan', 'intro', ['a', ['b']], 'after']);
  });

  it('gives a plain line the top level, and an indented list line after it nests under it', () => {
    const rich: Rich = [line('bullet', 'a'), line('p', 'break'), line('bullet', 'b', 1)];
    expect(shape(richToItems(rich, makeId))).toEqual(['a', ['break', ['b']]]);
  });

  it('keeps a first line that is indented at the top level, and nests a deeper one under the line above', () => {
    const rich: Rich = [line('bullet', 'deep', 2), line('bullet', 'deeper', 3), line('bullet', 'back', 2)];
    expect(shape(richToItems(rich, makeId))).toEqual([['deep', ['deeper']], 'back']);
  });

  it('keeps bold, italic, size and font a whole line has; drops the looks a checklist does not have; none ticked', () => {
    const rich: Rich = [
      line('bullet', 'all bold', 0, { b: true, i: true, u: true, s: true, hl: 'yellow', font: 'serif' }),
      { type: 'bullet', runs: [run('half '), run('bold', { b: true })] },
      line('bullet', 'small', 0, { size: 12 }),
      line('bullet', 'big', 0, { size: 24 }),
      line('bullet', 'old small', 0, { size: 'small' }),
      { type: 'bullet', runs: [run('a', { size: 12 }), run('b', { size: 24 })] },
    ];
    const out = richToItems(rich, makeId);
    expect(out[0].style).toEqual({ bold: true, italic: true, font: 'serif' });
    expect(out[1].style).toBeUndefined();
    expect(out[2].style).toEqual({ size: 'small' });
    expect(out[3].style).toEqual({ size: 'large' });
    expect(out[4].style).toEqual({ size: 'small' });
    expect(out[5].style).toBeUndefined();
    expect(out.every((i) => i.done === false)).toBe(true);
  });

  it('shows headings as bold items, Heading 1 also large', () => {
    const out = richToItems([line('h1', 'Big'), line('h2', 'Mid')], makeId);
    expect(out[0].style).toEqual({ bold: true, size: 'large' });
    expect(out[1].style).toEqual({ bold: true });
  });

  it('gives every item its own new id', () => {
    const out = richToItems([line('bullet', 'a'), line('bullet', 'b', 1)], makeId);
    const ids = [out[0].id, out[0].children[0].id];
    expect(new Set(ids).size).toBe(2);
  });

  it('gives nothing for dividers and blank lines only', () => {
    expect(richToItems([line('hr', ''), line('p', '')], makeId)).toEqual([]);
  });
});

describe('richToItems cap', () => {
  it('brings at most 5000 items, as a copy of items does, however long the clipboard says the selection was', () => {
    const many: Rich = Array.from({ length: 5100 }, (_, i) => line('p', `line ${i}`));
    expect(richToItems(many, makeId)).toHaveLength(5000);
  });
});

describe('itemsToRich (copied checklist items pasted into the Journal)', () => {
  it('makes a bulleted list with sub-items as deeper levels, capped at the fourth', () => {
    const deep = item('l0', [item('l1', [item('l2', [item('l3', [item('l4', [item('l5')])])])])]);
    const out = itemsToRich([deep, item('next')]);
    expect(out.map((b) => [b.type, b.indent ?? 0, b.runs.map((r) => r.text).join('')])).toEqual([
      ['bullet', 0, 'l0'],
      ['bullet', 1, 'l1'],
      ['bullet', 2, 'l2'],
      ['bullet', 3, 'l3'],
      ['bullet', 4, 'l4'],
      ['bullet', 4, 'l5'],
      ['bullet', 0, 'next'],
    ]);
  });

  it('keeps bold, italic, font and size where the Journal has the same look, and sends ticked items without the tick', () => {
    const out = itemsToRich([
      item('b', [], { style: { bold: true, italic: true, font: 'mono' } }),
      item('s', [], { style: { size: 'small' } }),
      item('l', [], { style: { size: 'large' } }),
      item('done', [], { done: true }),
    ]);
    expect(out[0].runs).toEqual([{ text: 'b', b: true, i: true, font: 'mono' }]);
    expect(out[1].runs).toEqual([{ text: 's', size: 14 }]);
    expect(out[2].runs).toEqual([{ text: 'l', size: 20 }]);
    expect(out[3].runs).toEqual([{ text: 'done' }]);
  });

  it('keeps a blank item as an empty bullet', () => {
    expect(itemsToRich([item('')])).toEqual([{ type: 'bullet', runs: [] }]);
  });
});

describe('what comes off the clipboard is checked', () => {
  it('reads back the Journal lines it wrote', () => {
    const rich: Rich = [line('bullet', 'a', 1, { b: true, size: 20 }), line('hr', ''), line('h2', 'head')];
    expect(decodeRich(encodeRich(rich))).toEqual([{ type: 'bullet', indent: 1, runs: [{ text: 'a', b: true, size: 20 }] }, { type: 'hr', runs: [{ text: '---' }] }, line('h2', 'head')]);
  });

  it('gives nothing for bad data, so the paste falls back to plain text', () => {
    for (const bad of ['', '1', 'not json', '{}', 'null', '"x"', '[]', '{"a":1}']) expect(decodeRich(bad)).toBeUndefined();
    for (const bad of ['', '1', 'not json', '{}', 'null', '"x"', '[]']) expect(decodeItems(bad, makeId)).toBeUndefined();
  });

  it('drops looks it does not know, and reads words as words', () => {
    const got = decodeRich(JSON.stringify([{ type: 'weird', runs: [{ text: '<b>x</b>', size: 99, font: 'comic', b: 'yes', hl: 'red', extra: 1 }] }]));
    expect(got).toEqual([{ type: 'p', runs: [{ text: '<b>x</b>' }] }]);
  });

  it('reads copied items back with new ids, keeping text, ticks, formatting and sub-items', () => {
    const items = [item('a', [item('b', [], { style: { bold: true } })], { done: true })];
    const got = decodeItems(encodeItems(items), makeId)!;
    expect(got).toHaveLength(1);
    expect(got[0].id).not.toBe('a');
    expect(got[0]).toMatchObject({ text: 'a', done: true });
    expect(got[0].children[0]).toMatchObject({ text: 'b', done: false, style: { bold: true }, children: [] });
  });

  it('drops unreadable items and unknown fields, and stops at a sane depth', () => {
    const got = decodeItems(JSON.stringify([{ text: 'ok', done: 'yes', style: { size: 'huge', bold: true }, sneaky: 1, children: [{ nope: 1 }, 5, { text: 'kid' }] }, 'str', null]), makeId)!;
    expect(got).toHaveLength(1);
    expect(got[0].text).toBe('ok');
    expect(got[0].done).toBe(false);
    expect(got[0].style).toEqual({ bold: true });
    expect(got[0]).not.toHaveProperty('sneaky');
    expect(got[0].children.map((c) => c.text)).toEqual(['kid']);
    let deep: unknown = { text: 'x', children: [] };
    for (let i = 0; i < 50; i++) deep = { text: 'x', children: [deep] };
    const depthOf = (l: TodoItem[]): number => (l.length ? 1 + depthOf(l[0].children) : 0);
    expect(depthOf(decodeItems(JSON.stringify([deep]), makeId) ?? [])).toBeLessThanOrEqual(8);
  });
});
