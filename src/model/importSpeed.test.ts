// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readImport } from './importFile';
import type { Card } from './types';

// Job #143 (M3): odd big files must not freeze the tab (the reading rules were quadratic).
let n = 0;
const makeId = (p: string) => `${p}${++n}`;
const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const read = (name: string, text: string) => readImport(name, text, parseHtml, makeId);
const label = (c: Card) => (c.kind === 'todo' ? c.title : c.kind === 'note' ? c.text : '');

function fast(name: string, text: string) {
  const t = Date.now();
  const out = read(name, text);
  expect(Date.now() - t).toBeLessThan(2500);
  return out;
}

describe('readImport: odd big files finish fast', () => {
  it('a .txt of blank lines', () => {
    const { cards } = fast('padding.txt', 'first\n' + '\n'.repeat(200_000) + 'last');
    expect(cards.map(label)).toEqual(['first', 'last']);
  });

  it('a .txt of lines holding only spaces, then a heading', () => {
    const { cards } = fast('padding.txt', ' \n'.repeat(100_000) + '## Later\n- [ ] one');
    expect(cards.some((c) => c.kind === 'todo' && c.title === 'Later')).toBe(true);
  });

  it('a long Markdown line with stray ** __ ~~ marks', () => {
    for (const mark of ['**', '__', '~~']) {
      const { cards } = fast('long.md', `${mark}a `.repeat(80_000));
      expect(cards).toHaveLength(1);
    }
  });

  it('a long line of brackets, angle marks and backslashes', () => {
    for (const piece of ['[', '[a](', '<http://', '\\*', '[a](b) ']) fast('long.md', piece.repeat(40_000));
  });

  it('a heading with a very long gap of spaces', () => {
    const { cards } = fast('h.md', `## Title${' '.repeat(300_000)}x${' '.repeat(300_000)}`);
    expect(cards.some((c) => c.kind === 'todo' && c.title.startsWith('Title'))).toBe(true);
  });

  it('still reads the small cases the same way', () => {
    const md = (s: string) => read('a.md', s).cards.map(label);
    expect(md('## Learn C#')).toEqual(['Learn C#']);
    expect(md('## Title ##')).toEqual(['Title']);
    expect(md('##')).toEqual(['']);
    expect(md('## Title   ###  ')).toEqual(['Title']);
    expect(md('a **bold** and __b__ and ~~c~~ text')).toEqual(['a bold and b and c text']);
    expect(md('**unclosed text')).toEqual(['**unclosed text']);
    expect(md('a **two\nlines** b')).toEqual(['a **two\nlines** b']);
  });
});
