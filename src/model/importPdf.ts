import { escapeMarkdown } from './milanote';

// Import file… for PDFs (owner, 2026-10-06, job #28): each page's text becomes notes, with headings
// and bulleted or checkbox lists guessed where the text makes it clear. Layout, pictures and tables
// are lost. pdf.js (loaded only when a PDF is picked, `src/components/readPdf.ts`) gives each page's
// pieces of text with their place and size; this turns them into Markdown that `parseMilanote`
// reads, every piece of text escaped so it stays plain text.

/** One piece of text on a page, as pdf.js gives it: its text, left edge, baseline, width and font size. */
export type PdfText = { str: string; x: number; y: number; w: number; size: number };

export const NO_TEXT = 'That PDF has no text BusyAnts can read (it may be a scan), so nothing was added.';

type Line = { text: string; x: number; y: number; size: number };

/** Pieces with (about) the same baseline make one line, in the order the PDF draws them. */
function linesOf(page: PdfText[]): Line[] {
  const lines: (Line & { end: number })[] = [];
  for (const t of page) {
    if (!t.str) continue;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - t.y) < Math.max(last.size, t.size) / 2) {
      const gap = t.x - last.end > Math.min(last.size, t.size) * 0.15 && !/\s$/.test(last.text) && !/^\s/.test(t.str);
      last.text += (gap ? ' ' : '') + t.str;
      if (t.str.trim()) last.size = Math.max(last.size, t.size);
      last.end = t.x + t.w;
    } else lines.push({ text: t.str, x: t.x, y: t.y, size: t.str.trim() ? t.size : 0, end: t.x + t.w });
  }
  return lines
    .map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), x: l.x, y: l.y, size: l.size }))
    .filter((l) => l.text);
}

// "☐ a" / "[ ] a" → an unticked item; "☑ a" / "[x] a" → ticked; "• a", "- a", "1. a" → unticked.
// \uF0xx are Word's Symbol / Wingdings bullets and ticks as many PDFs keep them.
const UNTICKED = /^(?:[☐□❏❑❒]|\[\s?\])\s*(.+)$/;
const TICKED = /^(?:[☑☒✓✔✅]|\[[xX✓✔]\])\s*(.+)$/;
const BULLET = /^(?:[•●○◦▪▫■‣⁃∙·]\s*|(?:[*+\-–—]|\(?\d{1,3}[.)])\s+)(.+)$/;
/** A line that is only a page number ("3", "Page 3", "3 of 10", "- 3 -"). */
const PAGE_NUMBER = /^[-–\s]*(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?[-–\s]*$/i;

/** A PDF's pages of text as Markdown: "## heading", "- [ ]" items (indented to nest), notes. */
export function pdfToMarkdown(pages: PdfText[][]): string {
  const all = pages.map(linesOf);
  // The body size is the one most of the text is in; clearly bigger lines are headings.
  const chars = new Map<number, number>();
  for (const l of all.flat()) chars.set(l.size, (chars.get(l.size) ?? 0) + l.text.length);
  const body = [...chars].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

  const out: string[] = [];
  for (const lines of all) {
    // A page number: a number line no bigger than the text, first or last, standing apart (in the margin).
    const pageNumber = (l: Line, i: number) => {
      const next = i === 0 ? lines[1] : i === lines.length - 1 ? lines[i - 1] : null;
      if ((i !== 0 && i !== lines.length - 1) || l.size > body || !PAGE_NUMBER.test(l.text)) return false;
      return !next || Math.abs(next.y - l.y) > Math.max(next.size, l.size) * 2;
    };
    const kept = lines.filter((l, i) => !pageNumber(l, i));
    let note: string[] = []; // paragraphs of the note being read
    let items: { x: number; text: string; done: boolean }[] = [];
    let heading: string | null = null;
    let prev: Line | null = null;
    const endList = () => {
      if (!items.length) return;
      const xs: number[] = []; // left edge of each open level
      for (const it of items) {
        while (xs.length && xs[xs.length - 1] > it.x + 2) xs.pop();
        if (!xs.length || xs[xs.length - 1] < it.x - 2) xs.push(it.x);
        out.push(`${'    '.repeat(xs.length - 1)}- [${it.done ? 'x' : ' '}] ${escapeMarkdown(it.text)}`);
      }
      out.push('');
      items = [];
    };
    const endNote = () => {
      if (!note.length) return;
      // A note that is only a web address stays unescaped, so it becomes a link card.
      out.push(...(note.length === 1 && /^https?:\/\/\S+$/.test(note[0]) ? note : note.map(escapeMarkdown)), '');
      note = [];
    };
    const endHeading = () => {
      if (heading !== null) out.push(`## ${escapeMarkdown(heading)}`);
      heading = null;
    };

    for (const l of kept) {
      const apart = prev !== null && prev.y - l.y > Math.max(prev.size, l.size) * 1.6; // a blank line between
      const ticked = TICKED.exec(l.text);
      const item = ticked ?? UNTICKED.exec(l.text) ?? BULLET.exec(l.text);
      if (body && l.size >= body * 1.15 && l.text.length <= 120 && !item) {
        endList();
        endNote();
        // A heading over two lines (same size, right below) stays one heading.
        if (heading !== null && prev && Math.abs(prev.size - l.size) < 0.5 && !apart) heading += ` ${l.text}`;
        else {
          endHeading();
          heading = l.text;
        }
      } else if (item) {
        endNote();
        endHeading();
        items.push({ x: l.x, text: item[1].trim(), done: !!ticked });
      } else if (items.length && !apart && prev && l.x > items[items.length - 1].x + 2) {
        items[items.length - 1].text = join(items[items.length - 1].text, l.text); // an item's wrapped line
      } else {
        endList();
        endHeading();
        if (!note.length || apart) note.push(l.text);
        else note[note.length - 1] = join(note[note.length - 1], l.text);
      }
      prev = l;
    }
    endList();
    endNote();
    endHeading();
    out.push('');
  }
  return out.join('\n');
}

/** A wrapped line joined to the one before: a word broken with "-" stays joined, keeping the "-". */
const join = (a: string, b: string) => (/\w-$/.test(a) ? a + b : `${a} ${b}`);
