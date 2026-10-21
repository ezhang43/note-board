import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard, createColumn } from './cards';
import * as C from './checklist';
import { copyBlocks, pasteBlocks } from './clipboard';
import { cleanUp, restoreEntry } from './completed';
import { boardAsMarkdown } from './exportText';
import { mediaOf, webAddress } from './media';
import { DEFAULT_COLOR } from './cards';
import { isBold } from './palette';
import { marksOfLook, numbers, plainOf, type Rich } from './richText';
import { findMatches } from './search';
import { applyStyle, boxesOf } from './textStyle';
import type { Board, CompletedCard, LinkCard, NoteCard, TodoCard, TodoItem } from './types';

// Guards for sync races, odd input and small pure functions that no test reached (review pass,
// job 156). Every test here passes today; each pins a rule so a later change is deliberate.

const item = (id: string, children: TodoItem[] = [], done = false): TodoItem => ({ id, text: id, done, children });
const list = (id: string, items: TodoItem[], title = ''): TodoCard => ({ ...(createCard('todo', id) as TodoCard), title, items });
let n = 0;
const mk = (p: string) => `${p}${++n}`;
const loose = { type: 'loose', x: 500, y: 0 } as const;

function twoLists(): Board {
  let b = B.addCard(B.createBoard(), list('L1', [item('a'), item('b')]), { type: 'loose', x: 0, y: 0 });
  b = B.addCard(b, list('L2', [item('c')]), { type: 'loose', x: 400, y: 0 });
  return b;
}

describe('moving items when the target was deleted meanwhile (sync races)', () => {
  it('into a list that is gone: nothing moves', () => {
    const b = B.deleteCard(twoLists(), 'L2');
    expect(C.moveItems(b, 'L1', ['a'], { cardId: 'L2', drop: { mode: 'append' } })).toBe(b);
    expect((b.cards.L1 as TodoCard).items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('next to an item that is gone: nothing moves, in the same list or another', () => {
    const b = twoLists();
    expect(C.moveItems(b, 'L1', ['a'], { cardId: 'L1', drop: { mode: 'after', targetId: 'zz' } })).toBe(b);
    const r = C.moveItems(b, 'L1', ['a'], { cardId: 'L2', drop: { mode: 'before', targetId: 'zz' } });
    expect(r).toBe(b);
    expect((r.cards.L1 as TodoCard).items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('with only unknown items, or from a card that is not a list: nothing moves', () => {
    let b = twoLists();
    b = B.addCard(b, createCard('note', 'note'), { type: 'loose', x: 0, y: 300 });
    expect(C.moveItems(b, 'L1', ['zz'], { cardId: 'L2', drop: { mode: 'append' } })).toBe(b);
    expect(C.moveItems(b, 'note', ['a'], { cardId: 'L2', drop: { mode: 'append' } })).toBe(b);
  });

  it('insertItems nesting past 6 levels, or under an item that is gone, gives null', () => {
    const deep = [item('a', [item('b', [item('c', [item('d', [item('e')])])])])];
    expect(C.insertItems(deep, { mode: 'nest', targetId: 'e' }, [item('x', [item('y')])])).toBeNull();
    expect(C.insertItems(deep, { mode: 'before', targetId: 'zz' }, [item('x')])).toBeNull();
    expect(C.insertItems(deep, { mode: 'append' }, [item('x')])?.map((i) => i.id)).toEqual(['a', 'x']);
  });

  it('pasteItemsAfter with an unknown item adds the pasted ones at the end', () => {
    expect(C.pasteItemsAfter([item('a')], 'zz', [item('p')]).map((i) => i.id)).toEqual(['a', 'p']);
  });

  it('dropOnRow over an item that is gone does nothing', () => {
    expect(C.dropOnRow([item('a')], 'zz', { xInRow: 0, lowerHalf: true }, { ids: ['q'], height: 0 })).toBeNull();
  });

  it('extractItems skips ids that are no longer there', () => {
    const { rest, moving } = C.extractItems([item('a'), item('b')], ['zz', 'b']);
    expect(rest.map((i) => i.id)).toEqual(['a']);
    expect(moving.map((i) => i.id)).toEqual(['b']);
  });

  it('adding, moving and resizing blocks in a container or id that is gone leaves the board alone', () => {
    const b = B.addCard(B.createBoard(), createCard('note', 'n'), { type: 'loose', x: 0, y: 0 });
    expect(B.addCard(b, createCard('note', 'm'), { type: 'column', columnId: 'gone', index: 0 })).toBe(b);
    expect(B.moveCard(b, 'n', { type: 'column', columnId: 'gone', index: 0 })).toBe(b);
    expect(B.moveCard(b, 'nope', { type: 'loose', x: 5, y: 5 })).toBe(b);
    expect(B.moveColumn(b, 'gone', 5, 5)).toBe(b);
    expect(B.resizeColumn(b, 'gone', 400)).toBe(b);
  });
});

describe('Completed: small branches', () => {
  const withDone = () => {
    const b = B.addCard(B.createBoard(), list('L', [item('a', [], true), item('b')], 'Todo'), { type: 'loose', x: 0, y: 0 });
    return cleanUp(b, '2026-10-20', loose, mk).board;
  };

  it('restoring when the list is gone makes a new list in the default list colour', () => {
    const b = B.deleteCard(withDone(), 'L');
    const r = restoreEntry(b, 'a', loose, mk);
    expect(r.cardId).not.toBeNull();
    expect(r.board.cards[r.cardId!]).toMatchObject({ kind: 'todo', color: DEFAULT_COLOR.todo, title: 'Todo' });
  });

  it('Clean up of a card that is not a list does nothing', () => {
    const b = B.addCard(B.createBoard(), createCard('note', 'n'), { type: 'loose', x: 0, y: 0 });
    const r = cleanUp(b, '2026-10-21', loose, mk, 'n');
    expect(r.count).toBe(0);
    expect(r.board).toBe(b);
  });

  it('restoring an unknown item changes nothing', () => {
    const b = withDone();
    expect(restoreEntry(b, 'unknown', loose, mk)).toEqual({ board: b, cardId: null });
  });

  it('a second Clean up on the same day leaves the older day untouched', () => {
    let b = withDone();
    const older = (Object.values(b.cards).find((c) => c.kind === 'completed') as CompletedCard).groups[0];
    b = B.addCard(b, list('M', [item('z', [], true)]), { type: 'loose', x: 0, y: 300 });
    b = cleanUp(b, '2026-10-21', loose, mk).board;
    const groups = (Object.values(b.cards).find((c) => c.kind === 'completed') as CompletedCard).groups;
    expect(groups.map((g) => g.date)).toEqual(['2026-10-21', '2026-10-20']);
    expect(groups[1]).toBe(older);
  });
});

describe('textStyle odd input', () => {
  it('styling an item that is gone returns the same board', () => {
    const b = B.addCard(B.createBoard(), list('L', [item('a')]), { type: 'loose', x: 0, y: 0 });
    expect(applyStyle(b, [{ cardId: 'L', itemId: 'zz' }], { bold: true })).toBe(b);
  });

  it('the hidden Completed record has no text boxes', () => {
    const b = B.addCard(B.createBoard(), list('L', [item('a', [], true)]), { type: 'loose', x: 0, y: 0 });
    const r = cleanUp(b, '2026-10-21', loose, mk);
    expect(boxesOf(r.board, [r.cardId!])).toEqual([]);
  });
});

describe('search order', () => {
  it('containers are searched left to right, then top to bottom', () => {
    let b = B.addColumn(B.createBoard(), { ...createColumn('right'), title: 'zz', x: 600, y: 0 });
    b = B.addColumn(b, { ...createColumn('left'), title: 'zz', x: 0, y: 0 });
    b = B.addColumn(b, { ...createColumn('low'), title: 'zz', x: 0, y: 500 });
    expect(findMatches(b, 'zz').map((m) => m.key)).toEqual(['column:left', 'column:low', 'column:right']);
  });
});

describe('Download as text: odd content', () => {
  it('a link with an address that will not open is written as its title only', () => {
    let b = B.addCard(B.createBoard(), { ...(createCard('link', 'l1') as LinkCard), title: 'Docs', url: 'javascript:x' }, { type: 'loose', x: 0, y: 0 });
    b = B.addCard(b, { ...(createCard('link', 'l2') as LinkCard), title: '', url: 'data:text/html,hi' }, { type: 'loose', x: 0, y: 200 });
    const md = boardAsMarkdown(b);
    expect(md).toContain('Docs');
    expect(md).not.toContain('javascript:');
    expect(md).not.toContain('data:');
  });

  it('a note with only spaces is left out', () => {
    const b = B.addCard(B.createBoard(), { ...(createCard('note', 'n') as NoteCard), text: '   ' }, { type: 'loose', x: 0, y: 0 });
    expect(boardAsMarkdown(b).trim()).toBe('# My first board');
  });

  it('an untitled list is written as "### List", and no container means no "## On the board"', () => {
    const b = B.addCard(B.createBoard(), list('L', [item('a')]), { type: 'loose', x: 0, y: 0 });
    const md = boardAsMarkdown(b);
    expect(md).toContain('### List');
    expect(md).not.toContain('## On the board');
  });

  it('nested items are indented 4 spaces a level, and ticked ones read "- [x]"', () => {
    const b = B.addCard(B.createBoard(), list('L', [item('a', [item('b', [item('c', [], true)])])], 'T'), { type: 'loose', x: 0, y: 0 });
    const md = boardAsMarkdown(b);
    expect(md).toContain('- [ ] a');
    expect(md).toContain('    - [ ] b');
    expect(md).toContain('        - [x] c');
  });
});

describe('pasting containers', () => {
  it('a copy of a card whose original is gone but whose container is still there goes at the end of that container', () => {
    let b = B.addColumn(B.createBoard(), { ...createColumn('col'), x: 0, y: 0 });
    b = B.addCard(b, createCard('note', 'a'), { type: 'column', columnId: 'col', index: 0 });
    b = B.addCard(b, createCard('note', 'b'), { type: 'column', columnId: 'col', index: 1 });
    const clip = copyBlocks(b, ['a']);
    b = B.deleteBlocks(b, ['a']);
    const { board: out, ids } = pasteBlocks(b, clip, 1, mk);
    expect(out.columns.col.cardIds).toHaveLength(2);
    expect(out.columns.col.cardIds[1]).toBe(ids[0]);
    expect(B.problems(out)).toEqual([]);
  });

  it('a container with an empty title stays untitled when copied', () => {
    const b = B.addColumn(B.createBoard(), { ...createColumn('col'), title: '', x: 0, y: 0 });
    const { board: out, ids } = pasteBlocks(b, copyBlocks(b, ['col']), 1, mk);
    expect(out.columns[ids[0]].title).toBe('');
  });
});

describe('small pure functions', () => {
  it('numbers gives the number shown before each numbered item', () => {
    const run = (text: string) => [{ text }];
    const rich: Rich = [
      { type: 'number', runs: run('one') },
      { type: 'number', indent: 1, runs: run('sub') },
      { type: 'number', runs: run('two') },
      { type: 'bullet', runs: run('b') },
      { type: 'number', runs: run('three') },
    ];
    expect(numbers(rich)).toEqual(['1.', '1.', '2.', '', '1.']);
    expect(plainOf(rich)).toBe('1. one\n  1. sub\n2. two\n• b\n1. three');
  });

  it('marksOfLook keeps only what is on', () => {
    expect(marksOfLook({ type: 'p', b: true, i: false, u: true, s: false, size: 'large', hl: 'pink' })).toEqual({ b: true, u: true, size: 'large', hl: 'pink' });
  });

  it('mediaOf and webAddress refuse half-written addresses', () => {
    expect(mediaOf('https://youtube.com/watch')).toBeNull();
    expect(mediaOf('https://youtube.com/shorts/')).toBeNull();
    expect(mediaOf('https://vimeo.com/channels/x')).toBeNull();
    expect(webAddress('https://')).toBeNull();
  });

  it('isBold is true only for the bold colors', () => {
    expect(isBold('ocean')).toBe(true);
    expect(isBold('mint')).toBe(false);
    expect(isBold(null)).toBe(false);
  });
});
