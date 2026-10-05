import { useEffect, useRef, useState } from 'react';
import { arrowCurve, clearDots, connectorDots, curveMid, curvePath, type Curve, type Side } from '../model/arrows';
import { DRAG_THRESHOLD } from '../model/constants';
import type { Rect } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { blockEl, blockUnder, boardRect, clientToBoard, dotObstacles } from './canvasDom';
import { CloseIcon } from './icons';

// Arrows between cards and columns (owner request, 2026-10-05), drawn as in Miro (owner request,
// same day): hovering a block, or selecting one, shows a dot just outside the middle of each side;
// drag a dot onto another block to join them. An arrow is a curve between the middles of the two
// sides that face each other. Where everything is drawn is read from where the blocks are on
// screen, so it follows them while they are dragged, glide, grow or sit in a column.

type Dot = { side: Side; x: number; y: number };

/** How long after a change the positions keep being read, to follow blocks gliding into place. */
const FOLLOW_MS = 400;
/** How far outside a block (screen pixels) its dots sit. */
const DOT_OFFSET = 14;
/** How far outside a hovered block (screen pixels) the pointer can go and still keep its dots, to reach them. */
const DOT_REACH = 28;
/** Half a dot's width (screen pixels, matching .arrow-dot), plus a little air: how far it must keep off other blocks. */
const DOT_CLEAR = 7;
const OUT: Record<Side, { x: number; y: number }> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) => near(a.x, b.x) && near(a.y, b.y);
const sameCurve = (a: Curve | null | undefined, b: Curve | null) =>
  a === b || (!!a && !!b && samePoint(a.from, b.from) && samePoint(a.to, b.to) && samePoint(a.c1, b.c1) && samePoint(a.c2, b.c2));
type Dots = { of: string; dots: Dot[] } | null;
const sameDots = (a: Dots, b: Dots) => a === b || (!!a && !!b && a.of === b.of && a.dots.length === b.dots.length && a.dots.every((d, i) => samePoint(d, b.dots[i])));

/** The block under the pointer, looking through dots (a card before the column it is in). */
function blockAt(clientX: number, clientY: number): HTMLElement | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const block = el.closest<HTMLElement>('.world [data-card-id], .world [data-col-id]');
    if (block) return block;
  }
  return null;
}

/**
 * Which block shows dots for the pointer here, given the one that shows them now (`old`). The block
 * under the pointer, except that the pointer may leave `old` for empty board or the column around
 * it, within reach of its dots, and keep them (a dot over another card gives way to that card).
 */
function hoverAt(old: string | null, clientX: number, clientY: number): string | null {
  const under = blockAt(clientX, clientY);
  const id = under ? (under.dataset.cardId ?? under.dataset.colId!) : null;
  if (!old || id === old) return id;
  const oldEl = blockEl(appStore.getState().board, old);
  if (!oldEl || (under && !under.contains(oldEl))) return id;
  const r = oldEl.getBoundingClientRect();
  const reach = clientX >= r.left - DOT_REACH && clientX <= r.right + DOT_REACH && clientY >= r.top - DOT_REACH && clientY <= r.bottom + DOT_REACH;
  return reach ? old : id;
}

export function Arrows() {
  const board = useAppState((s) => s.board);
  const arrows = board.arrows ?? [];
  const selection = useAppState((s) => s.ui.selection);
  const arrowSel = useAppState((s) => (s.ui.selection.length ? null : s.ui.arrowSel));
  const previewing = useAppState((s) => s.ui.preview !== null);
  const busy = useAppState((s) => !!(s.ui.drag || s.ui.resize || s.ui.itemDrag || s.ui.marquee));
  const [curves, setCurves] = useState<Record<string, Curve | null>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [dots, setDots] = useState<Dots>(null);
  // Drawing a new arrow: from which block and dot, where the pointer is, and the block under it.
  const [pending, setPending] = useState<{ from: string; dot: Dot; to: { x: number; y: number }; target: string | null; moved: boolean } | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  // The block showing dots: the one an arrow is being drawn from, else the hovered one, else a single selected one.
  const dotsFor = previewing || busy ? null : (pending?.from ?? hovered ?? (selection.length === 1 ? selection[0] : null));

  // Read where the blocks are now, and for a moment after every change (blocks glide into place).
  const live = useRef({ arrows, dotsFor, board });
  live.current = { arrows, dotsFor, board };
  const follow = useRef(() => {});
  useEffect(() => {
    let frame = 0;
    let until = 0;
    const measure = () => {
      const { arrows, dotsFor, board } = live.current;
      const rects = new Map<string, Rect | null>();
      const rectOf = (id: string) => {
        if (!rects.has(id)) {
          const el = blockEl(board, id);
          rects.set(id, el ? boardRect(el) : null);
        }
        return rects.get(id)!;
      };
      const next: Record<string, Curve | null> = {};
      for (const a of arrows) {
        const ra = rectOf(a.from);
        const rb = rectOf(a.to);
        next[a.id] = ra && rb ? arrowCurve(ra, rb) : null;
      }
      setCurves((old) => {
        const keys = Object.keys(next);
        return keys.length === Object.keys(old).length && keys.every((k) => sameCurve(old[k], next[k])) ? old : next;
      });
      // A dot that would lie over another card, or the title of the column the block is in, isn't
      // shown, so it never covers their text (owner request, 2026-10-05).
      const el = dotsFor ? blockEl(board, dotsFor) : null;
      const zoom = appStore.getState().view.zoom;
      const d = dotsFor && el ? { of: dotsFor, dots: clearDots(connectorDots(boardRect(el), DOT_OFFSET / zoom), DOT_CLEAR / zoom, dotObstacles(el)) } : null;
      setDots((old) => (sameDots(old, d) ? old : d));
    };
    const loop = () => {
      measure();
      frame = performance.now() < until ? requestAnimationFrame(loop) : 0;
    };
    follow.current = () => {
      until = performance.now() + FOLLOW_MS;
      if (!frame) frame = requestAnimationFrame(loop);
    };
    follow.current();
    const stop = appStore.subscribe(() => follow.current());
    const resized = () => follow.current();
    window.addEventListener('resize', resized);
    return () => {
      stop();
      window.removeEventListener('resize', resized);
      cancelAnimationFrame(frame);
    };
  }, []);
  // A different block shows dots: read where it is.
  useEffect(() => follow.current(), [dotsFor]);

  // The hovered block (mouse or pen; a finger has no hover). Its dots stay while the pointer is
  // within reach of them, so they can be grabbed.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || pendingRef.current) return;
      setHovered((old) => hoverAt(old, e.clientX, e.clientY));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  // A hovered block that is deleted (or on another board) shows no dots.
  useEffect(() => {
    if (hovered && !board.cards[hovered] && !board.columns[hovered]) setHovered(null);
  }, [board, hovered]);

  function startConnect(e: React.PointerEvent<HTMLButtonElement>, dot: Dot) {
    if (!dotsFor || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPending({ from: dotsFor, dot, to: clientToBoard(e.clientX, e.clientY), target: null, moved: false });
  }
  function moveConnect(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pending) return;
    const to = clientToBoard(e.clientX, e.clientY);
    const zoom = appStore.getState().view.zoom;
    const moved = pending.moved || Math.hypot(to.x - pending.dot.x, to.y - pending.dot.y) * zoom > DRAG_THRESHOLD;
    setPending({ ...pending, to, moved, target: moved ? blockUnder(e.clientX, e.clientY, pending.from) : null });
  }
  function endConnect(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pending) return;
    // A click on a dot without dragging draws nothing.
    const to = e.type === 'pointerup' && pending.moved ? blockUnder(e.clientX, e.clientY, pending.from) : null;
    if (to) appStore.addArrow(pending.from, to);
    setPending(null);
  }

  // The block an arrow being drawn would join is outlined.
  useEffect(() => {
    if (!pending?.target) return;
    const el = blockEl(appStore.getState().board, pending.target);
    el?.classList.add('arrow-target');
    return () => el?.classList.remove('arrow-target');
  }, [pending?.target]);

  // The arrow being drawn leaves its dot square to the side, and bends towards the pointer.
  let pendingPath: string | null = null;
  if (pending?.moved) {
    const { dot, to } = pending;
    const o = OUT[dot.side];
    const pull = Math.hypot(to.x - dot.x, to.y - dot.y) / 2;
    pendingPath = curvePath({ from: dot, c1: { x: dot.x + o.x * pull, y: dot.y + o.y * pull }, c2: to, to, fromSide: dot.side, toSide: dot.side });
  }

  const selectedCurve = arrowSel ? curves[arrowSel] : null;
  const mid = selectedCurve ? curveMid(selectedCurve) : null;
  return (
    <>
      <svg className="arrows-layer" aria-hidden={arrows.length ? undefined : true}>
        <defs>
          <marker id="arrow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path className="arrow-tip" d="M0 0 L10 5 L0 10 z" />
          </marker>
          <marker id="arrow-head-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path className="arrow-tip on" d="M0 0 L10 5 L0 10 z" />
          </marker>
        </defs>
        {arrows.map((a) => {
          const c = curves[a.id];
          if (!c) return null;
          const d = curvePath(c);
          return (
            <g key={a.id} data-arrow-id={a.id} className={a.id === arrowSel ? 'arrow selected' : 'arrow'}>
              <path className="arrow-line" d={d} markerEnd={a.id === arrowSel ? 'url(#arrow-head-on)' : 'url(#arrow-head)'} />
              {!previewing && (
                <path
                  className="arrow-hit"
                  d={d}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    e.preventDefault();
                    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                    appStore.selectArrow(a.id);
                  }}
                />
              )}
            </g>
          );
        })}
        {pendingPath && <path className="arrow-line arrow-pending" d={pendingPath} markerEnd="url(#arrow-head-on)" />}
      </svg>
      {mid && arrowSel && (
        <button
          type="button"
          className="arrow-delete"
          aria-label="Delete arrow"
          title="Delete arrow (Delete)"
          style={{ left: mid.x, top: mid.y }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => appStore.deleteArrow(arrowSel)}
        >
          <CloseIcon />
        </button>
      )}
      {dotsFor &&
        dots?.of === dotsFor &&
        dots.dots.map((dot) => (
          <button
            key={dot.side}
            type="button"
            className="arrow-dot"
            aria-label={`Draw an arrow from the ${dot.side}`}
            title="Drag onto another card or column to draw an arrow"
            style={{ left: dot.x, top: dot.y }}
            onPointerDown={(e) => startConnect(e, dot)}
            onPointerMove={moveConnect}
            onPointerUp={endConnect}
            onPointerCancel={endConnect}
          />
        ))}
    </>
  );
}
