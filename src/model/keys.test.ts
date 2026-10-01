import { describe, expect, it } from 'vitest';
import { shortcutKey } from './keys';

describe('which key a shortcut uses', () => {
  it('is the typed letter on Latin layouts (including AZERTY)', () => {
    expect(shortcutKey({ key: 'z', code: 'KeyZ' })).toBe('z');
    expect(shortcutKey({ key: 'Z', code: 'KeyZ' })).toBe('z');
    expect(shortcutKey({ key: 'a', code: 'KeyQ' })).toBe('a');
  });
  it('is the key position on non-Latin layouts, so Ctrl+Z still undoes', () => {
    expect(shortcutKey({ key: 'я', code: 'KeyZ' })).toBe('z');
    expect(shortcutKey({ key: 'ς', code: 'KeyW' })).toBe('w');
  });
  it('leaves other keys alone', () => {
    expect(shortcutKey({ key: 'Delete', code: 'Delete' })).toBe('delete');
    expect(shortcutKey({ key: '=', code: 'Equal' })).toBe('=');
  });
});
