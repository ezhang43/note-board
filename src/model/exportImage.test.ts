import { describe, expect, it } from 'vitest';
import { backupFileName } from './exportText';
import { EXPORT_MARGIN, exportArea, exportScale, pdfFromJpeg } from './exportImage';

// Download as picture / PDF (job 163): the area of the board that is saved, how sharp the picture
// is, and the PDF file that wraps it.

describe('export file names', () => {
  it('are named like the backup, with the picture or PDF ending', () => {
    expect(backupFileName('Home', new Date(2026, 9, 22), 'png')).toBe('BusyAnts - Home - 2026-10-22.png');
    expect(backupFileName('Home', new Date(2026, 9, 22), 'pdf')).toBe('BusyAnts - Home - 2026-10-22.pdf');
  });
});

describe('exportArea', () => {
  it('is nothing for an empty board', () => {
    expect(exportArea([])).toBeNull();
  });
  it('covers every block, plus a margin all round', () => {
    const area = exportArea([
      { x: 100, y: 200, w: 300, h: 100 },
      { x: -50, y: 500, w: 100, h: 80 },
      { x: 700, y: 20, w: 40, h: 40 },
    ]);
    expect(area).toEqual({ x: -50 - EXPORT_MARGIN, y: 20 - EXPORT_MARGIN, w: 740 + 50 + 2 * EXPORT_MARGIN, h: 580 - 20 + 2 * EXPORT_MARGIN });
  });
});

describe('exportScale', () => {
  it('is 2x (sharp on a high-resolution screen) for an ordinary board', () => {
    expect(exportScale(1200, 800)).toBe(2);
  });
  it('shrinks for a huge board so the picture stays under what a phone can draw', () => {
    const s = exportScale(10000, 8000);
    expect(s).toBeLessThan(2);
    expect(s).toBeGreaterThan(0);
    expect(10000 * s * 8000 * s).toBeLessThanOrEqual(16_000_000);
    expect(10000 * s).toBeLessThanOrEqual(16000);
  });
  it('keeps one very long strip under the side limit too', () => {
    expect(30000 * exportScale(30000, 100)).toBeLessThanOrEqual(16000);
  });
});

describe('pdfFromJpeg', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

  it('makes one page, sized to the board (96 px = 72 points), holding the picture', () => {
    const pdf = text(pdfFromJpeg(jpeg, 2400, 1600, 1200, 800));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/MediaBox [0 0 900 600]');
    expect(pdf).toContain('/Width 2400');
    expect(pdf).toContain('/Height 1600');
    expect(pdf).toContain('/Filter /DCTDecode');
    expect(pdf).toContain('/Count 1');
  });
  it('points its cross-reference table at the real objects', () => {
    const pdf = text(pdfFromJpeg(jpeg, 100, 100, 100, 100));
    const start = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(start, start + 4)).toBe('xref');
    const offsets = [...pdf.slice(start).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((o, i) => expect(pdf.slice(o, o + 6)).toBe(`${i + 1} 0 ob`));
  });
  it('scales a very large board down to the biggest page a PDF reader accepts', () => {
    const pdf = text(pdfFromJpeg(jpeg, 100, 100, 40000, 20000));
    const [, w, h] = /\/MediaBox \[0 0 (\d+) (\d+)\]/.exec(pdf)!.map(Number);
    expect(Math.max(w, h)).toBeLessThanOrEqual(14400);
    expect(w / h).toBeCloseTo(2, 1);
  });
});
