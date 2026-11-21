import { describe, expect, it } from 'vitest';
import { indentBlocks, insertRich, joinBackward, journalRich, listMarker, numbers, parseRich, plainOf, sliceSel, splitAt, toggleList, typedList, type Rich } from './richText';

// Typed lists and Google Docs numbering in the Journal (owner request, 2026-11-21): "1. " or "1) " at the
// start of a plain line starts a numbered list, "- " or "* " a bulleted one; deeper levels go 1. a. i.

const p = (text: string): Rich[number] => ({ type: 'p', runs: text ? [{ text }] : [] });
const at = (b: number, o: number) => ({ b, o });
const sel = (b: number, o: number) => ({ start: at(b, o), end: at(b, o) });
const num = (text: string, indent = 0, paren = false): Rich[number] => ({ type: 'number', ...(indent ? { indent } : {}), ...(paren ? { paren: true as const } : {}), runs: text ? [{ text }] : [] });

describe('listMarker: the Google Docs markers per level', () => {
  it('goes 1. a. i. and back to 1. at level 4, the same with )', () => {
    expect([0, 1, 2, 3, 4].map((lv) => listMarker(1, lv))).toEqual(['1.', 'a.', 'i.', '1.', 'a.']);
    expect([0, 1, 2, 3, 4].map((lv) => listMarker(3, lv, true))).toEqual(['3)', 'c)', 'iii)', '3)', 'c)']);
  });
  it('counts letters past z and roman numerals', () => {
    expect(listMarker(26, 1)).toBe('z.');
    expect(listMarker(27, 1)).toBe('aa.');
    expect(listMarker(4, 2)).toBe('iv.');
    expect(listMarker(9, 2)).toBe('ix.');
    expect(listMarker(14, 2)).toBe('xiv.');
  });
});

describe('numbering with letters and roman numerals', () => {
  it('writes the shown marker into the plain text and restarts as before', () => {
    const rich: Rich = [num('one'), num('sub', 1), num('sub2', 1), num('deep', 2), num('two'), { type: 'bullet', runs: [{ text: 'b' }] }, num('three')];
    expect(numbers(rich)).toEqual(['1.', 'a.', 'b.', 'i.', '2.', '', '1.']);
    expect(plainOf(rich)).toBe('1. one\n  a. sub\n  b. sub2\n    i. deep\n2. two\n• b\n1. three');
  });
  it('the ) style shows 1) a) i)', () => {
    const rich: Rich = [num('one', 0, true), num('sub', 1, true), num('deep', 2, true), num('two', 0, true)];
    expect(numbers(rich)).toEqual(['1)', 'a)', 'i)', '2)']);
    expect(plainOf(rich)).toBe('1) one\n  a) sub\n    i) deep\n2) two');
  });
});

describe('the ) style is saved and checked', () => {
  it('parseRich keeps paren only on numbered items, and only as true', () => {
    expect(parseRich([{ type: 'number', paren: true, runs: [{ text: 'a' }] }])).toEqual([num('a', 0, true)]);
    expect(parseRich([{ type: 'number', paren: 'yes', runs: [{ text: 'a' }] }])).toEqual([num('a')]);
    expect(parseRich([{ type: 'bullet', paren: true, runs: [{ text: 'a' }] }])).toEqual([{ type: 'bullet', runs: [{ text: 'a' }] }]);
    expect(parseRich([{ type: 'p', paren: true, runs: [{ text: 'a' }] }])).toEqual([p('a')]);
  });
  it('older notes without it read as the . style', () => {
    expect(parseRich([{ type: 'number', runs: [{ text: 'a' }] }])).toEqual([num('a')]);
  });
  it('Enter, Tab, Shift+Tab, Backspace, copy and rich paste keep the style', () => {
    const rich: Rich = [num('one', 0, true)];
    const split = splitAt(rich, sel(0, 3));
    expect(split.rich).toEqual([num('one', 0, true), num('', 0, true)]);
    expect(indentBlocks(split.rich, 1, 1, 1)[1]).toEqual(num('', 1, true));
    expect(joinBackward([num('x', 1, true)], 0).rich).toEqual([num('x', 0, true)]);
    expect(sliceSel(rich, { start: at(0, 0), end: at(0, 3) })).toEqual(rich);
    expect(insertRich([p(''), p('')], sel(1, 0), [num('a', 0, true), num('b', 1, true)]).rich).toEqual([p(''), num('a', 0, true), num('b', 1, true)]);
  });
  it('the list button makes the . style, and turns a ) list back to plain lines', () => {
    expect(toggleList([p('a')], 0, 0, 'number')).toEqual([num('a')]);
    expect(toggleList([num('a', 0, true)], 0, 0, 'number')).toEqual([p('a')]);
  });
});

describe('journalRich: notes saved before the letters still keep their formatting', () => {
  it('matches the old all-numbers text, and the new one', () => {
    const rich: Rich = [num('one'), num('sub', 1)];
    expect(journalRich('Sat 21 Nov 2026\n\n1. one\n  1. sub', rich)).toEqual(rich);
    expect(journalRich('Sat 21 Nov 2026\n\n1. one\n  a. sub', rich)).toEqual(rich);
    expect(journalRich('Sat 21 Nov 2026\n\n1. one\n  2. sub', rich)).toEqual([p('1. one'), p('  2. sub')]);
  });
});

describe('typedList: the typed trigger', () => {
  it('"1." then a space at the start of a plain line makes a numbered item; the cursor stays', () => {
    const got = typedList([p('1.rest')], sel(0, 2), ' ');
    expect(got?.typed.rich).toEqual([p('1. rest')]);
    expect(got?.list).toEqual({ rich: [num('rest')], at: at(0, 0) });
  });
  it('"1)" makes the ) style; "-" and "*" make a bulleted item', () => {
    expect(typedList([p('1)')], sel(0, 2), ' ')?.list.rich).toEqual([num('', 0, true)]);
    expect(typedList([p('-')], sel(0, 1), ' ')?.list.rich).toEqual([{ type: 'bullet', runs: [] }]);
    expect(typedList([p('*')], sel(0, 1), ' ')?.list).toEqual({ rich: [{ type: 'bullet', runs: [] }], at: at(0, 0) });
  });
  it('keeps the looks of the words after the cursor', () => {
    const got = typedList([{ type: 'p', runs: [{ text: '1.' }, { text: 'big', b: true }] }], sel(0, 2), ' ');
    expect(got?.list.rich).toEqual([{ type: 'number', runs: [{ text: 'big', b: true }] }]);
  });
  it('stays words mid-line, on a heading or a list line, for other numbers, or other keys', () => {
    expect(typedList([p('a 1.')], sel(0, 4), ' ')).toBeNull();
    expect(typedList([p('1.')], sel(0, 1), ' ')).toBeNull();
    expect(typedList([{ type: 'h1', runs: [{ text: '1.' }] }], sel(0, 2), ' ')).toBeNull();
    expect(typedList([num('1.')], sel(0, 2), ' ')).toBeNull();
    expect(typedList([{ type: 'bullet', runs: [{ text: '-' }] }], sel(0, 1), ' ')).toBeNull();
    expect(typedList([p('2.')], sel(0, 2), ' ')).toBeNull();
    expect(typedList([p('10.')], sel(0, 3), ' ')).toBeNull();
    expect(typedList([p('1.')], sel(0, 2), 'x')).toBeNull();
    expect(typedList([p('1.')], { start: at(0, 0), end: at(0, 2) }, ' ')).toBeNull();
    // Words that are names on every object (review finding) are words too.
    for (const word of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(typedList([p(word)], sel(0, word.length), ' ')).toBeNull();
  });
  it('an item that starts empty keeps the size the typed letters had', () => {
    const big: Rich = [{ type: 'p', runs: [{ text: '1.', size: 24 }] }];
    expect(typedList(big, sel(0, 2), ' ')?.look).toEqual({ size: 24 });
    expect(typedList([{ type: 'p', runs: [{ text: '1.', size: 24 }, { text: 'x' }] }], sel(0, 2), ' ')?.look).toBeUndefined();
    expect(typedList([p('1.')], sel(0, 2), ' ')?.look).toBeUndefined();
  });
});

describe('an older app (before 2026-11-21) reading a note with the new numbering', () => {
  it('drops paren, finds the formatting no longer matches the text, and shows the words plain, all kept', () => {
    const rich: Rich = [num('one', 0, true), num('sub', 1)];
    const text = `Sat 21 Nov 2026\n\n${plainOf(rich)}`;
    // What an older copy does: its parseRich leaves out `paren`, and its plainOf numbers every level 1. 2.
    const older = rich.map(({ paren: _p, ...b }) => b);
    expect(plainOf(older, true)).not.toBe(plainOf(rich));
    expect(journalRich(text, older).map((b) => b.runs.map((r) => r.text).join(''))).toEqual(['1) one', '  a. sub']);
  });
});
