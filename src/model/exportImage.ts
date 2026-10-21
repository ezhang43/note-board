import type { Rect } from './types';

// Download as picture / PDF (job 163): the pure parts. The drawing itself is in
// components/exportBoard.ts.

/** Space left around the cards and containers, in board pixels. */
export const EXPORT_MARGIN = 40;
/** A browser, most of all an iPhone, can't draw a canvas past about 16 million pixels or 16,000 on a side. */
const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 16000;
/** A PDF reader accepts pages up to 14,400 points (200 inches) a side. */
const MAX_PAGE_POINTS = 14400;

/** The part of the board to save: every block plus a margin; null when the board is empty. */
export function exportArea(blocks: Rect[], margin = EXPORT_MARGIN): Rect | null {
  if (!blocks.length) return null;
  const x = Math.min(...blocks.map((b) => b.x)) - margin;
  const y = Math.min(...blocks.map((b) => b.y)) - margin;
  return { x, y, w: Math.max(...blocks.map((b) => b.x + b.w)) + margin - x, h: Math.max(...blocks.map((b) => b.y + b.h)) + margin - y };
}

/** 2x (sharp on a high-resolution screen), less for a board too big to draw at that size. */
export function exportScale(w: number, h: number): number {
  return Math.min(2, Math.sqrt(MAX_PIXELS / (w * h)), MAX_SIDE / w, MAX_SIDE / h);
}

/**
 * A one-page PDF holding a JPEG picture. The page is the board's size (`w` x `h` board pixels, 96 to
 * the inch), scaled down only when a PDF reader would refuse it; the picture fills the page.
 */
export function pdfFromJpeg(jpeg: Uint8Array, imgW: number, imgH: number, w: number, h: number): Uint8Array<ArrayBuffer> {
  const fit = Math.min(0.75, MAX_PAGE_POINTS / w, MAX_PAGE_POINTS / h);
  const pw = Math.round(w * fit);
  const ph = Math.round(h * fit);
  const enc = new TextEncoder();
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  const parts: Uint8Array[] = [enc.encode('%PDF-1.4\n')];
  const offsets: number[] = [];
  let length = parts[0].length;
  const add = (...chunks: (string | Uint8Array)[]) => {
    offsets.push(length);
    for (const c of chunks) {
      const bytes = typeof c === 'string' ? enc.encode(c) : c;
      parts.push(bytes);
      length += bytes.length;
    }
  };
  add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  add('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  add(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream\nendobj\n');
  add(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  const xref = `xref\n0 6\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  parts.push(enc.encode(`${xref}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
