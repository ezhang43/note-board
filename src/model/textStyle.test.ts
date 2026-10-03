import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { enterItem, freshCopies, mergeNextItem } from './checklist';
import { parseBoard, serializeBoard } from './persist';
import { applyStyle, boxesOf, sizeStepChange, styleCss, styleOf, toggleChange, type Box } from './textStyle';
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

describe('formatting a whole text box (owner request)', () => {
  it('sets bold, italic, size and typeface on items, card titles, note text and column titles', () => {
    let b = board();
    b = applyStyle(b, [A], { bold: true });
    b = applyStyle(b, [{ cardId: 'L' }], { size: 'large' });
    b = applyStyle(b, [{ cardId: 'N' }], { font: 'hand' });
    b = applyStyle(b, [{ columnId: 'col' }], { italic: true });
    expect(styleOf(b, A)).toEqual({ bold: true });
    expect(styleOf(b, { cardId: 'L' })).toEqual({ size: 'large' });
    expect(styleOf(b, { cardId: 'N' })).toEqual({ font: 'hand' });
    expect(styleOf(b, { columnId: 'col' })).toEqual({ italic: true });
    expect(styleOf(b, Bx)).toBeUndefined();
  });

  it('going back to the usual look leaves nothing saved', () => {
    let b = applyStyle(board(), [A], { size: 'large' });
    b = applyStyle(b, [A], { size: 'normal' });
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

  it('size keys step from the first box: Small → Normal → Large, and stop at the ends', () => {
    const b = board();
    expect(sizeStepChange(b, [A, Bx], 1)).toEqual({ size: 'large' });
    expect(sizeStepChange(b, [A], -1)).toEqual({ size: 'small' });
    const big = applyStyle(b, [A], { size: 'large' });
    expect(sizeStepChange(big, [A], 1)).toEqual({ size: 'large' });
  });

  it('every text box in selected cards and columns', () => {
    const boxes = boxesOf(board(), ['col', 'N']);
    expect(boxes).toEqual([{ columnId: 'col' }, { cardId: 'L' }, { cardId: 'L', itemId: 'a' }, { cardId: 'L', itemId: 'a1' }, { cardId: 'L', itemId: 'b' }, { cardId: 'N' }]);
  });

  it('turns a format into the CSS for its text box', () => {
    expect(styleCss(undefined)).toEqual({});
    expect(styleCss({ size: 'large', bold: true, italic: true, font: 'mono' })).toEqual({
      '--ts': 1.3,
      fontWeight: 600,
      fontStyle: 'italic',
      fontFamily: 'var(--font-mono)',
    });
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

  it('joining two items keeps the first one\'s formatting', () => {
    const items = [{ ...item('a'), style: { italic: true as const } }, { ...item('b'), style: { bold: true as const } }];
    expect(mergeNextItem(items, 'a')!.items).toMatchObject([{ id: 'a', text: 'ab', style: { italic: true } }]);
  });

  it('pasted copies keep it', () => {
    expect(freshCopies([{ ...item('a'), style: { size: 'small' } }])[0].style).toEqual({ size: 'small' });
  });

  it('is saved and loaded, and anything unreadable is dropped', () => {
    let b = applyStyle(board(), [A], { bold: true, });
    b = applyStyle(b, [{ columnId: 'col' }], { font: 'serif' });
    b = applyStyle(b, [{ cardId: 'N' }], { size: 'small' });
    const back = parseBoard(serializeBoard(b));
    expect(styleOf(back, A)).toEqual({ bold: true });
    expect(styleOf(back, { columnId: 'col' })).toEqual({ font: 'serif' });
    expect(styleOf(back, { cardId: 'N' })).toEqual({ size: 'small' });
    const raw = JSON.parse(serializeBoard(b));
    raw.board.cards.N.style = { size: 'huge', bold: 'yes', font: 'comic' };
    expect(styleOf(parseBoard(JSON.stringify(raw)), { cardId: 'N' })).toBeUndefined();
  });
});
