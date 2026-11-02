import type { ItemPoint } from '../model/wordRange';

// Where a pointer is in a checklist's text, letter by letter, for the Word-style highlight across items
// (owner request, 2026-11-01). The browser's own caret-from-point can't see into a text box, so a copy of the
// box's text, laid out exactly like it, is put over it for a moment and asked instead.

type CaretDoc = Document & {
  caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?(x: number, y: number): Range | null;
};

/**
 * The letter offset in `el`'s text nearest to the screen point: on the line nearest to `y` (a point above,
 * below or between lines goes to the nearest one), at the letter nearest to `x` (past a line's end is its end).
 */
export function offsetAt(el: HTMLTextAreaElement, x: number, y: number): number {
  const text = el.value;
  const host = el.parentElement;
  if (!text || !host) return 0;
  const mirror = document.createElement('span');
  mirror.className = 'text-mirror';
  mirror.textContent = text;
  host.append(mirror);
  try {
    const node = mirror.firstChild!;
    const all = document.createRange();
    all.selectNodeContents(mirror);
    const lines = [...all.getClientRects()].filter((r) => r.height > 0);
    if (!lines.length) return 0;
    const line = lines.reduce((best, r) => (Math.abs(mid(r) - y) < Math.abs(mid(best) - y) ? r : best));
    const box = mirror.getBoundingClientRect();
    const px = Math.max(box.left + 1, Math.min(x, box.right - 1));
    const py = mid(line);
    const doc = document as CaretDoc;
    const pos = doc.caretPositionFromPoint?.(px, py);
    const range = pos ? null : doc.caretRangeFromPoint?.(px, py);
    const [hit, offset] = pos ? [pos.offsetNode, pos.offset] : range ? [range.startContainer, range.startOffset] : [null, 0];
    if (hit === node) return Math.min(offset, text.length);
    // simple: the copy wasn't what the browser found there (something drawn over the text); fall back to the line's nearer end.
    return px < (box.left + box.right) / 2 ? 0 : text.length;
  } finally {
    mirror.remove();
  }
}

const mid = (r: { top: number; bottom: number }) => (r.top + r.bottom) / 2;

/** The item text box of a checklist row. */
function textOf(row: Element): HTMLTextAreaElement | null {
  return row.querySelector<HTMLTextAreaElement>('.item-text > textarea');
}

/** The letter under (or nearest to) the pointer in the list `cardId`: in the row whose text box is nearest to `y`. */
export function nearestPoint(cardId: string, x: number, y: number): ItemPoint | null {
  const card = document.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
  if (!card) return null;
  let best: { id: string; el: HTMLTextAreaElement; d: number } | null = null;
  for (const row of card.querySelectorAll<HTMLElement>('[data-item-id]')) {
    const el = textOf(row);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (!best || d < best.d) best = { id: row.dataset.itemId!, el, d };
  }
  return best && { id: best.id, offset: offsetAt(best.el, x, y) };
}

/** Where a text selection was started in a text box (the end that stays put when it is extended). */
export function anchorOf(el: HTMLTextAreaElement): number {
  return el.selectionDirection === 'backward' ? el.selectionEnd : el.selectionStart;
}
