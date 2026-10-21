import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { appStore, useAppState } from '../store/appStore';
import { panToShow } from '../model/view';
import { canvasRect } from './canvasDom';
import { caretLine } from './caret';
import { ArrowIcon, CheckIcon, IndentIcon, TrashIcon, UndoIcon } from './icons';

type Typing = { field: HTMLInputElement | HTMLTextAreaElement; item: { cardId: string; itemId: string } | null };

/** The text box on the board being typed in, if any, and its checklist item if it is one. */
function typingIn(): Typing | null {
  const field = document.activeElement;
  if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) || !field.closest('.canvas')) return null;
  const itemId = field.closest<HTMLElement>('[data-item-id]')?.dataset.itemId;
  const cardId = field.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;
  return { field, item: itemId && cardId ? { cardId, itemId } : null };
}

/** How much of the bottom of the window the on-screen keyboard covers (0 with no keyboard up). */
function keyboardCover() {
  const v = window.visualViewport;
  return v ? Math.max(0, Math.round(window.innerHeight - v.height - v.offsetTop)) : 0;
}

/**
 * Phone layout (owner request): while typing in a checklist item, a row of buttons for what a
 * keyboard would do on a computer (Undo, Tab, Shift+Tab, Ctrl+Shift+Up / Down, ticking, deleting),
 * and Done to put the keyboard away. It sits just above the on-screen keyboard. Ticking and deleting
 * move the cursor on to another item (owner request, 2026-10-19), so the keyboard stays up.
 */
export function ItemBar() {
  const [typing, setTyping] = useState<Typing | null>(null);
  const [cover, setCover] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const canUndo = useAppState((s) => s.ui.canUndo);

  // Keep the line being typed in on screen (owner request, "audit job B"): below the top bar (or the
  // part of the page the phone has scrolled away), above the keyboard and this bar, and between the
  // sides. The board moves just enough. The browser's own scrolling can't do it: the board is moved, not scrolled.
  const keepCaretClear = () => {
    const field = typingIn()?.field;
    const canvas = canvasRect();
    if (!field || !canvas) return;
    const v = window.visualViewport;
    // The page is pinched in: the person is looking around on purpose, so leave the board alone.
    if (v && v.scale > 1.01) return;
    const area = {
      left: canvas.left,
      right: canvas.right,
      top: Math.max(canvas.top, v?.offsetTop ?? 0),
      bottom: Math.min(canvas.bottom, bar.current?.getBoundingClientRect().top ?? Infinity, v ? v.offsetTop + v.height : Infinity),
    };
    // The cursor is never outside its box, so a box that is in view needs no measuring.
    const boxMove = panToShow(field.getBoundingClientRect(), area, 12);
    if (!boxMove.x && !boxMove.y) return;
    const move = panToShow(caretLine(field), area, 12);
    if (move.x || move.y) appStore.panBy(Math.round(move.x), Math.round(move.y));
  };
  // A note or item grows as it is typed in, and the cursor can move within it or on to another item: check again after each.
  // (These read only refs and the page, so the copies the listeners below keep from the first draw are as good as new ones.)
  const frame = useRef(0);
  const follow = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(keepCaretClear);
  };

  useEffect(() => {
    // After a change the item's text box can be redrawn, so look again once focus has settled.
    let later = 0;
    const update = () => {
      clearTimeout(later);
      later = window.setTimeout(() => setTyping(typingIn()));
    };
    const v = window.visualViewport;
    const onViewport = () => {
      setCover(keyboardCover());
      follow();
    };
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    document.addEventListener('input', follow);
    document.addEventListener('selectionchange', follow);
    v?.addEventListener('resize', onViewport);
    v?.addEventListener('scroll', onViewport);
    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(later);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      document.removeEventListener('input', follow);
      document.removeEventListener('selectionchange', follow);
      v?.removeEventListener('resize', onViewport);
      v?.removeEventListener('scroll', onViewport);
    };
  }, []);

  useLayoutEffect(() => {
    if (typing) keepCaretClear();
  }, [typing, cover]);

  if (!typing?.item) return null;
  const { field } = typing;
  const { cardId, itemId } = typing.item;
  const button = (label: string, icon: ReactNode, act: () => void, disabled = false) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={disabled || undefined}
      // Pressing a button keeps the cursor (and the phone keyboard) in the item.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      // The cursor can land in another item, or the one it is in can move: look again once it is drawn.
      // simple: one look about a frame after the tap. A Tick with motion on closes the list up 280ms later, which only moves the items
      // below it up into the ticked item's place (already in view), so the cursor item stays in view. Upgrade if a button ever moves
      // the cursor to an item that a late reflow carries out of view: look again when that settles.
      onClick={() => {
        if (disabled) return;
        act();
        follow();
      }}
    >
      {icon}
    </button>
  );
  const caret = () => field.selectionStart ?? 0;
  return (
    <div ref={bar} className="item-bar" role="toolbar" aria-label="Item actions" style={{ bottom: cover }}>
      {button('Undo', <UndoIcon />, () => appStore.undoInItem(cardId, itemId, caret()), !canUndo)}
      {button('Outdent', <IndentIcon out />, () => appStore.itemTab(cardId, itemId, true))}
      {button('Indent', <IndentIcon />, () => appStore.itemTab(cardId, itemId, false))}
      {button('Move up', <ArrowIcon />, () => appStore.moveItem(cardId, itemId, -1, caret()))}
      {button('Move down', <ArrowIcon down />, () => appStore.moveItem(cardId, itemId, 1, caret()))}
      {/* The cursor moves to the next open item; with none left it lets go, as Ctrl+Enter does. */}
      {button('Tick', <CheckIcon />, () => appStore.tickFromKeyboard(cardId, itemId, caret()) || field.blur())}
      {button('Delete item', <TrashIcon />, () => appStore.trashItem(cardId, itemId, true))}
      {button('Done typing', 'Done', () => field.blur())}
    </div>
  );
}
