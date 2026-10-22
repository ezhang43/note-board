import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

// Guard (review pass, job 156): a resize that ends on a block that is no longer there (undone while
// the handle was held, or removed by another device) changes nothing and leaves no undo step.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('letting go of a resize on a block that is gone (U9)', () => {
  it('changes nothing, clears the resize, and keeps the redo steps', () => {
    const s = createStore(null);
    s.setViewportSize({ width: 1200, height: 800 });
    s.addCard('note');
    const id = s.getState().ui.selection[0];
    vi.runAllTimers();
    s.undo();
    vi.runAllTimers();
    expect(s.getState().board.cards[id]).toBeUndefined();
    expect(s.getState().ui.canRedo).toBe(true);
    const before = s.getState().board;
    s.showResize({ kind: 'card', id, dir: 'w', x: -100, y: 0, w: 340, h: null, liveW: 340, liveH: null, liveX: -100, liveY: 0, matchIds: [], label: '', labelAt: { x: 0, y: 0 } });
    s.commitResize();
    vi.runAllTimers();
    expect(s.getState().board).toBe(before);
    expect(s.getState().ui.resize).toBeNull();
    expect(s.getState().ui.canRedo).toBe(true);
    // Redo still brings the block back.
    s.redo();
    expect(s.getState().board.cards[id]).toBeDefined();
  });
});
