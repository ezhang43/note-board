import { describe, expect, it } from 'vitest';
import { DEFAULT_HOTKEYS, hotkeyFromEvent, labelOf, matches, problemWith, startingHotkeys, type Binding } from './hotkeys';

const ev = (key: string, extra: Partial<{ code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key,
  code: '',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
});
const b = (key: string, mod = false, shift = false): Binding => ({ key, mod, shift });

describe('the default hotkeys', () => {
  it('are today’s keys', () => {
    expect(DEFAULT_HOTKEYS).toEqual({
      hand: b('h'),
      select: b('v'),
      selectAll: b('a', true),
      copy: b('c', true),
      paste: b('v', true),
      duplicate: b('d', true),
      delete: b('delete'),
    });
  });
});

describe('startingHotkeys (what this device saved)', () => {
  it('is the defaults with nothing saved, with garbage, and with the wrong kind of value', () => {
    for (const saved of [null, '', 'garbage', '[]', '5', 'null', '{"hand":5}']) expect(startingHotkeys(saved)).toEqual(DEFAULT_HOTKEYS);
  });

  it('keeps a good choice and fills the rest with defaults', () => {
    const got = startingHotkeys(JSON.stringify({ hand: b('g'), duplicate: b('k', true, true) }));
    expect(got).toEqual({ ...DEFAULT_HOTKEYS, hand: b('g'), duplicate: b('k', true, true) });
  });

  it('ignores unknown actions and a damaged entry, keeping the others', () => {
    const got = startingHotkeys(JSON.stringify({ hand: b('g'), select: { key: 'ab', mod: false, shift: false }, nonsense: b('q'), paste: 'x' }));
    expect(got).toEqual({ ...DEFAULT_HOTKEYS, hand: b('g') });
  });

  it('ignores a key the app keeps for something else', () => {
    expect(startingHotkeys(JSON.stringify({ hand: b('z', true) }))).toEqual(DEFAULT_HOTKEYS);
    expect(startingHotkeys(JSON.stringify({ hand: b('t', true) }))).toEqual(DEFAULT_HOTKEYS);
  });

  it('goes back to every default when two actions share a key', () => {
    expect(startingHotkeys(JSON.stringify({ hand: b('g'), select: b('g') }))).toEqual(DEFAULT_HOTKEYS);
    expect(startingHotkeys(JSON.stringify({ hand: b('v') }))).toEqual(DEFAULT_HOTKEYS); // Select still has V
  });
});

describe('matches', () => {
  it('needs the same key and the same Ctrl / Shift', () => {
    expect(matches(b('h'), ev('h'))).toBe(true);
    expect(matches(b('h'), ev('H'))).toBe(true); // caps lock
    expect(matches(b('h'), ev('h', { ctrlKey: true }))).toBe(false);
    expect(matches(b('h'), ev('H', { shiftKey: true }))).toBe(false);
    expect(matches(b('d', true), ev('d', { ctrlKey: true }))).toBe(true);
    expect(matches(b('d', true), ev('d', { metaKey: true }))).toBe(true); // ⌘ on a Mac
    expect(matches(b('d', true), ev('d'))).toBe(false);
    expect(matches(b('d', true), ev('D', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matches(b('d', true, true), ev('D', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(matches(b('delete'), ev('Delete'))).toBe(true);
    expect(matches(b('delete'), ev('Delete', { shiftKey: true }))).toBe(true); // Shift+Delete always deleted
    expect(matches(b('delete'), ev('Delete', { ctrlKey: true }))).toBe(false);
  });

  it('uses the key’s place on a non-Latin keyboard, as Ctrl+Z does', () => {
    expect(matches(b('d', true), ev('в', { code: 'KeyD', ctrlKey: true }))).toBe(true);
  });
});

describe('labelOf', () => {
  it('writes the key the way the panel shows it', () => {
    expect(labelOf(b('h'))).toBe('H');
    expect(labelOf(b('d', true))).toBe('Ctrl+D');
    expect(labelOf(b('k', true, true))).toBe('Ctrl+Shift+K');
    expect(labelOf(b('delete'))).toBe('Delete');
    expect(labelOf(b('['))).toBe('[');
  });
});

describe('hotkeyFromEvent (a key pressed to record)', () => {
  it('reads a letter, with Ctrl and Shift', () => {
    expect(hotkeyFromEvent(ev('g'))).toEqual(b('g'));
    expect(hotkeyFromEvent(ev('K', { ctrlKey: true, shiftKey: true }))).toEqual(b('k', true, true));
    expect(hotkeyFromEvent(ev('k', { metaKey: true }))).toEqual(b('k', true));
    expect(hotkeyFromEvent(ev('Delete'))).toEqual(b('delete'));
  });

  it('waits while only a modifier is down', () => {
    for (const key of ['Shift', 'Control', 'Alt', 'Meta']) expect(hotkeyFromEvent(ev(key))).toBeNull();
  });

  it('refuses Alt, and keys that are not a single character', () => {
    for (const e of [ev('g', { altKey: true }), ev('Enter'), ev('Tab'), ev('ArrowLeft'), ev('Backspace'), ev('Escape'), ev(' '), ev('F5'), ev('Dead')]) {
      expect(hotkeyFromEvent(e)).toEqual({ error: expect.any(String) });
    }
  });

  it('refuses Delete with Ctrl or Shift (the browser clears its data with that)', () => {
    expect(hotkeyFromEvent(ev('Delete', { ctrlKey: true, shiftKey: true }))).toEqual({ error: expect.any(String) });
  });

  it('knows Shift+1 by the key’s place, whatever the layout types', () => {
    expect(hotkeyFromEvent(ev('!', { code: 'Digit1', shiftKey: true }))).toEqual({ error: expect.stringContaining('Shift+1') });
  });
});

describe('problemWith (a key someone wants for an action)', () => {
  it('is fine for a free key, and for the action’s own key', () => {
    expect(problemWith(DEFAULT_HOTKEYS, 'hand', b('g'))).toBeNull();
    expect(problemWith(DEFAULT_HOTKEYS, 'hand', b('h'))).toBeNull();
    expect(problemWith(DEFAULT_HOTKEYS, 'copy', b('c', true))).toBeNull(); // checklists share these three
  });

  it('names the action that already has the key', () => {
    expect(problemWith(DEFAULT_HOTKEYS, 'hand', b('v'))).toBe('V is already used by Select tool.');
    expect(problemWith(DEFAULT_HOTKEYS, 'hand', b('d', true))).toBe('Ctrl+D is already used by Duplicate.');
    expect(problemWith(DEFAULT_HOTKEYS, 'select', b('delete'))).toBe('Delete is already used by Delete selection.');
  });

  it('refuses the keys the app keeps: undo, redo, zoom, formatting, find, the lists and the shortcuts list', () => {
    for (const k of [b('z', true), b('z', true, true), b('y', true), b('=', true), b('-', true), b('0', true), b('b', true), b('i', true), b('f', true), b('x', true), b('?', false, true), b('?'), b('!', false, true)]) {
      expect(problemWith(DEFAULT_HOTKEYS, 'hand', k)).toMatch(/already used by the app/);
    }
  });

  it('keeps the checklist’s Ctrl+A, Ctrl+C and Ctrl+V for their own actions', () => {
    expect(problemWith(DEFAULT_HOTKEYS, 'hand', b('c', true))).toMatch(/already used by Copy/);
    expect(problemWith({ ...DEFAULT_HOTKEYS, copy: b('k', true) }, 'duplicate', b('c', true))).toMatch(/checklist/);
    expect(problemWith({ ...DEFAULT_HOTKEYS, copy: b('k', true) }, 'copy', b('c', true))).toBeNull();
  });

  it('refuses the keys the browser keeps', () => {
    for (const k of [b('t', true), b('w', true), b('n', true), b('q', true), b('r', true), b('l', true), b('p', true), b('s', true), b('1', true), b('9', true), b('t', true, true)]) {
      expect(problemWith(DEFAULT_HOTKEYS, 'hand', k)).toMatch(/kept by the browser/);
    }
  });
});
