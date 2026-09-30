import { describe, expect, it } from 'vitest';
import { createBoard, renameBoard } from './board';
import { emptyHistory, HISTORY_LIMIT, recordChange, redo, TYPING_MERGE_MS, undo } from './history';

const named = (name: string) => renameBoard(createBoard(), name);

describe('undo history', () => {
  it('undoes and redoes a change', () => {
    const a = named('a');
    const b = named('b');
    const h = recordChange(emptyHistory, a, null, 0);
    const u = undo(h, b)!;
    expect(u.board).toBe(a);
    const r = redo(u.history, u.board)!;
    expect(r.board).toBe(b);
  });

  it('has nothing to undo or redo at first', () => {
    expect(undo(emptyHistory, createBoard())).toBeNull();
    expect(redo(emptyHistory, createBoard())).toBeNull();
  });

  it('a burst of typing in one field is one step; a pause or another field starts a new one', () => {
    let h = recordChange(emptyHistory, named(''), 'text:n1', 1000);
    h = recordChange(h, named('H'), 'text:n1', 1300);
    h = recordChange(h, named('He'), 'text:n1', 1600);
    expect(h.past).toHaveLength(1);
    h = recordChange(h, named('Hel'), 'text:n1', 1600 + TYPING_MERGE_MS + 1);
    expect(h.past).toHaveLength(2);
    h = recordChange(h, named('Hell'), 'text:n2', 3000);
    expect(h.past).toHaveLength(3);
    h = recordChange(h, named('Hello'), null, 3001);
    h = recordChange(h, named('Hello!'), null, 3002);
    expect(h.past).toHaveLength(5); // non-typing changes are never merged
  });

  it('keeps at most 100 steps', () => {
    let h = emptyHistory;
    for (let i = 0; i < 150; i++) h = recordChange(h, named(String(i)), null, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0].name).toBe('50');
  });

  it('a new change after undo clears redo', () => {
    let h = recordChange(emptyHistory, named('a'), null, 0);
    const u = undo(h, named('b'))!;
    expect(u.history.future).toHaveLength(1);
    h = recordChange(u.history, u.board, null, 10);
    expect(h.future).toHaveLength(0);
  });

  it('undo right after typing starts a fresh step for the next typing', () => {
    let h = recordChange(emptyHistory, named(''), 'text:n1', 0);
    const u = undo(h, named('abc'))!;
    h = recordChange(u.history, u.board, 'text:n1', 100);
    expect(h.past).toHaveLength(1);
  });
});
