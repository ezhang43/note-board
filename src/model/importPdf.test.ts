import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_CARDS, isPdf, readImport, TOO_LONG } from './importFile';
import { NO_TEXT, type PdfText } from './importPdf';
import type { Card, TodoCard, TodoItem } from './types';

let n = 0;
const makeId = (p: string) => `${p}${++n}`;
const noHtml = (): Document => {
  throw new Error('a PDF is never read as HTML');
};
const read = (pages: PdfText[][]) => readImport('file.pdf', pages, noHtml, makeId);
const todo = (c: Card) => c as TodoCard;
const outline = (items: TodoItem[]): unknown[] =>
  items.map((it) => (it.children.length ? [`${it.done ? '[x] ' : ''}${it.text}`, outline(it.children)] : `${it.done ? '[x] ' : ''}${it.text}`));
const summary = (cards: Card[]) =>
  cards.map((c) => [c.kind, c.kind === 'note' ? c.text : c.kind === 'link' ? `${c.title} ${c.url}` : c.kind === 'todo' ? c.title : '']);

/** A page from [size, x, y, text] lines, each one text piece (as pdf.js gives them). */
const page = (...lines: [number, number, number, string][]): PdfText[] =>
  lines.map(([size, x, y, str]) => ({ str, x, y, w: str.length * size * 0.5, size }));

describe('readImport: PDF', () => {
  it('reads headings, a wrapped paragraph, bullet and checkbox lists with nesting and ticks', () => {
    const { cards, note } = read([
      page(
        [22, 72, 720, 'Weekend trip'],
        [11, 72, 690, 'We leave on Friday after work and'],
        [11, 72, 676, 'come back on Sunday evening.'],
        [16, 72, 640, 'Packing'],
        [11, 72, 616, '• Passport'],
        [11, 72, 602, '• Charger'],
        [11, 90, 588, '• Cable'],
        [16, 72, 556, 'Bookings'],
        [11, 72, 532, '[x] Train tickets'],
        [11, 72, 518, '☐ Hotel'],
        [9, 300, 40, '1'], // a page number
      ),
      page([16, 72, 720, 'Notes'], [11, 72, 696, 'Ask Sam to feed the cat.'], [11, 72, 682, 'Water the plants.'], [9, 300, 40, '2']),
    ]);
    expect(note).toBe('');
    expect(summary(cards)).toEqual([
      ['note', 'Weekend trip\nWe leave on Friday after work and come back on Sunday evening.'],
      ['todo', 'Packing'],
      ['todo', 'Bookings'],
      ['note', 'Notes\nAsk Sam to feed the cat. Water the plants.'],
    ]);
    expect(outline(todo(cards[1]).items)).toEqual(['Passport', ['Charger', ['Cable']]]);
    expect(outline(todo(cards[2]).items)).toEqual(['[x] Train tickets', 'Hotel']);
  });

  it('joins pieces of one line, with a space where there is a gap, and reads a bullet drawn apart from its text', () => {
    const { cards } = read([
      [
        { str: 'Shopping', x: 72, y: 720, w: 80, size: 18 },
        { str: '•', x: 72, y: 700, w: 4, size: 11 },
        { str: 'Bread', x: 90, y: 700, w: 25, size: 11 },
        { str: '', x: 72, y: 686, w: 4, size: 11 }, // Word's Symbol-font bullet
        { str: 'Mi', x: 90, y: 686, w: 10, size: 11 },
        { str: 'lk', x: 100, y: 686, w: 8, size: 11 },
      ],
    ]);
    expect(summary(cards)).toEqual([['todo', 'Shopping']]);
    expect(outline(todo(cards[0]).items)).toEqual(['Bread', 'Milk']);
  });

  it('numbered lines are items, a wrapped item keeps its second line, and text after a list is a new note', () => {
    const { cards } = read([
      page(
        [11, 72, 720, '1. Call the plumber about the'],
        [11, 86, 706, 'leaking tap'],
        [11, 72, 692, '2) Pay rent'],
        [11, 72, 664, 'That is all for now.'],
      ),
    ]);
    expect(summary(cards)).toEqual([
      ['todo', ''],
      ['note', 'That is all for now.'],
    ]);
    expect(outline(todo(cards[0]).items)).toEqual(['Call the plumber about the leaking tap', 'Pay rent']);
  });

  it('paragraphs apart become lines of one note; a new page starts a new note; a lone address is a link card', () => {
    const { cards } = read([
      page([11, 72, 720, 'First paragraph.'], [11, 72, 690, 'Second paragraph.']),
      page([11, 72, 720, 'https://example.com/map']),
    ]);
    expect(summary(cards)).toEqual([
      ['note', 'First paragraph.\nSecond paragraph.'],
      ['link', ' https://example.com/map'],
    ]);
  });

  it('treats all text as plain text: Markdown marks and HTML in a PDF stay as they are', () => {
    const { cards } = read([page([11, 72, 720, '# not a heading **bold** <img src=x onerror=alert(1)> [a](javascript:x)'])]);
    expect(summary(cards)).toEqual([['note', '# not a heading **bold** <img src=x onerror=alert(1)> [a](javascript:x)']]);
  });

  it('a PDF with no text (a scan) adds nothing and says so', () => {
    expect(read([[], page([11, 72, 720, '   '])])).toEqual({ cards: [], note: NO_TEXT });
    expect(read([])).toEqual({ cards: [], note: NO_TEXT });
    expect(NO_TEXT).toBe('That PDF has no text BusyAnts can read (it may be a scan), so nothing was added.');
  });

  it('a web address inside a longer note keeps every character', () => {
    const { cards } = read([page([11, 72, 720, 'See the docs'], [11, 72, 690, 'https://example.com/__init__~~x~~'])]);
    expect(summary(cards)).toEqual([['note', 'See the docs\nhttps://example.com/__init__~~x~~']]);
  });

  it('only drops a number standing apart at the top or bottom of a page (a page number), not one in the text or a heading', () => {
    const { cards } = read([
      page([18, 72, 720, '2026'], [11, 72, 700, 'Plans for the year.'], [11, 72, 686, 'Total:'], [11, 72, 672, '42'], [9, 300, 40, 'Page 3 of 10']),
    ]);
    expect(summary(cards)).toEqual([['note', '2026\nPlans for the year. Total: 42']]);
  });

  it('a heading over two lines stays one; a word broken with "-" is joined keeping the "-"', () => {
    const { cards } = read([
      page([18, 72, 720, 'A very long title that'], [18, 72, 700, 'wraps'], [11, 72, 680, 'Our plan for the year is well-'], [11, 72, 666, 'known by now.']),
    ]);
    expect(summary(cards)).toEqual([['note', 'A very long title that wraps\nOur plan for the year is well-known by now.']]);
  });

  it('a PDF whose only text is left out (a lone page number) says it has no text', () => {
    expect(read([page([9, 300, 40, '1'])])).toEqual({ cards: [], note: NO_TEXT });
  });

  it('a PDF is known by its name or by its first bytes', () => {
    expect(isPdf('Report.PDF', 'abc')).toBe(true);
    expect(isPdf('report', '%PDF-')).toBe(true);
    expect(isPdf('notes.txt', 'Buy milk')).toBe(false);
  });

  it('keeps to the same limits as other imports', () => {
    const pages = Array.from({ length: IMPORT_MAX_CARDS + 5 }, (_, i) => page([11, 72, 720, `Page ${i} text.`]));
    const { cards, note } = read(pages);
    expect(cards).toHaveLength(IMPORT_MAX_CARDS);
    expect(note).toBe(TOO_LONG);
  });
});
