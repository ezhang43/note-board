import type { CSSProperties } from 'react';
import { styleCss, type Box } from '../model/textStyle';
import type { TextStyle } from '../model/types';

// Text boxes carry `data-box` (on the wrapper around the field) so the format bar and the
// formatting keys know which box the cursor is in.

export function boxKey(box: Box): string {
  if ('columnId' in box) return `column:${box.columnId}`;
  return box.itemId ? `item:${box.cardId}:${box.itemId}` : `card:${box.cardId}`;
}

function boxFromKey(key: string): Box | null {
  const [kind, a, b] = key.split(':');
  if (kind === 'column' && a) return { columnId: a };
  if (kind === 'card' && a) return { cardId: a };
  if (kind === 'item' && a && b) return { cardId: a, itemId: b };
  return null;
}

/** The text box the cursor is in, with its field, if any. */
export function focusedBox(): { box: Box; field: HTMLInputElement | HTMLTextAreaElement } | null {
  const field = document.activeElement;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return null;
  const key = field.closest<HTMLElement>('[data-box]')?.dataset.box;
  const box = key ? boxFromKey(key) : null;
  return box ? { box, field } : null;
}

/** Props for a text box: its name and its format. */
export function boxProps(box: Box, style: TextStyle | undefined): { box: string; boxStyle: CSSProperties } {
  return { box: boxKey(box), boxStyle: styleCss(style) as CSSProperties };
}
