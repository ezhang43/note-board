import { describe, expect, it } from 'vitest';
import { DIVIDER_KEYS_WINDOW, dividerKeyStep } from './dividerKeys';

// The Journal's Alt+I, then R shortcut for a divider (owner request 2026-11-11, as in Google Docs).
type Mods = { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; repeat?: boolean; isComposing?: boolean };
const k = (code: string, extra: Mods = {}) => ({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, ...extra });
const none = { armed: null, prevent: false, fire: false };

describe('dividerKeyStep', () => {
  it('Alt+I arms it and stops the key, so no stray character or menu shows', () => {
    expect(dividerKeyStep(null, k('KeyI', { altKey: true }), 100)).toEqual({ armed: 100, prevent: true, fire: false });
  });

  it('R right after, with Alt still held or let go, fires it and stops the key', () => {
    expect(dividerKeyStep(100, k('KeyR', { altKey: true }), 600)).toEqual({ armed: null, prevent: true, fire: true });
    expect(dividerKeyStep(100, k('KeyR'), 600)).toEqual({ armed: null, prevent: true, fire: true });
    expect(dividerKeyStep(100, k('KeyR'), 100 + DIVIDER_KEYS_WINDOW)).toEqual({ armed: null, prevent: true, fire: true });
  });

  it('R after the window, or with no Alt+I before it, is just a letter', () => {
    expect(dividerKeyStep(100, k('KeyR'), 101 + DIVIDER_KEYS_WINDOW)).toEqual(none);
    expect(dividerKeyStep(null, k('KeyR'), 600)).toEqual(none);
    expect(dividerKeyStep(null, k('KeyR', { altKey: true }), 600)).toEqual(none);
  });

  it('any other key cancels it; pressing a modifier does not', () => {
    expect(dividerKeyStep(100, k('KeyA'), 200)).toEqual(none);
    expect(dividerKeyStep(100, k('Enter'), 200)).toEqual(none);
    expect(dividerKeyStep(100, k('AltLeft', { altKey: true }), 200)).toEqual({ armed: 100, prevent: false, fire: false });
    expect(dividerKeyStep(100, k('ShiftRight'), 200).armed).toBe(100);
    expect(dividerKeyStep(100, k('MetaLeft'), 200).armed).toBe(100);
    expect(dividerKeyStep(100, k('ControlLeft'), 200).armed).toBe(100);
  });

  it('goes by the key position only, so other layouts and a Mac (where Option+I types a dead key) work', () => {
    expect(dividerKeyStep(null, { ...k('KeyI', { altKey: true }), key: 'ˆ' } as never, 5).armed).toBe(5);
    expect(dividerKeyStep(5, { ...k('KeyR', { altKey: true }), key: '®' } as never, 6).fire).toBe(true);
  });

  it('Ctrl or ⌘ with I or R is not it', () => {
    expect(dividerKeyStep(null, k('KeyI', { altKey: true, ctrlKey: true }), 5)).toEqual(none);
    expect(dividerKeyStep(null, k('KeyI', { altKey: true, metaKey: true }), 5)).toEqual(none);
    expect(dividerKeyStep(100, k('KeyR', { ctrlKey: true }), 200)).toEqual(none);
  });

  it('Shift makes them something else (a capital R), and an input method composing is left alone', () => {
    expect(dividerKeyStep(null, k('KeyI', { altKey: true, shiftKey: true }), 5)).toEqual(none);
    expect(dividerKeyStep(100, k('KeyR', { shiftKey: true }), 200)).toEqual(none);
    expect(dividerKeyStep(100, k('KeyR', { isComposing: true }), 200)).toEqual(none);
    expect(dividerKeyStep(null, k('KeyI', { altKey: true, isComposing: true }), 5)).toEqual(none);
  });

  it('a lock key between them does not cancel it', () => {
    expect(dividerKeyStep(100, k('CapsLock'), 200).armed).toBe(100);
  });

  it('a held Alt+I keeps the first press time and stays stopped', () => {
    expect(dividerKeyStep(100, k('KeyI', { altKey: true, repeat: true }), 400)).toEqual({ armed: 100, prevent: true, fire: false });
  });
});
