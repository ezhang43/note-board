import { describe, expect, it } from 'vitest';
import { linkAt, linksIn } from './links';

// Clickable links in text (owner request, 2026-10-05).

describe('finding web addresses in text', () => {
  it('finds http(s) and www addresses, leaving off trailing punctuation, each once', () => {
    expect(linksIn('See https://example.com/a. Also www.test.org/x?y=1, and https://example.com/a!')).toEqual([
      { text: 'https://example.com/a', href: 'https://example.com/a', start: 4, end: 25 },
      { text: 'www.test.org/x?y=1', href: 'https://www.test.org/x?y=1', start: 32, end: 50 },
    ]);
  });
  it('keeps closing brackets that belong to the address', () => {
    expect(linksIn('(https://en.wikipedia.org/wiki/Ant_(disambiguation))')[0].text).toBe('https://en.wikipedia.org/wiki/Ant_(disambiguation)');
  });
  it('finds nothing in plain text', () => {
    expect(linksIn('Buy milk at 5.30')).toEqual([]);
  });
});

describe('the address at a spot in the text (Ctrl+click)', () => {
  const text = 'go to https://example.com now';
  it('is found anywhere inside it', () => {
    expect(linkAt(text, 6)).toBe('https://example.com/');
    expect(linkAt(text, 20)).toBe('https://example.com/');
  });
  it('is null outside any address', () => {
    expect(linkAt(text, 2)).toBeNull();
    expect(linkAt(text, 27)).toBeNull();
  });
});
