import { nearestInDirection, type Direction } from '../model/geometry';
import { appStore } from '../store/appStore';
import { caretOnFirstLine, caretOnLastLine } from './caret';
import { isTextField } from './textField';

// Moving around with the keyboard. This reads the cards' text fields from the screen, so the order
// is always what you see (open items before completed ones, hidden items skipped, and so on).

const FIELDS = 'textarea, input:not([type="checkbox"])';
const MARGIN = 40;

type Field = HTMLTextAreaElement | HTMLInputElement;

function fieldsOf(card: Element): Field[] {
  return Array.from(card.querySelectorAll<Field>(FIELDS));
}

function canvas(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="canvas"]');
}

/** Puts the cursor in a field: at its end when arriving from below / by Ctrl+arrow, at its start when arriving from above. */
function focusField(el: Field, atEnd: boolean) {
  el.focus({ preventScroll: true });
  const at = atEnd ? el.value.length : 0;
  el.setSelectionRange(at, at);
}

/** Pans the board so the element is fully on screen (with a little room around it). */
function reveal(el: Element) {
  const view = canvas()?.getBoundingClientRect();
  if (!view) return;
  const r = el.getBoundingClientRect();
  const shift = (start: number, end: number, viewStart: number, viewEnd: number) => {
    if (end - start > viewEnd - viewStart - 2 * MARGIN || start < viewStart + MARGIN) return viewStart + MARGIN - start;
    if (end > viewEnd - MARGIN) return viewEnd - MARGIN - end;
    return 0;
  };
  appStore.panBy(shift(r.left, r.right, view.left, view.right), shift(r.top, r.bottom, view.top, view.bottom));
}

/** Selects a block (card or column) and puts the cursor in one of its fields (if it has any). */
function goToBlock(id: string, shown: Element, field: Field | null, atEnd: boolean) {
  appStore.select(id);
  if (field) focusField(field, atEnd);
  else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  reveal(shown);
}

function goToCard(card: HTMLElement, field: Field | null, atEnd: boolean) {
  goToBlock(card.dataset.cardId!, card, field, atEnd);
}

/**
 * Up / Down inside a card's text: move to the field above / below, as if the card were one long
 * text (multi-line text moves line by line first). Past a card's first or last field, carry on into
 * the card above / below in the same column, skipping collapsed cards. Returns whether it moved.
 */
function arrowThroughFields(el: Field, step: -1 | 1): boolean {
  const card = el.closest<HTMLElement>('[data-card-id]');
  if (!card || el.selectionStart !== el.selectionEnd) return false;
  if (el instanceof HTMLTextAreaElement && (step === -1 ? !caretOnFirstLine(el) : !caretOnLastLine(el))) return false;

  const fields = fieldsOf(card);
  const next = fields[fields.indexOf(el) + step];
  if (next) {
    focusField(next, step === -1);
    return true;
  }
  const column = card.closest('[data-col-id]');
  if (!column) return false;
  const cards = Array.from(column.querySelectorAll<HTMLElement>('[data-card-id]'));
  for (let i = cards.indexOf(card) + step; i >= 0 && i < cards.length; i += step) {
    const f = fieldsOf(cards[i]);
    if (!f.length) continue;
    goToCard(cards[i], step === 1 ? f[0] : f[f.length - 1], step === -1);
    return true;
  }
  return false;
}

/**
 * A place Alt+arrows can land on: every card on screen, and every column at its title strip (so
 * Up from a column's top card reaches the column, and an empty or collapsed column can be reached).
 */
type Stop = { id: string; el: HTMLElement; field: Field | null };

function stops(): Stop[] {
  const shown = (el: HTMLElement) => el.getClientRects().length > 0;
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-card-id]'))
    .filter(shown)
    .map((card) => ({ id: card.dataset.cardId!, el: card, field: fieldsOf(card)[0] ?? null }));
  const columns = Array.from(document.querySelectorAll<HTMLElement>('[data-col-id]'))
    .filter(shown)
    .map((col) => ({
      id: col.dataset.colId!,
      el: col.querySelector<HTMLElement>('.column-header') ?? col,
      field: col.querySelector<Field>('.column-header input, .column-header textarea'),
    }));
  return [...cards, ...columns];
}

/**
 * Alt+arrow: jump to the nearest card or column in that direction (only ones wholly that way),
 * select it and put the cursor at the end of its first field. Starts from the card or column being
 * typed in, else the selected block, else picks the card or column nearest the middle of the screen.
 */
function jumpToCard(dir: Direction) {
  const all = stops();
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const typingIn = active?.closest<HTMLElement>('[data-card-id], [data-col-id]');
  const sel = appStore.getState().ui.selection;
  const fromId = typingIn ? (typingIn.dataset.cardId ?? typingIn.dataset.colId) : sel.length === 1 ? sel[0] : null;
  const from = all.find((s) => s.id === fromId) ?? null;

  const toRect = (r: DOMRect) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const others = all.filter((s) => s !== from);
  // Keyed by position in the list: a card and a column could in theory share an id.
  const candidates = others.map((s, i) => ({ id: String(i), rect: toRect(s.el.getBoundingClientRect()) }));

  let found: string | null;
  if (from) {
    found = nearestInDirection(toRect(from.el.getBoundingClientRect()), candidates, dir);
  } else {
    const view = canvas()?.getBoundingClientRect();
    if (!view) return;
    const mid = { x: view.left + view.width / 2, y: view.top + view.height / 2 };
    const dist = (r: { x: number; y: number; w: number; h: number }) => Math.hypot(r.x + r.w / 2 - mid.x, r.y + r.h / 2 - mid.y);
    found = candidates.reduce<{ id: string; d: number } | null>((best, c) => {
      const d = dist(c.rect);
      return !best || d < best.d ? { id: c.id, d } : best;
    }, null)?.id ?? null;
  }
  const target = found === null ? null : others[Number(found)];
  if (target) goToBlock(target.id, target.el, target.field, true);
}

const DIRECTIONS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/**
 * Arrow keys for moving between fields and cards. Returns true when it handled the key.
 * Ctrl + arrows are left alone (word by word in text, as usual).
 */
export function handleArrowKey(e: KeyboardEvent): boolean {
  const dir = DIRECTIONS[e.key];
  if (!dir || e.isComposing || e.metaKey || e.shiftKey || e.ctrlKey) return false;
  if (e.altKey) {
    // Alt + arrows always belong to the board, so Alt + ← / → never make the browser go back a page.
    jumpToCard(dir);
    return true;
  }
  if (dir !== 'up' && dir !== 'down') return false;
  const el = e.target;
  if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) || !isTextField(el)) return false;
  return arrowThroughFields(el, dir === 'up' ? -1 : 1);
}
