import { describe, expect, it } from 'vitest';
import {
  deleteChar,
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
  SIZE_STEPS,
  sizeMark,
  sizePx,
  splitAt,
  stepSize,
  stepSizes,
  insertDivider,
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

// The size picker (owner pick, 2026-10-30): a number of px like Google Docs, 10 to 36, with − and +.
describe('text size as a number', () => {
  it('offers 10 to 36, with 16 as normal', () => {
    expect(SIZE_STEPS).toEqual([10, 12, 14, 16, 18, 20, 24, 28, 32, 36]);
    expect(sizePx(undefined)).toBe(16);
    expect(sizePx(24)).toBe(24);
  });

  it('reads the old Small and Large as the sizes they always showed', () => {
    expect(sizePx('small')).toBe(13.6);
    expect(sizePx('large')).toBe(20.8);
  });

  it('16 is normal, so choosing it takes the size off', () => {
    expect(sizeMark(16)).toBeUndefined();
    expect(sizeMark(24)).toBe(24);
  });

  it('− and + step through the list and stop at 10 and 36', () => {
    expect(stepSize(undefined, 1)).toBe(18);
    expect(stepSize(undefined, -1)).toBe(14);
    expect(stepSize(36, 1)).toBe(36);
    expect(stepSize(10, -1)).toBe(10);
    expect(stepSize('small', 1)).toBe(16);
    expect(stepSize('small', -1)).toBe(12);
    expect(stepSize('large', 1)).toBe(24);
    expect(stepSize('large', -1)).toBe(20);
  });

  it('steps each part of a mixed selection on its own; 16 is left plain', () => {
    const rich: Rich = [{ type: 'p', runs: [{ text: 'a' }, { text: 'b', size: 20 }, { text: 'c', size: 'small' }] }];
    expect(stepSizes(rich, sel(0, 0, 0, 3), 1)).toEqual([{ type: 'p', runs: [{ text: 'a', size: 18 }, { text: 'b', size: 24 }, { text: 'c' }] }]);
    expect(stepSizes(rich, sel(0, 0, 0, 3), -1)).toEqual([{ type: 'p', runs: [{ text: 'a', size: 14 }, { text: 'b', size: 18 }, { text: 'c', size: 12 }] }]);
    expect(stepSizes([{ type: 'p', runs: [{ text: 'a', size: 18 }] }], sel(0, 0, 0, 1), -1)).toEqual([p('a')]);
  });

  it('a number size is a mark like any other: shown, mixed, saved and checked', () => {
    let rich: Rich = [p('abc')];
    rich = setMark(rich, sel(0, 1, 0, 2), 'size', 28);
    expect(rich).toEqual([{ type: 'p', runs: [{ text: 'a' }, { text: 'b', size: 28 }, { text: 'c' }] }]);
    expect(marksAt(rich, sel(0, 1, 0, 2)).size).toBe(28);
    expect(marksAt(rich, sel(0, 0, 0, 2)).mixed).toEqual(['size']);
    expect(hasFormatting(rich)).toBe(true);
    expect(parseRich(rich)).toEqual(rich);
  });

  // Owner request, 2026-10-30: "the nextline should continue to keep the previous size".
  it('Enter keeps the size for what is typed on the new line, in a paragraph and in a list', () => {
    for (const type of ['p', 'bullet'] as const) {
      const r = splitAt([{ type, runs: [{ text: 'big', size: 24 }] }], sel(0, 3));
      expect(r.look).toEqual({ size: 24 });
      const typed = insertText(r.rich, sel(1, 0), 'more', r.look);
      expect(typed.rich[1]).toEqual({ type, runs: [{ text: 'more', size: 24 }] });
    }
  });

  it('only the size goes on: bold, fonts and highlights stay as they were (they don’t carry)', () => {
    expect(splitAt([{ type: 'p', runs: [{ text: 'x', b: true, font: 'mono', hl: 'yellow', size: 20 }] }], sel(0, 1)).look).toEqual({ size: 20 });
    expect(splitAt([{ type: 'p', runs: [{ text: 'x', b: true }] }], sel(0, 1)).look).toBeUndefined();
  });

  it('a size chosen on an empty line, or kept from the line above, goes on again; also when Enter ends a list', () => {
    expect(splitAt([p('')], sel(0, 0), { size: 24 }).look).toEqual({ size: 24 });
    const left = splitAt([{ type: 'bullet', runs: [] }], sel(0, 0), { size: 24 });
    expect(left.rich).toEqual([{ type: 'p', runs: [] }]);
    expect(left.look).toEqual({ size: 24 });
    expect(splitAt([{ type: 'p', runs: [{ text: 'a', size: 12 }] }], sel(0, 1), { size: 28 }).look).toEqual({ size: 28 });
    expect(splitAt([{ type: 'p', runs: [{ text: 'a', size: 12 }] }], sel(0, 1), {}).look).toBeUndefined();
  });

  it('after a heading the new line is normal, unless the heading’s words were given a size', () => {
    expect(splitAt([{ type: 'h1', runs: [{ text: 'Plans' }] }], sel(0, 5)).look).toBeUndefined();
    expect(splitAt([{ type: 'h2', runs: [{ text: 'Plans', size: 28 }] }], sel(0, 5)).look).toEqual({ size: 28 });
  });

  it('Enter inside a line needs nothing extra: the words moved down keep their own size', () => {
    const r = splitAt([{ type: 'p', runs: [{ text: 'ab', size: 24 }] }], sel(0, 1));
    expect(r.rich[1]).toEqual({ type: 'p', runs: [{ text: 'b', size: 24 }] });
    expect(r.look).toBeUndefined();
  });

  it('loading keeps sizes from 10 to 36 and the old Small and Large, and drops anything else (16 is normal: no size)', () => {
    const sizes = [10, 13.6, 36, 16, 'small', 'large', 9, 37, -16, Number.NaN, Infinity, '20', '16px', null, true, 'huge'];
    const got = sizes.map((size) => parseRich([{ type: 'p', runs: [{ text: 'a', size }] }])![0].runs[0].size);
    expect(got).toEqual([10, 13.6, 36, undefined, 'small', 'large', ...Array(10).fill(undefined)]);
  });
});

// The Journal's divider (owner decision 2026-10-31, "Button + type ---"): a line of its own whose
// plain text is always `---`, so everything that reads the plain text (and an older app) sees `---`.
describe('divider', () => {
  const hr: Rich[number] = { type: 'hr', runs: [{ text: '---' }] };

  it('its plain text is ---, and a note with one keeps its formatting saved', () => {
    expect(plainOf([p('a'), hr, p('b')])).toBe('a\n---\nb');
    expect(hasFormatting([p('a'), hr])).toBe(true);
    expect(journalRich('Sun 18 Oct 2026\n\na\n---\nb', [p('a'), hr, p('b')])).toEqual([p('a'), hr, p('b')]);
    // A plain note's --- line is words, as it always was.
    expect(journalRich('Sun 18 Oct 2026\n\na\n---', undefined)).toEqual([p('a'), p('---')]);
  });

  it('loading keeps a divider, always as ---, and drops anything else in it', () => {
    expect(parseRich([{ type: 'hr', runs: [{ text: '---' }] }])).toEqual([hr]);
    expect(parseRich([{ type: 'hr', indent: 3, runs: [{ text: '<img src=x onerror=alert(1)>', b: true, hl: 'red' }, { text: 'more' }], onclick: 'x' }])).toEqual([hr]);
    expect(parseRich([{ type: 'hr' }])).toEqual([hr]);
  });

  it('an older app, which reads a kind it does not know as a plain line, shows it as --- and keeps the rest', () => {
    // The older app's fallback is the same code path as any unknown kind today.
    const older = parseRich([p('a'), { type: 'some-new-kind', runs: [{ text: '---' }] }, { type: 'p', runs: [{ text: 'b', b: true }] }])!;
    expect(older).toEqual([p('a'), p('---'), { type: 'p', runs: [{ text: 'b', b: true }] }]);
    expect(plainOf(older)).toBe(plainOf([p('a'), hr, { type: 'p', runs: [{ text: 'b', b: true }] }]));
  });

  it('the Divider button puts one after the line and the cursor on a new empty line below it', () => {
    expect(insertDivider([p('hello')], sel(0, 5))).toEqual({ rich: [p('hello'), hr, p('')], at: at(2, 0) });
    expect(insertDivider([p('hello'), p('next')], sel(0, 2))).toEqual({ rich: [p('hello'), hr, p(''), p('next')], at: at(2, 0) });
    // On an empty line, that line becomes the divider.
    expect(insertDivider([p('a'), p(''), p('b')], sel(1, 0))).toEqual({ rich: [p('a'), hr, p(''), p('b')], at: at(2, 0) });
    expect(insertDivider([p('')], sel(0, 0))).toEqual({ rich: [hr, p('')], at: at(1, 0) });
    // Selected words are replaced first.
    expect(insertDivider([p('abc')], sel(0, 1, 0, 3))).toEqual({ rich: [p('a'), hr, p('')], at: at(2, 0) });
  });

  it('typing --- on an otherwise empty line and pressing Enter makes a divider', () => {
    expect(splitAt([p('a'), p('---')], sel(1, 3))).toEqual({ rich: [p('a'), hr, p('')], at: at(2, 0) });
    expect(splitAt([{ type: 'p', runs: [{ text: '---', b: true }] }], sel(0, 3)).rich).toEqual([hr, p('')]);
  });

  it('--- anywhere else stays words', () => {
    expect(splitAt([p('a ---')], sel(0, 5)).rich).toEqual([p('a ---'), p('')]);
    expect(splitAt([p('----')], sel(0, 4)).rich).toEqual([p('----'), p('')]);
    expect(splitAt([p('---')], sel(0, 2)).rich).toEqual([p('--'), p('-')]);
    expect(splitAt([{ type: 'bullet', runs: [{ text: '---' }] }], sel(0, 3)).rich).toEqual([{ type: 'bullet', runs: [{ text: '---' }] }, { type: 'bullet', runs: [] }]);
    expect(splitAt([{ type: 'h1', runs: [{ text: '---' }] }], sel(0, 3)).rich[0]).toEqual({ type: 'h1', runs: [{ text: '---' }] });
  });

  it('Backspace at the start of the line after it, or Delete just before it, removes it like one letter', () => {
    expect(joinBackward([p('a'), hr, p('b')], 2)).toEqual({ rich: [p('a'), p('b')], at: at(1, 0) });
    expect(joinForward([p('a'), hr, p('b')], 0)).toEqual({ rich: [p('a'), p('b')], at: at(0, 1) });
    // A list item after it outdents first, as Backspace always does in a list.
    expect(joinBackward([hr, { type: 'bullet', runs: [{ text: 'x' }] }], 1).rich).toEqual([hr, p('x')]);
    // With the cursor on the divider itself, Backspace or Delete removes it.
    expect(joinBackward([p('a'), hr, p('b')], 1)).toEqual({ rich: [p('a'), p('b')], at: at(0, 1) });
    expect(joinForward([p('a'), hr, p('b')], 1)).toEqual({ rich: [p('a'), p('b')], at: at(1, 0) });
    expect(joinBackward([hr], 0)).toEqual({ rich: [p('')], at: at(0, 0) });
  });

  it('nothing merges words into it: typing, Enter, styles and lists leave it a divider', () => {
    expect(insertText([p('a'), hr], sel(1, 3), 'x')).toEqual({ rich: [p('a'), hr, p('x')], at: at(2, 1) });
    expect(insertText([hr, p('a')], sel(0, 0), 'x')).toEqual({ rich: [p('x'), hr, p('a')], at: at(0, 1) });
    expect(splitAt([p('a'), hr], sel(1, 3))).toEqual({ rich: [p('a'), hr, p('')], at: at(2, 0) });
    expect(setBlockType([p('a'), hr], 0, 1, 'h1')).toEqual([{ type: 'h1', runs: [{ text: 'a' }] }, hr]);
    expect(toggleList([p('a'), hr, p('b')], 0, 2, 'bullet')).toEqual([{ type: 'bullet', runs: [{ text: 'a' }] }, hr, { type: 'bullet', runs: [{ text: 'b' }] }]);
    expect(toggleMark([p('a'), hr, p('b')], sel(0, 0, 2, 1), 'b')).toEqual([{ type: 'p', runs: [{ text: 'a', b: true }] }, hr, { type: 'p', runs: [{ text: 'b', b: true }] }]);
    // A divider has no look of its own: bold words around it read as bold.
    expect(marksAt([{ type: 'p', runs: [{ text: 'a', b: true }] }, hr, { type: 'p', runs: [{ text: 'b', b: true }] }], sel(0, 0, 2, 1)).b).toBe(true);
  });

  it('deleting a selection that holds a divider takes it out whole', () => {
    expect(deleteSel([p('ab'), hr, p('cd')], sel(0, 1, 2, 1))).toEqual({ rich: [p('ad')], at: at(0, 1) });
    // From the divider's start: it goes; the last line's words left keep its kind, and with none left
    // (select all) it is a plain line, as the divider has no kind words can take (check of #226).
    expect(deleteSel([hr, { type: 'h1', runs: [{ text: 'cd' }] }], sel(0, 0, 1, 1))).toEqual({ rich: [{ type: 'h1', runs: [{ text: 'd' }] }], at: at(0, 0) });
    expect(deleteSel([hr, { type: 'h1', runs: [{ text: 'cd' }] }], sel(0, 0, 1, 2))).toEqual({ rich: [p('')], at: at(0, 0) });
    expect(insertText([hr, p('a'), { type: 'bullet', runs: [{ text: 'b' }] }], sel(0, 0, 2, 1), 'new')).toEqual({ rich: [p('new')], at: at(0, 3) });
    expect(deleteSel([hr, p('a'), hr], sel(0, 0, 2, 3))).toEqual({ rich: [p('')], at: at(0, 0) });
    // A selection starting just after it, or ending just before it, leaves it.
    expect(deleteSel([hr, p('ab')], sel(0, 3, 1, 1))).toEqual({ rich: [hr, p('b')], at: at(1, 0) });
    expect(deleteSel([p('ab'), hr], sel(0, 1, 1, 0))).toEqual({ rich: [p('a'), hr], at: at(0, 1) });
    expect(plainOfSel([p('ab'), hr, p('cd')], sel(0, 1, 2, 1))).toBe('b\n---\nc');
    // Ending part-way into it (its hidden ---) takes it out whole: no stray dashes (review).
    expect(deleteSel([p('ab'), hr, p('cd')], sel(0, 1, 1, 1))).toEqual({ rich: [p('a'), p('cd')], at: at(0, 1) });
    // Copy matches what cut takes out: no blank line from its edges (review).
    expect(plainOfSel([p('a'), hr, p('bc')], sel(1, 3, 2, 1))).toBe('b');
    expect(plainOfSel([p('a'), hr, p('bc')], sel(0, 0, 1, 0))).toBe('a');
  });

  it('Backspace and Delete with the cursor on it act on the side the key points to (review)', () => {
    const rich = [p('ab'), hr, p('cd')];
    // Just before it (the end of the line above): Backspace takes a letter, Delete the divider.
    expect(deleteChar(rich, at(1, 0), true)).toEqual({ rich: [p('a'), hr, p('cd')], at: at(0, 1) });
    expect(deleteChar(rich, at(1, 0), false)).toEqual({ rich: [p('ab'), p('cd')], at: at(0, 2) });
    // Just after it (the start of the line below): Backspace takes the divider, Delete a letter.
    expect(deleteChar(rich, at(1, 3), true)).toEqual({ rich: [p('ab'), p('cd')], at: at(1, 0) });
    expect(deleteChar(rich, at(1, 3), false)).toEqual({ rich: [p('ab'), hr, p('d')], at: at(2, 0) });
    // With no line on that side, there is no letter to take: nothing happens (check of #226).
    expect(deleteChar([hr, p('a')], at(0, 0), true)).toEqual({ rich: [hr, p('a')], at: at(0, 0) });
    expect(deleteChar([p('a'), hr], at(1, 3), false)).toEqual({ rich: [p('a'), hr], at: at(1, 3) });
    // The key pointing at the divider still takes it there.
    expect(deleteChar([hr, p('a')], at(0, 0), false)).toEqual({ rich: [p('a')], at: at(0, 0) });
    expect(deleteChar([p('a'), hr], at(1, 3), true)).toEqual({ rich: [p('a')], at: at(0, 1) });
    // The letter beside it is a whole letter as the reader sees it: a skin tone or a flag is not cut in half.
    expect(deleteChar([p('a👍🏽'), hr, p('b')], at(1, 0), true)).toEqual({ rich: [p('a'), hr, p('b')], at: at(0, 1) });
    expect(deleteChar([p('a'), hr, p('🇺🇸b')], at(1, 3), false)).toEqual({ rich: [p('a'), hr, p('b')], at: at(2, 0) });
    expect(deleteChar([p('é👨‍👩‍👧')], at(0, 0), false)).toEqual({ rich: [p('👨‍👩‍👧')], at: at(0, 0) });
    // Elsewhere: one letter, a whole emoji, or the line edges as before.
    expect(deleteChar([p('a😀')], at(0, 3), true)).toEqual({ rich: [p('a')], at: at(0, 1) });
    expect(deleteChar([p('😀b')], at(0, 0), false)).toEqual({ rich: [p('b')], at: at(0, 0) });
    expect(deleteChar(rich, at(2, 0), true)).toEqual({ rich: [p('ab'), p('cd')], at: at(1, 0) });
    expect(deleteChar(rich, at(0, 2), false)).toEqual({ rich: [p('ab'), p('cd')], at: at(0, 2) });
  });

  it('typing or the Divider button with the cursor on a divider goes to the line beside it (review)', () => {
    expect(insertText([p('a'), hr, p('b')], sel(1, 0), 'x')).toEqual({ rich: [p('ax'), hr, p('b')], at: at(0, 2) });
    expect(insertText([p('a'), hr, p('b')], sel(1, 3), 'x')).toEqual({ rich: [p('a'), hr, p('xb')], at: at(2, 1) });
    expect(insertDivider([p('a'), hr, p('')], sel(1, 3))).toEqual({ rich: [p('a'), hr, hr, p('')], at: at(3, 0) });
    // An empty list item keeps its bullet: the divider goes after it.
    const item = { type: 'bullet' as const, runs: [] };
    expect(insertDivider([item], sel(0, 0))).toEqual({ rich: [item, hr, p('')], at: at(2, 0) });
    // An empty heading shows nothing: it is an empty line, so it becomes the divider (check of #226).
    expect(insertDivider([p('a'), { type: 'h1', runs: [] }], sel(1, 0))).toEqual({ rich: [p('a'), hr, p('')], at: at(2, 0) });
    // Just before a divider on the first line, or after one on the last, no second divider is stacked
    // on it: the cursor goes to a new empty line below it (check of #226).
    expect(insertDivider([hr, p('ab')], sel(0, 0))).toEqual({ rich: [hr, p(''), p('ab')], at: at(1, 0) });
    expect(insertDivider([hr], sel(0, 3))).toEqual({ rich: [hr, p('')], at: at(1, 0) });
  });
});
