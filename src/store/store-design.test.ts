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

  it('a new to-do list puts the cursor in its (empty) title; Enter there moves to its first item', () => {
    const s = setup();
    s.addCard('todo');
    const id = s.getState().ui.selection[0];
    expect(s.getState().ui.focusBlock).toBe(id);
    expect(s.getState().ui.focusItem).toBeNull();
    s.focusFirstItem(id);
    const card = s.getState().board.cards[id];
    expect(card.kind === 'todo' && card.title).toBe('');
    expect(s.getState().ui.focusItem).toBe(card.kind === 'todo' ? card.items[0].id : null);
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

describe('text size', () => {
  it('A+ / A− change it, it is remembered on this device, and undo ignores it', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const s = createStore(storage, (fn) => fn());
    expect(s.getState().view.fontSize).toBe('normal');
    s.changeFontSize(1);
    expect(s.getState().view.fontSize).toBe('large');
    expect(s.getState().ui.canUndo).toBe(false);
    expect(createStore(storage).getState().view.fontSize).toBe('large');
  });
});
