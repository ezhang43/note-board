import { describe, expect, it } from 'vitest';
import { createStore } from './store';

function setup() {
  const s = createStore(null, (fn) => fn());
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

describe('a new block takes the cursor', () => {
  it('a new note, link or column asks for the cursor in its first field', () => {
    const s = setup();
    for (const kind of ['note', 'link'] as const) {
      s.addCard(kind);
      expect(s.getState().ui.focusBlock).toBe(s.getState().ui.selection[0]);
    }
    s.addColumn();
    expect(s.getState().ui.focusBlock).toBe(s.getState().ui.selection[0]);
  });

  it('a new to-do list puts the cursor in its first item instead', () => {
    const s = setup();
    s.addCard('todo');
    expect(s.getState().ui.focusBlock).toBeNull();
    expect(s.getState().ui.focusItem).not.toBeNull();
  });

  it('once the field has the cursor, the request is cleared', () => {
    const s = setup();
    s.addCard('note');
    s.focusTaken(s.getState().ui.selection[0]);
    expect(s.getState().ui.focusBlock).toBeNull();
  });
});

describe('the keyboard shortcuts panel', () => {
  it('opens and closes; it is not board data, so undo ignores it', () => {
    const s = setup();
    s.toggleShortcuts();
    expect(s.getState().ui.shortcutsOpen).toBe(true);
    expect(s.getState().ui.canUndo).toBe(false);
    s.toggleShortcuts();
    expect(s.getState().ui.shortcutsOpen).toBe(false);
  });
});
