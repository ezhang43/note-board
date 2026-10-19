import { describe, expect, it } from 'vitest';
import {
  deleteSel,
  fromPlain,
  hasFormatting,
  indentBlocks,
  joinBackward,
  joinForward,
  journalRich,
  marksAt,
  parseRich,
  plainOf,
  plainOfSel,
  setBlockType,
  setMark,
  splitAt,
  insertText,
  toggleList,
  toggleMark,
  withinLimits,
  type Rich,
} from './richText';

// Rich text in Journal notes (owner request, 2026-10-19): a small typed format, kept beside the
// note's plain text, which stays the truth for every other part of the app.

const p = (text: string): Rich[number] => ({ type: 'p', runs: text ? [{ text }] : [] });
const at = (b: number, o: number) => ({ b, o });
const sel = (b: number, o: number, b2 = b, o2 = o) => ({ start: at(b, o), end: at(b2, o2) });

describe('plain text', () => {
  it('reads plain text as one paragraph a line, and gives it back exactly', () => {
    for (const body of ['', 'one', 'a\n\nb', 'a\r\nb', '\nstarts with a break', '• not a list']) {
      expect(plainOf(fromPlain(body))).toBe(body);
      expect(hasFormatting(fromPlain(body))).toBe(false);
    }
  });

  it('writes lists with a bullet or number, two spaces per level, and headings as their text', () => {
    const rich: Rich = [
      { type: 'h1', runs: [{ text: 'Plan' }] },
      { type: 'bullet', runs: [{ text: 'milk', b: true }] },
      { type: 'bullet', indent: 1, runs: [{ text: 'oat' }] },
      { type: 'number', runs: [{ text: 'first' }] },
      { type: 'number', indent: 1, runs: [{ text: 'inner' }] },
      { type: 'number', runs: [{ text: 'second' }] },
      p('after'),
      { type: 'number', runs: [{ text: 'again' }] },
    ];
    expect(plainOf(rich)).toBe('Plan\n• milk\n  • oat\n1. first\n  1. inner\n2. second\nafter\n1. again');
  });
});

describe('journalRich: the plain text always wins', () => {
  it('uses the saved formatting only while it matches the note’s text', () => {
    const rich: Rich = [{ type: 'p', runs: [{ text: 'hello', b: true }] }];
    expect(journalRich('Sun 18 Oct 2026\n\nhello', rich)).toEqual(rich);
    // Changed somewhere else (on the board, an older app, a sync merge): the text is shown, plain.
    expect(journalRich('Sun 18 Oct 2026\n\nhello there', rich)).toEqual([p('hello there')]);
    expect(journalRich('Sun 18 Oct 2026\n\nold\nnote', undefined)).toEqual([p('old'), p('note')]);
  });
});

describe('parseRich: saved or imported formatting is checked', () => {
  it('keeps what it knows and drops everything else', () => {
    const got = parseRich([
      { type: 'h2', runs: [{ text: 'Title', b: true, i: true, u: true, s: true, size: 'large', font: 'serif', hl: 'yellow', onclick: 'x' }], extra: 1 },
      { type: 'bullet', indent: 2, runs: [{ text: 'item' }] },
    ]);
    expect(got).toEqual([
      { type: 'h2', runs: [{ text: 'Title', b: true, i: true, u: true, s: true, size: 'large', font: 'serif', hl: 'yellow' }] },
      { type: 'bullet', indent: 2, runs: [{ text: 'item' }] },
    ]);
  });

  it('never lets markup or odd values through', () => {
    const got = parseRich([
      { type: '<script>', runs: [{ text: '<img src=x onerror=alert(1)>', b: 'yes', size: '99px', font: 'url(evil)', hl: 'red;background:url(x)' }] },
      { type: 'number', indent: 99, runs: [{ text: 'deep' }] },
      { type: 'bullet', indent: -3, runs: [{ text: 'neg' }] },
      { type: 'p', indent: 2, runs: [{ text: 'not a list' }] },
      { type: 'p', runs: [{ text: 42 }, null, 'str', { text: 'a\nb' }] },
      'junk',
      null,
    ]);
    expect(got).toEqual([
      // Unknown block type: a paragraph; the text is kept as text (it is never read as markup).
      { type: 'p', runs: [{ text: '<img src=x onerror=alert(1)>' }] },
      { type: 'number', indent: 4, runs: [{ text: 'deep' }] },
      { type: 'bullet', runs: [{ text: 'neg' }] },
      { type: 'p', runs: [{ text: 'not a list' }] },
      { type: 'p', runs: [{ text: 'a b' }] },
    ]);
  });

  it('gives nothing for anything that is not a list of blocks, and caps the size', () => {
    expect(parseRich(undefined)).toBeUndefined();
    expect(parseRich('<b>hi</b>')).toBeUndefined();
    expect(parseRich({ type: 'p' })).toBeUndefined();
    const many = Array.from({ length: 25000 }, () => p('x'));
    expect(parseRich(many)!.length).toBe(20000);
  });

  it('a note is saved with formatting only while it fits what loading keeps (check of the high review)', () => {
    expect(withinLimits([p('x')])).toBe(true);
    expect(withinLimits(Array.from({ length: 20001 }, () => p('x')))).toBe(false);
    const runs = Array.from({ length: 2001 }, (_, i) => ({ text: 'x', b: i % 2 === 0 || undefined }));
    expect(withinLimits([{ type: 'p', runs }])).toBe(false);
  });

  it('joins neighbouring words with the same look and drops empty runs', () => {
    expect(parseRich([{ type: 'p', runs: [{ text: 'a', b: true }, { text: '' }, { text: 'b', b: true }] }])).toEqual([{ type: 'p', runs: [{ text: 'ab', b: true }] }]);
  });
});

describe('editing', () => {
  it('typing takes the look of the letter before it, or the one given', () => {
    const rich: Rich = [{ type: 'p', runs: [{ text: 'ab', b: true }] }];
    expect(insertText(rich, sel(0, 2), 'c').rich).toEqual([{ type: 'p', runs: [{ text: 'abc', b: true }] }]);
    const r = insertText(rich, sel(0, 2), 'c', {});
    expect(r.rich).toEqual([{ type: 'p', runs: [{ text: 'ab', b: true }, { text: 'c' }] }]);
    expect(r.at).toEqual(at(0, 3));
  });

  it('pasting several lines makes a block for each, of the same kind in a list', () => {
    const rich: Rich = [{ type: 'bullet', runs: [{ text: 'ab' }] }];
    const r = insertText(rich, sel(0, 1), 'x\ny\nz');
    expect(plainOf(r.rich)).toBe('• ax\n• y\n• zb');
    expect(r.at).toEqual(at(2, 1));
  });

  it('deletes across blocks; the first block keeps its kind', () => {
    const rich: Rich = [{ type: 'h1', runs: [{ text: 'Head' }] }, p('middle'), { type: 'bullet', runs: [{ text: 'tail' }] }];
    const r = deleteSel(rich, sel(0, 2, 2, 2));
    expect(r.rich).toEqual([{ type: 'h1', runs: [{ text: 'Heil' }] }]);
    expect(r.at).toEqual(at(0, 2));
  });

  it('Enter continues a list; Enter on an empty item ends it', () => {
    const rich: Rich = [{ type: 'number', indent: 1, runs: [{ text: 'one' }] }];
    const r = splitAt(rich, sel(0, 3));
    expect(r.rich).toEqual([{ type: 'number', indent: 1, runs: [{ text: 'one' }] }, { type: 'number', indent: 1, runs: [] }]);
    expect(r.at).toEqual(at(1, 0));
    const out = splitAt(r.rich, sel(1, 0));
    expect(out.rich[1]).toEqual({ type: 'p', runs: [] });
    expect(out.at).toEqual(at(1, 0));
  });

  it('Enter splits text, keeping each half’s look; after a heading comes a paragraph', () => {
    const rich: Rich = [{ type: 'h1', runs: [{ text: 'ab', i: true }] }];
    expect(splitAt(rich, sel(0, 1)).rich).toEqual([
      { type: 'h1', runs: [{ text: 'a', i: true }] },
      { type: 'h1', runs: [{ text: 'b', i: true }] },
    ]);
    expect(splitAt(rich, sel(0, 2)).rich).toEqual([{ type: 'h1', runs: [{ text: 'ab', i: true }] }, { type: 'p', runs: [] }]);
  });

  it('Backspace at the start of an item: outdents, then ends the list, then joins the line above', () => {
    let rich: Rich = [p('above'), { type: 'bullet', indent: 1, runs: [{ text: 'x' }] }];
    rich = joinBackward(rich, 1).rich;
    expect(rich[1]).toEqual({ type: 'bullet', runs: [{ text: 'x' }] });
    rich = joinBackward(rich, 1).rich;
    expect(rich[1]).toEqual(p('x'));
    const r = joinBackward(rich, 1);
    expect(r.rich).toEqual([p('abovex')]);
    expect(r.at).toEqual(at(0, 5));
    expect(joinBackward([p('a')], 0).rich).toEqual([p('a')]);
  });

  it('Delete at the end of a line joins the next one', () => {
    expect(joinForward([p('a'), p('b')], 0).rich).toEqual([p('ab')]);
    expect(joinForward([p('a')], 0).rich).toEqual([p('a')]);
  });

  it('Tab indents list items and Shift+Tab outdents them, between 0 and 4', () => {
    let rich: Rich = [{ type: 'bullet', runs: [] }, p('text')];
    rich = indentBlocks(rich, 0, 1, 1);
    expect(rich).toEqual([{ type: 'bullet', indent: 1, runs: [] }, p('text')]);
    for (let i = 0; i < 6; i++) rich = indentBlocks(rich, 0, 0, 1);
    expect(rich[0].indent).toBe(4);
    for (let i = 0; i < 6; i++) rich = indentBlocks(rich, 0, 0, -1);
    expect(rich[0].indent).toBeUndefined();
  });
});

describe('formatting', () => {
  it('bold on selected words: on for all, unless all have it, then off', () => {
    const rich: Rich = [p('hello world')];
    const once = toggleMark(rich, sel(0, 0, 0, 5), 'b');
    expect(once).toEqual([{ type: 'p', runs: [{ text: 'hello', b: true }, { text: ' world' }] }]);
    expect(marksAt(once, sel(0, 0, 0, 5)).b).toBe(true);
    expect(marksAt(once, sel(0, 0, 0, 8)).b).toBe(false);
    expect(toggleMark(once, sel(0, 0, 0, 8), 'b')).toEqual([{ type: 'p', runs: [{ text: 'hello wo', b: true }, { text: 'rld' }] }]);
    expect(toggleMark(once, sel(0, 0, 0, 5), 'b')).toEqual(rich);
  });

  it('italic, underline and strikethrough across lines', () => {
    const rich: Rich = [p('ab'), p('cd')];
    for (const m of ['i', 'u', 's'] as const) {
      const out = toggleMark(rich, sel(0, 1, 1, 1), m);
      expect(out).toEqual([
        { type: 'p', runs: [{ text: 'a' }, { text: 'b', [m]: true }] },
        { type: 'p', runs: [{ text: 'c', [m]: true }, { text: 'd' }] },
      ]);
    }
  });

  it('size, font and highlight on selected words; Normal / Plex Sans / None take it off', () => {
    let rich: Rich = [p('abc')];
    rich = setMark(rich, sel(0, 1, 0, 2), 'size', 'large');
    rich = setMark(rich, sel(0, 1, 0, 2), 'font', 'mono');
    rich = setMark(rich, sel(0, 1, 0, 2), 'hl', 'green');
    expect(rich).toEqual([{ type: 'p', runs: [{ text: 'a' }, { text: 'b', size: 'large', font: 'mono', hl: 'green' }, { text: 'c' }] }]);
    expect(marksAt(rich, sel(0, 1, 0, 2))).toMatchObject({ size: 'large', font: 'mono', hl: 'green' });
    rich = setMark(rich, sel(0, 0, 0, 3), 'size', undefined);
    rich = setMark(rich, sel(0, 0, 0, 3), 'font', undefined);
    rich = setMark(rich, sel(0, 0, 0, 3), 'hl', undefined);
    expect(rich).toEqual([p('abc')]);
    expect(hasFormatting(rich)).toBe(false);
  });

  it('says which of size, font and highlight are mixed in the selection, so the menus can show it', () => {
    const rich: Rich = [{ type: 'p', runs: [{ text: 'a', hl: 'yellow' }, { text: 'b', font: 'mono' }, { text: 'c', font: 'mono' }] }];
    expect(marksAt(rich, sel(0, 0, 0, 2)).mixed).toEqual(['font', 'hl']);
    expect(marksAt(rich, sel(0, 1, 0, 3)).mixed).toBeUndefined();
    expect(marksAt(rich, sel(0, 1)).mixed).toBeUndefined();
  });

  it('headings and lists on the selected lines; the list buttons switch off when all already are', () => {
    let rich: Rich = [p('a'), p('b')];
    rich = setBlockType(rich, 0, 0, 'h2');
    expect(rich[0].type).toBe('h2');
    expect(marksAt(rich, sel(0, 0)).type).toBe('h2');
    rich = toggleList(rich, 0, 1, 'bullet');
    expect(rich.map((x) => x.type)).toEqual(['bullet', 'bullet']);
    rich = toggleList(rich, 0, 1, 'number');
    expect(rich.map((x) => x.type)).toEqual(['number', 'number']);
    rich = toggleList(rich, 0, 1, 'number');
    expect(rich.map((x) => x.type)).toEqual(['p', 'p']);
    expect(hasFormatting(rich)).toBe(false);
  });

  it('copying gives plain text', () => {
    const rich: Rich = [{ type: 'bullet', runs: [{ text: 'milk', b: true }] }, { type: 'bullet', runs: [{ text: 'eggs' }] }];
    expect(plainOfSel(rich, sel(0, 1, 1, 2))).toBe('ilk\neg');
  });
});
