import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anyExpanded, setAllCollapsed } from '../model/board';
import { completedCardOf } from '../model/completed';
import type { TodoCard } from '../model/types';
import { createStore } from './store';

// Job #143: the small findings of the board-logic review (job #137, part B).

beforeEach(() => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

type S = ReturnType<typeof createStore>;

function store() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

/** A new checklist with these items ("+x" is ticked); returns its id. */
function list(s: S, texts: string[]): string {
  s.addCard('todo');
  const id = s.getState().ui.selection[0];
  let item = (s.getState().board.cards[id] as TodoCard).items[0].id;
  texts.forEach((t, i) => {
    if (i) {
      s.itemEnter(id, item);
      item = s.getState().ui.focusItem!;
    }
    s.setItemText(id, item, t.replace(/^\+/, ''));
    if (t.startsWith('+')) s.toggleItem(id, item);
  });
  return id;
}
const card = (s: S, id: string) => s.getState().board.cards[id] as TodoCard;

describe('L1: Collapse all ignores the hidden Completed record', () => {
  it('after Clean up and collapsing every visible card, it says Expand all and does nothing more', () => {
    const s = store();
    const id = list(s, ['+milk', 'eggs']);
    expect(s.cleanUp()).toBe(1);
    expect(completedCardOf(s.getState().board)?.collapsed).toBe(false);
    s.toggleCollapsed(id);
    expect(anyExpanded(s.getState().board)).toBe(false);
    const before = s.getState().board;
    expect(setAllCollapsed(before, true)).toBe(before);
    s.toggleAllCollapsed(); // it expands the visible card, rather than "collapsing" the record
    vi.runAllTimers();
    expect(s.getState().board.cards[id].collapsed).toBe(false);
  });
});

describe('L2: Backspace in the last open blank item', () => {
  it('is refused, so the list keeps an open item to type in (kept after job 200: ticked items stay in place)', () => {
    const s = store();
    const id = list(s, ['+milk', 'x']);
    const open = card(s, id).items.find((i) => !i.done)!;
    s.setItemText(id, open.id, '');
    const before = s.getState().board;
    expect(s.itemBackspace(id, open.id)).toBe(false);
    expect(s.getState().board).toBe(before);
  });
});

describe('L3: Expand all gives back the layout whatever order the blocks were picked in', () => {
  it('compares the selection as a set', () => {
    const s = createStore(null);
    s.setViewportSize({ width: 1200, height: 800 });
    const place = (x: number, y: number) => {
      s.addCard('note');
      const id = s.getState().ui.selection[0];
      const c = s.getState().board.cards[id];
      s.startDrag('card', id, c.x, c.y);
      s.moveDrag(x, y, null);
      s.dropDrag(null);
      s.setMeasuredHeight(id, 160);
      vi.runAllTimers();
      return id;
    };
    const a = place(0, 0);
    const b = place(300, 0);
    const c = place(0, 600);
    const select = (ids: string[]) => {
      s.select(ids[0]);
      for (const id of ids.slice(1)) s.pressBlock(id, true);
    };
    select([a, b]);
    s.toggleAllCollapsed();
    s.setMeasuredHeight(a, 40);
    s.setMeasuredHeight(b, 40);
    vi.runAllTimers();
    const collapsedY = s.getState().board.cards[c].y;
    select([b, a]);
    vi.advanceTimersByTime(10_000); // well after the gaps closed
    s.toggleAllCollapsed();
    s.setMeasuredHeight(a, 160);
    s.setMeasuredHeight(b, 160);
    vi.runAllTimers();
    expect(s.getState().board.cards[a].collapsed).toBe(false);
    expect(collapsedY).toBeLessThan(600);
    expect(s.getState().board.cards[c].y).toBe(600);
  });
});

describe('L4: a tick just before an old version is opened', () => {
  it('is applied at once (job 200: no animation), not lost', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.useFakeTimers();
    try {
      const s = createStore(null);
      s.setViewportSize({ width: 1200, height: 800 });
      const id = list(s, ['a', 'b']);
      const first = card(s, id).items[0].id;
      s.toggleItem(id, first);
      expect(card(s, id).items[0].done).toBe(true); // applied at once
      s.previewVersion({ id: 'v', at: 0 } as never, s.getState().board);
      vi.runAllTimers();
      s.endPreview();
      expect(card(s, id).items.find((i) => i.id === first)!.done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('L5: dragging an item while items in several lists are selected', () => {
  it('does nothing', () => {
    const s = store();
    const a = list(s, ['one', 'two']);
    const b = list(s, ['three']);
    s.selectWholeList(a);
    s.selectAllStep();
    expect(s.getState().ui.itemSel?.lists?.length).toBe(2);
    s.startItemDrag(a, card(s, a).items[0].id, { x: 0, y: 0 });
    expect(s.getState().ui.itemDrag).toBeNull();
    s.startItemDrag(b, card(s, b).items[0].id, { x: 0, y: 0 });
    expect(s.getState().ui.itemDrag).toBeNull();
  });
});

describe('L7: a format that changes nothing', () => {
  it('makes no undo step and leaves Redo alone', () => {
    const s = store();
    const id = list(s, ['a']);
    const first = card(s, id).items[0].id;
    s.formatBoxes([{ cardId: id, itemId: first }], { size: 'large' });
    const board = s.getState().board;
    s.formatBoxes([{ cardId: id, itemId: first }], { size: 'large' });
    s.formatBoxes([{ cardId: id }], { size: 'normal' });
    s.formatBoxes([{ cardId: id }], { font: 'sans' });
    expect(s.getState().board).toBe(board);
    s.undo(); // undoes the one real change
    expect(card(s, id).items[0].style).toBeUndefined();
  });
});
