import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { enterItem, freshCopies, mergeNextItem } from './checklist';
import { parseBoard, serializeBoard } from './persist';
import { applyStyle, boxesOf, parseStyle, plainPx, shownPx, sizeKeyDir, sizesOf, styleCss, styleOf, toggleChange, type Box } from './textStyle';
import type { Board, TodoCard, TodoItem } from './types';

const item = (id: string, children: TodoItem[] = []): TodoItem => ({ id, text: id, done: false, children });

/** Column "col" (title "Week") holding to-do list "L" (title + items a, a/a1, b); a loose note "N". */
function board(): Board {
  let b = B.addColumn(B.createBoard(), { ...createColumn('col'), title: 'Week' });
  b = B.addCard(b, { ...(createCard('todo', 'L') as TodoCard), title: 'Groceries', items: [item('a', [item('a1')]), item('b')] }, { type: 'column', columnId: 'col', index: 0 });
  b = B.addCard(b, createCard('note', 'N'), { type: 'loose', x: 600, y: 0 });
  return b;
}
const A: Box = { cardId: 'L', itemId: 'a' };
const Bx: Box = { cardId: 'L', itemId: 'b' };

/** The board with items a and b saved in the old words, as boards made before the size box are. */
function oldWords(): Board {
  const b = board();
  const list = b.cards.L as TodoCard;
  const [a, bb] = list.items;
  return { ...b, cards: { ...b.cards, L: { ...list, items: [{ ...a, style: { size: 'small' } }, { ...bb, style: { size: 'large' } }] } } };
}

describe('formatting a whole text box (owner request)', () => {
  it('sets bold, italic, size and typeface on items, card titles, note text and column titles', () => {
    let b = board();
    b = applyStyle(b, [A], { bold: true });
    b = applyStyle(b, [{ cardId: 'L' }], { size: 20 });
    b = applyStyle(b, [{ cardId: 'N' }], { font: 'hand' });
    b = applyStyle(b, [{ columnId: 'col' }], { italic: true });
    expect(styleOf(b, A)).toEqual({ bold: true });
    expect(styleOf(b, { cardId: 'L' })).toEqual({ size: 20 });
    expect(styleOf(b, { cardId: 'N' })).toEqual({ font: 'hand' });
    expect(styleOf(b, { columnId: 'col' })).toEqual({ italic: true });
    expect(styleOf(b, Bx)).toBeUndefined();
  });

  it('going back to the usual look leaves nothing saved', () => {
    let b = applyStyle(board(), [A], { size: 20 });
    b = applyStyle(b, [A], { size: 14 }); // an item's usual size
    b = applyStyle(applyStyle(b, [A], { font: 'mono' }), [A], { font: 'sans' });
    expect(styleOf(b, A)).toBeUndefined();
    expect('style' in (b.cards.L as TodoCard).items[0]).toBe(false);
  });

  it('bold on several boxes: on for all unless all are bold already, then off for all', () => {
    let b = applyStyle(board(), [A], { bold: true });
    expect(toggleChange(b, [A, Bx], 'bold')).toEqual({ bold: true });
    b = applyStyle(b, [A, Bx], { bold: true });
    expect(toggleChange(b, [A, Bx], 'bold')).toEqual({ bold: false });
  });

  it('every text box in selected cards and columns', () => {
    const boxes = boxesOf(board(), ['col', 'N']);
    expect(boxes).toEqual([{ columnId: 'col' }, { cardId: 'L' }, { cardId: 'L', itemId: 'a' }, { cardId: 'L', itemId: 'a1' }, { cardId: 'L', itemId: 'b' }, { cardId: 'N' }]);
  });

  it("turns a format into the CSS for its text box: a size is its px over the box's usual px", () => {
    expect(styleCss(undefined)).toEqual({});
    expect(styleCss({ size: 'large', bold: true, italic: true, font: 'mono' })).toEqual({
      '--ts': 1.3,
      fontWeight: 600,
      fontStyle: 'italic',
      fontFamily: 'var(--font-mono)',
    });
    expect(styleCss({ size: 'small' }, 15)).toEqual({ '--ts': 0.85 }); // the old words look exactly as before
    expect(styleCss({ size: 21 })).toEqual({ '--ts': 1.5 }); // 21px on 14px text
    expect(styleCss({ size: 30 }, 15)).toEqual({ '--ts': 2 }); // 30px on a 15px title
  });
});

// The size box (owner request 2026-11-19): the Journal's number box, on every whole-box format.
describe('the size box', () => {
  it("knows each box's usual px: 15 for a checklist's or link's title, 14 for the rest", () => {
    const b = board();
    expect(plainPx(b, { cardId: 'L' })).toBe(15);
    expect(plainPx(b, A)).toBe(14);
    expect(plainPx(b, { cardId: 'N' })).toBe(14);
    expect(plainPx(b, { columnId: 'col' })).toBe(14);
  });

  it('shows no size as the usual px, a number as itself, and the old Small / Large as the nearest whole px', () => {
    expect(shownPx(undefined, 14)).toBe(14);
    expect(shownPx({ size: 24 }, 14)).toBe(24);
    expect(shownPx({ size: 'small' }, 14)).toBe(12); // 11.9px
    expect(shownPx({ size: 'large' }, 14)).toBe(18); // 18.2px
    expect(shownPx({ size: 'small' }, 15)).toBe(13); // 12.75px
    expect(shownPx({ size: 'large' }, 15)).toBe(20); // 19.5px
  });

  it('− and + step through 10 … 36, each box from its own size, and stop at the ends', () => {
    let b = applyStyle(board(), [Bx], { size: 20 });
    b = applyStyle(b, [A, Bx], { sizeStep: 1 });
    expect(styleOf(b, A)).toEqual({ size: 16 });
    expect(styleOf(b, Bx)).toEqual({ size: 24 });
    b = applyStyle(b, [A], { sizeStep: -1 });
    expect(styleOf(b, A)).toBeUndefined(); // back on 14, the usual size: nothing saved
    b = applyStyle(applyStyle(b, [A], { size: 36 }), [A], { sizeStep: 1 });
    expect(styleOf(b, A)).toEqual({ size: 36 });
    b = applyStyle(applyStyle(b, [A], { size: 10 }), [A], { sizeStep: -1 });
    expect(styleOf(b, A)).toEqual({ size: 10 });
  });

  it('a title steps from its usual 15 to 16 or 14', () => {
    const b = board();
    expect(styleOf(applyStyle(b, [{ cardId: 'L' }], { sizeStep: 1 }), { cardId: 'L' })).toEqual({ size: 16 });
    expect(styleOf(applyStyle(b, [{ cardId: 'L' }], { sizeStep: -1 }), { cardId: 'L' })).toEqual({ size: 14 });
  });

  it('the old Small and Large step from the number they show, and are kept as they are until changed', () => {
    const b = oldWords();
    expect(styleOf(applyStyle(b, [A], { sizeStep: 1 }), A)).toBeUndefined(); // 12 → 14, the usual size
    expect(styleOf(applyStyle(b, [Bx], { sizeStep: -1 }), Bx)).toEqual({ size: 16 }); // 18 → 16
    expect(styleOf(applyStyle(b, [A], { bold: true }), A)).toEqual({ size: 'small', bold: true });
    expect(sizesOf(b, [A])).toBe(12);
    expect(sizesOf(b, [Bx])).toBe(18);
  });

  it('shows one size for boxes that share it, and none when they differ', () => {
    const b = applyStyle(board(), [Bx], { size: 20 });
    expect(sizesOf(b, [A])).toBe(14);
    expect(sizesOf(b, [A, { cardId: 'N' }])).toBe(14);
    expect(sizesOf(b, [A, Bx])).toBeNull();
    expect(sizesOf(b, [A, { cardId: 'L' }])).toBeNull(); // 14 and the title's 15
  });
});

describe('a saved size', () => {
  it('reads numbers from 10 to 36 and the old words, and drops anything else', () => {
    expect(parseStyle({ size: 20 })).toEqual({ size: 20 });
    expect(parseStyle({ size: 10 })).toEqual({ size: 10 });
    expect(parseStyle({ size: 36, bold: true })).toEqual({ size: 36, bold: true });
    expect(parseStyle({ size: 'small' })).toEqual({ size: 'small' });
    expect(parseStyle({ size: 'large' })).toEqual({ size: 'large' });
    for (const bad of [9, 37, 0, -14, Number.NaN, Infinity, '20', 'huge', null, true]) expect(parseStyle({ size: bad, italic: true }), String(bad)).toEqual({ italic: true });
  });

  it('a number survives save and load', () => {
    let b = applyStyle(board(), [A], { size: 28 });
    b = applyStyle(b, [{ cardId: 'L' }], { size: 12 });
    b = applyStyle(b, [{ columnId: 'col' }], { size: 36 });
    const back = parseBoard(serializeBoard(b));
    expect(styleOf(back, A)).toEqual({ size: 28 });
    expect(styleOf(back, { cardId: 'L' })).toEqual({ size: 12 });
    expect(styleOf(back, { columnId: 'col' })).toEqual({ size: 36 });
  });

  it('boards saved before keep their words, unchanged', () => {
    const back = parseBoard(serializeBoard(oldWords()));
    expect(styleOf(back, A)).toEqual({ size: 'small' });
    expect(styleOf(back, Bx)).toEqual({ size: 'large' });
  });

  it('an older app, which reads only the words, keeps the rest of the look and the text and shows the size as normal', () => {
    // The older app's parseStyle, as it was before the size box (kept here to show what it does with a number).
    const oldParse = (v: Record<string, unknown>) => ({
      size: v.size === 'small' || v.size === 'large' ? v.size : undefined,
      bold: v.bold === true || undefined,
      italic: v.italic === true || undefined,
      font: v.font === 'serif' || v.font === 'rounded' || v.font === 'hand' || v.font === 'mono' ? v.font : undefined,
    });
    const saved = JSON.parse(serializeBoard(applyStyle(board(), [A], { size: 24, bold: true })));
    const style = saved.board.cards.L.items[0].style;
    expect(style).toEqual({ size: 24, bold: true });
    expect(oldParse(style)).toEqual({ size: undefined, bold: true, italic: undefined, font: undefined });
  });
});

describe('formatting stays with the text', () => {
  it('Enter keeps it on both halves and on a new item below', () => {
    const items = [{ ...item('a'), text: 'milk eggs', style: { bold: true as const } }];
    const split = enterItem(items, 'a', 4, 4, item('new'))!;
    expect(split.items.map((i) => i.style)).toEqual([{ bold: true }, { bold: true }]);
    const below = enterItem(items, 'a', 9, 9, item('new2'))!;
    expect(below.items[1].style).toEqual({ bold: true });
  });

  it("joining two items keeps the first one's formatting", () => {
    const items = [{ ...item('a'), style: { italic: true as const } }, { ...item('b'), style: { bold: true as const } }];
    expect(mergeNextItem(items, 'a')!.items).toMatchObject([{ id: 'a', text: 'ab', style: { italic: true } }]);
  });

  it('pasted copies keep it', () => {
    expect(freshCopies([{ ...item('a'), style: { size: 'small' } }])[0].style).toEqual({ size: 'small' });
    expect(freshCopies([{ ...item('a'), style: { size: 24 } }])[0].style).toEqual({ size: 24 });
  });

  it('is saved and loaded, and anything unreadable is dropped', () => {
    let b = applyStyle(board(), [A], { bold: true });
    b = applyStyle(b, [{ columnId: 'col' }], { font: 'serif' });
    b = applyStyle(b, [{ cardId: 'N' }], { size: 12 });
    const back = parseBoard(serializeBoard(b));
    expect(styleOf(back, A)).toEqual({ bold: true });
    expect(styleOf(back, { columnId: 'col' })).toEqual({ font: 'serif' });
    expect(styleOf(back, { cardId: 'N' })).toEqual({ size: 12 });
    const raw = JSON.parse(serializeBoard(b));
    raw.board.cards.N.style = { size: 'huge', bold: 'yes', font: 'comic' };
    expect(styleOf(parseBoard(JSON.stringify(raw)), { cardId: 'N' })).toBeUndefined();
  });
});

describe('the Google Docs size keys (owner request, 2026-11-06)', () => {
  const k = (key: string, code: string, shiftKey = true) => ({ key, code, shiftKey });
  it('Shift+> / Shift+. is larger and Shift+< / Shift+, is smaller, by character or by key position', () => {
    expect(sizeKeyDir(k('>', 'Period'))).toBe(1);
    expect(sizeKeyDir(k('<', 'Comma'))).toBe(-1);
    expect(sizeKeyDir(k('.', 'Period'))).toBe(1);
    expect(sizeKeyDir(k(',', 'Comma'))).toBe(-1);
    expect(sizeKeyDir(k('>', 'KeyZ'))).toBe(1); // another layout: the character decides
    expect(sizeKeyDir(k('x', 'Period'))).toBe(1); // another layout: the key position decides
  });
  it('is nothing without Shift or on other keys', () => {
    expect(sizeKeyDir(k('.', 'Period', false))).toBeNull();
    expect(sizeKeyDir(k(',', 'Comma', false))).toBeNull();
    expect(sizeKeyDir(k('b', 'KeyB'))).toBeNull();
  });
});
