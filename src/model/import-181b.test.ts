// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readImport } from './importFile';
import { pdfToMarkdown, type PdfText } from './importPdf';

// Board-logic review 181 (part B), import findings (job 183).
let n = 0;
const makeId = (p: string) => `${p}${++n}`;
const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('B-L4: a web address in an HTML paragraph', () => {
  it('keeps its brackets and dots (no backslashes in the link)', () => {
    const { cards } = readImport('p.html', '<p>https://en.wikipedia.org/wiki/Foo_(bar)</p>', parseHtml, makeId);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: 'link', url: 'https://en.wikipedia.org/wiki/Foo_(bar)' });
  });

  it('a plain address still becomes a link card', () => {
    const { cards } = readImport('p.html', '<p>https://example.com/a_b</p>', parseHtml, makeId);
    expect(cards[0]).toMatchObject({ kind: 'link', url: 'https://example.com/a_b' });
  });
});


describe('B-L12: a PDF with one very long paragraph or line', () => {
  const piece = (str: string, x: number, y: number, size = 12): PdfText => ({ str, x, y, w: str.length * 5, size });

  it('10,000 wrapped lines in one paragraph are read quickly', () => {
    const page = Array.from({ length: 10_000 }, (_, i) => piece('word-', 50, 100_000 - i * 14));
    const t = performance.now();
    const md = pdfToMarkdown([page]);
    expect(performance.now() - t).toBeLessThan(5000);
    expect(md.length).toBeGreaterThan(40_000);
  }, 30000);

  it('20,000 pieces on one line are read quickly', () => {
    const page = Array.from({ length: 20_000 }, (_, i) => piece('ab', 50 + i * 12, 700));
    const t = performance.now();
    pdfToMarkdown([page]);
    expect(performance.now() - t).toBeLessThan(5000);
  }, 30000);

  it('sizes a hair apart count as one body size, so a heading is still found', () => {
    const body = Array.from({ length: 20 }, (_, i) => piece(`line ${i} of the body text here`, 50, 700 - i * 14, 11.9 + (i % 3) * 0.04));
    const md = pdfToMarkdown([[piece('Big title', 50, 760, 20), ...body]]);
    expect(md).toContain('## Big title');
    expect(md).not.toContain('## line');
  });
});
