import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import { copyBlocks, pasteBlocks } from './clipboard';
import { blocksTouching } from './layout';
import type { Board, TodoCard } from './types';

let n = 0;
const ids = (p: string) => `${p}${++n}`;

/** Column "Ideas" (c1) holding a and b, plus a loose to-do list z at 500,40. */
function board(): Board {
  let b = B.createBoard();
  b = B.addColumn(b, { ...createColumn('c1'), title: 'Ideas', x: 40, y: 40 });
  b = B.addCard(b, createCard('note', 'a'), { type: 'column', columnId: 'c1', index: 0 });
  b = B.addCard(b, createCard('note', 'b'), { type: 'column', columnId: 'c1', index: 1 });
  b = B.addCard(b, createCard('todo', 'z'), { type: 'loose', x: 500, y: 40 });
  return b;
}

describe('copy and paste', () => {
  it('a column copies with its cards, titled "… copy", 40px down and right', () => {
    const b = board();
    const { board: out, ids: pasted } = pasteBlocks(b, copyBlocks(b, ['c1']), 1, ids);
    expect(pasted).toHaveLength(1);
    const col = out.columns[pasted[0]];
    expect(col).toMatchObject({ title: 'Ideas copy', x: 80, y: 80 });
    expect(col.cardIds).toHaveLength(2);
    expect(col.cardIds).not.toContain('a');
    expect(B.problems(out)).toEqual([]);
  });

  it('each paste lands a further 40px away', () => {
    const b = board();
    const clip = copyBlocks(b, ['z']);
    const second = pasteBlocks(b, clip, 2, ids);
    expect(second.board.cards[second.ids[0]]).toMatchObject({ x: 580, y: 120 });
  });

  it('pasted cards and checklist items get new ids', () => {
    const b = board();
    const { board: out, ids: pasted } = pasteBlocks(b, copyBlocks(b, ['z']), 1, ids);
    const copy = out.cards[pasted[0]] as TodoCard;
    const orig = b.cards.z as TodoCard;
    expect(copy.id).not.toBe('z');
    expect(copy.items[0].id).not.toBe(orig.items[0].id);
    expect(copy.title).toBe(orig.title);
  });

  it('a card copied from a column is pasted into that column, right below the original', () => {
    const b = board();
    const { board: out, ids: pasted } = pasteBlocks(b, copyBlocks(b, ['a']), 1, ids);
    expect(out.columns.c1.cardIds).toEqual(['a', pasted[0], 'b']);
    expect(B.problems(out)).toEqual([]);
  });

  it('a card whose column is also selected is not copied twice', () => {
    const entries = copyBlocks(board(), ['c1', 'a', 'z']);
    expect(entries.map((e) => e.kind)).toEqual(['column', 'card']);
  });

  it('copies are independent of later edits to the originals', () => {
    let b = board();
    const clip = copyBlocks(b, ['c1']);
    b = B.updateColumn(b, 'c1', { title: 'Changed' });
    const { board: out, ids: pasted } = pasteBlocks(b, clip, 1, ids);
    expect(out.columns[pasted[0]].title).toBe('Ideas copy');
  });
});

describe('group actions', () => {
  it('deletes several blocks at once, columns with their cards', () => {
    const out = B.deleteBlocks(board(), ['c1', 'z']);
    expect(out.order).toEqual([]);
    expect(out.cards).toEqual({});
  });

  it('moves several blocks together by the same amount', () => {
    const out = B.moveBlocksBy(board(), ['c1', 'z'], 100, 20);
    expect(out.columns.c1).toMatchObject({ x: 140, y: 60 });
    expect(out.cards.z).toMatchObject({ x: 600, y: 60 });
  });

  it('the selection box selects every block it touches', () => {
    const b = board();
    const h = () => 200;
    expect(blocksTouching(b, { x: 0, y: 0, w: 60, h: 60 }, h)).toEqual(['c1']);
    expect(blocksTouching(b, { x: 300, y: 100, w: 220, h: 20 }, h)).toEqual(['c1', 'z']);
    expect(blocksTouching(b, { x: 330, y: 0, w: 100, h: 500 }, h)).toEqual([]);
  });
});
