import { useEffect, useRef, type RefObject } from 'react';
import { appStore } from '../store/appStore';
import { isTextField, panelCovers } from './textField';

/** The `buttons` bits of a mouse: left 1, right 2, middle 4. */
const wantsBox = (buttons: number) => (buttons & 4) !== 0 || (buttons & 3) === 3;
const BIT = [1, 4, 2]; // by `button`: left, middle, right
const keeps = (e: MouseEvent) => e.ctrlKey || e.metaKey || e.shiftKey;

/** What the buttons' gesture does: `begin` at a screen point (with Ctrl / Shift held: add to the selection), `move` on each move, `end` when it is over. */
export type BoxGesture = { begin: (x: number, y: number, keep: boolean) => void; move: (e: PointerEvent) => void; end: () => void };

/**
 * Mouse selection box (owner request, job 193, swapping job 188's panning): pressing the middle button,
 * or the left and right buttons together (in either order), and moving draws the selection box, over
 * cards and containers too. Letting go of either of the pair, the window losing focus or a cancelled
 * press ends it. Whatever the left button had started (a pan, a block or checklist item drag, a
 * resize) is cancelled when the right one joins, no text is selected and the click, menu or new tab
 * the buttons would otherwise cause is refused. Not on an old version being looked at, nor on a read-only board (no box there; a left drag keeps panning), nor under a
 * panel that covers the board. Listens on the window, before the blocks do. A left drag alone pans
 * (Canvas); touch pans by itself, or draws the box after a rest (Canvas).
 */
export function useBoxButtons(board: RefObject<HTMLElement | null>, gesture: BoxGesture) {
  const g = useRef(gesture);
  g.current = gesture;
  useEffect(() => {
    const el = board.current!;
    const inBoard = (t: EventTarget | null) => t instanceof Node && el.contains(t);
    let active = false; // the box is being drawn
    let origin = false; // the first button went down on the board
    let pointerId = 1;
    let spent = false; // the window lost focus or the press was cancelled: no new box until every button has gone up
    let refuse = false; // refuse the click, menu or new tab that this gesture's buttons would bring
    let calm: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      if (!active) return;
      active = false;
      g.current.end();
    };
    const giveUp = () => {
      spent = true;
      stop();
    };
    const start = (x: number, y: number, buttons: number, keep: boolean) => {
      if (active || spent || !origin || appStore.getState().ui.preview || appStore.viewOnly() || panelCovers()) return;
      active = true;
      refuse = true;
      // Whatever the left button had begun ends as if it were cancelled: a pan, a block drag, a resize.
      if (buttons & 1) el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId, pointerType: 'mouse', isPrimary: true }));
      // No text left selected by the left button's press (a caret in a text box is not a selection and stays).
      if (!isTextField(document.activeElement)) window.getSelection()?.removeAllRanges();
      g.current.begin(x, y, keep);
    };
    // After the buttons are all up, the click or menu that follows them is still refused (it comes right after).
    const released = (buttons: number) => {
      if (buttons) return;
      origin = false;
      spent = false;
      clearTimeout(calm);
      calm = setTimeout(() => (refuse = false), 100);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointerId = e.pointerId;
      if (!active && e.buttons === BIT[e.button]) {
        // A new gesture: the first button.
        origin = inBoard(e.target);
        refuse = false;
        spent = false;
      }
      if (wantsBox(e.buttons)) start(e.clientX, e.clientY, e.buttons & 3, keeps(e));
      if (active && inBoard(e.target)) e.stopPropagation();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (!active) return wantsBox(e.buttons) ? start(e.clientX, e.clientY, e.buttons & 3, keeps(e)) : undefined;
      if (!wantsBox(e.buttons)) return stop();
      e.stopPropagation();
      g.current.move(e);
    };
    const onUp = (e: PointerEvent | MouseEvent) => {
      if ('pointerType' in e && e.pointerType !== 'mouse') return;
      if (active && !wantsBox(e.buttons)) stop();
      released(e.buttons);
    };
    // The mouse events come for every button, also the ones the pointer events leave out while another is down.
    const onMouseDown = (e: MouseEvent) => {
      // Middle: no autoscroll circle, no paste into a text box. Always, also where there is no box.
      if (e.button === 1 && inBoard(e.target)) e.preventDefault();
      if (wantsBox(e.buttons)) start(e.clientX, e.clientY, e.buttons & 3, keeps(e));
    };
    // Open in a new tab (a middle click on a link), the menu, and the click that follows a box.
    const onClickLike = (e: MouseEvent) => {
      const middle = e.type === 'auxclick' && e.button === 1 && inBoard(e.target);
      if (!inBoard(e.target) || !(active || refuse || middle)) return;
      e.preventDefault();
      if (e.type !== 'contextmenu') e.stopPropagation();
    };
    const onSelect = (e: Event) => active && e.preventDefault();

    const on: [string, (e: never) => void][] = [
      ['pointerdown', onDown],
      ['pointermove', onMove],
      ['pointerup', onUp],
      ['mouseup', onUp],
      ['pointercancel', (e: PointerEvent) => e.isTrusted && e.pointerType === 'mouse' && giveUp()],
      ['mousedown', onMouseDown],
      ['click', onClickLike],
      ['auxclick', onClickLike],
      ['contextmenu', onClickLike],
      ['selectstart', onSelect],
      ['dragstart', onSelect],
      ['blur', (e: Event) => e.target === window && giveUp()],
    ];
    for (const [type, fn] of on) window.addEventListener(type, fn as EventListener, true);
    return () => {
      for (const [type, fn] of on) window.removeEventListener(type, fn as EventListener, true);
      clearTimeout(calm);
    };
  }, [board]);
}
