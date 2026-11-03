import { useEffect, useRef, useState } from 'react';
import { arrowLine, clearDots, connectorDots, type Side } from '../model/arrows';
import { DRAG_THRESHOLD } from '../model/constants';
import type { Point, Rect } from '../model/types';
import { appStore, useAppState, useViewOnly } from '../store/appStore';
import { blockEl, blockUnder, boardRect, clientToBoard, dotObstacles } from './canvasDom';
import { CloseIcon } from './icons';

// Arrows between cards and containers (owner request, 2026-11-03, job card-arrows). Hovering a block,
// or selecting one (a finger has no hover), shows a dot just outside the middle of each side; drag a
// dot onto another block to join them. An arrow is a thin straight line from edge to edge. Where it
// is drawn is read from where the blocks are on screen, so it follows them while they are dragged,
// glide, grow, fold up or sit in a container (a card hidden in a folded container: the container).

type Dot = { side: Side; x: number; y: number };
type Line = { from: Point; to: Point };

/** How long after a change the positions keep being read, to follow blocks gliding into place. */
const FOLLOW_MS = 400;
/** How far outside a block (screen pixels) its dots sit. */
const DOT_OFFSET = 14;
/** How far outside a hovered block (screen pixels) the pointer can go and keep its dots, to reach them. */
const DOT_REACH = 28;
/** Half a dot's width (screen pixels, matching .arrow-dot), plus a little air: how far it keeps off other blocks. */
const DOT_CLEAR = 7;

/** How much of each end of an arrow can't be clicked (board pixels), so its wide click area never covers a corner of its blocks. */
const HIT_TRIM = 10;

/** The part of a line that can be clicked: `trim` shorter at each end (null when that leaves nothing). */
function hitPart(l: Line, trim: number): Line | null {
  const len = Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y);
  if (len <= trim * 2 + 4) return null;
  const ux = (l.to.x - l.from.x) / len;
  const uy = (l.to.y - l.from.y) / len;
  return { from: { x: l.from.x + ux * trim, y: l.from.y + uy * trim }, to: { x: l.to.x - ux * trim, y: l.to.y - uy * trim } };
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
const samePoint = (a: Point, b: Point) => near(a.x, b.x) && near(a.y, b.y);
const sameLine = (a: Line | null | undefined, b: Line | null) => a === b || (!!a && !!b && samePoint(a.from, b.from) && samePoint(a.to, b.to));
type Dots = { of: string; dots: Dot[] } | null;
const sameDots = (a: Dots, b: Dots) => a === b || (!!a && !!b && a.of === b.of && a.dots.length === b.dots.length && a.dots.every((d, i) => samePoint(d, b.dots[i])));

/** The block under the pointer, looking through dots (a card before the container it is in). */
function blockAt(clientX: number, clientY: number): HTMLElement | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const block = el.closest<HTMLElement>('.world [data-card-id], .world [data-col-id]');
    if (block) return block;
  }
  return null;
}

/**
 * Which block shows dots for the pointer here, given the one that shows them now (`old`): the block
 * under the pointer, except that the pointer may leave `old` for empty board or the container
 * around it, within reach of its dots, and keep them.
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
  // While looking at an older version (Version history) this is that version's board.
  const board = useAppState((s) => s.board);
  const arrows = board.arrows ?? [];
  const selection = useAppState((s) => s.ui.selection);
  const arrowSel = useAppState((s) => (s.ui.selection.length ? null : s.ui.arrowSel));
  const previewing = useAppState((s) => s.ui.preview !== null);
  const readOnly = useViewOnly();
  const busy = useAppState((s) => !!(s.ui.drag || s.ui.resize || s.ui.itemDrag || s.ui.marquee));
  const zoom = useAppState((s) => s.view.zoom);
  // Whether the last press was a finger: then a selected block shows its dots (a finger has no hover).
  const [byTouch, setByTouch] = useState(false);
  const [lines, setLines] = useState<Record<string, Line | null>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [dots, setDots] = useState<Dots>(null);
  // Drawing a new arrow: from which block and dot, where the pointer is, and the block under it.
  const [pending, setPending] = useState<{ from: string; dot: Dot; to: Point; target: string | null; moved: boolean } | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const fixed = previewing || readOnly;
  // The block showing dots: the one an arrow is drawn from, else the hovered one, else (by touch) a single selected one.
  const dotsFor = fixed || busy ? null : (pending?.from ?? hovered ?? (byTouch && selection.length === 1 ? selection[0] : null));
  const svg = useRef<SVGSVGElement>(null);

  // Read where the blocks are now, and for a moment after every change (blocks glide into place).
  const live = useRef({ arrows, dotsFor, board });
  live.current = { arrows, dotsFor, board };
  const follow = useRef(() => {});
  useEffect(() => {
    let frame = 0;
    let until = 0;
    // A block that changes size by itself (a picture loading) is followed too.
    const sizes = new ResizeObserver(() => follow.current());
    const watched = new Set<Element>();
    const measure = () => {
      const { arrows, dotsFor, board } = live.current;
      // Measured against the layer itself, the board's corner, so it is right while the board glides.
      const origin = svg.current?.getBoundingClientRect();
      if (!origin) return;
      const seen = new Set<Element>();
      const rects = new Map<string, Rect | null>();
      const rectOf = (id: string) => {
        if (!rects.has(id)) {
          const el = blockEl(board, id);
          if (el) seen.add(el);
          rects.set(id, el ? boardRect(el, origin) : null);
        }
        return rects.get(id)!;
      };
      const next: Record<string, Line | null> = {};
      for (const a of arrows) {
        const ra = rectOf(a.from);
        const rb = rectOf(a.to);
        // Both ends hidden in the same folded container (or a card moved into the container it points at): not drawn.
        next[a.id] = ra && rb ? arrowLine(ra, rb) : null;
      }
      if (seen.size !== watched.size || [...seen].some((el) => !watched.has(el))) {
        sizes.disconnect();
        watched.clear();
        for (const el of seen) {
          sizes.observe(el);
          watched.add(el);
        }
      }
      setLines((old) => {
        const keys = Object.keys(next);
        return keys.length === Object.keys(old).length && keys.every((k) => sameLine(old[k], next[k])) ? old : next;
      });
      // A dot that would lie over another card, or the title of the container the block is in, isn't shown.
      const el = dotsFor ? blockEl(board, dotsFor) : null;
      const zoom = origin.width; // the layer is 1px wide: on screen, the board's zoom right now
      const d = dotsFor && el ? { of: dotsFor, dots: clearDots(connectorDots(boardRect(el, origin), DOT_OFFSET / zoom), DOT_CLEAR / zoom, dotObstacles(el, origin)) } : null;
      setDots((old) => (sameDots(old, d) ? old : d));
    };
    const loop = () => {
      measure();
      frame = performance.now() < until ? requestAnimationFrame(loop) : 0;
    };
    follow.current = () => {
      // Nothing to draw (no arrows, no dots): nothing to read.
      if (!live.current.arrows.length && !live.current.dotsFor) return;
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
      sizes.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  // A different block shows dots: read where it is.
  useEffect(() => follow.current(), [dotsFor]);

  // The hovered block (mouse or pen). Its dots stay while the pointer is within reach of them.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || pendingRef.current) return;
      setHovered((old) => hoverAt(old, e.clientX, e.clientY));
    };
    const onDown = (e: PointerEvent) => setByTouch(e.pointerType === 'touch');
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown, { capture: true });
    };
  }, []);
  // If the dot being dragged goes away mid-drag (its block deleted by someone else), letting go still ends it.
  const drawing = !!pending;
  useEffect(() => {
    if (!drawing) return;
    const end = () => setPending(null);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [drawing]);
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
    // A press on a dot without dragging, or a drop on empty board or the same block, draws nothing.
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

  const selectedLine = arrowSel && arrows.some((a) => a.id === arrowSel) ? lines[arrowSel] : null;
  const mid = selectedLine ? { x: (selectedLine.from.x + selectedLine.to.x) / 2, y: (selectedLine.from.y + selectedLine.to.y) / 2 } : null;
  return (
    <>
      <svg ref={svg} className="arrows-layer" aria-hidden="true">
        <defs>
          <marker id="arrow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path className="arrow-tip" d="M1 1 L9 5 L1 9" />
          </marker>
          <marker id="arrow-head-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path className="arrow-tip on" d="M1 1 L9 5 L1 9" />
          </marker>
        </defs>
        {arrows.map((a) => {
          const l = lines[a.id];
          if (!l) return null;
          const on = a.id === arrowSel;
          const hit = fixed ? null : hitPart(l, HIT_TRIM);
          return (
            <g key={a.id} data-arrow-id={a.id} className={on ? 'arrow selected' : 'arrow'}>
              <line className="arrow-line" x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} markerEnd={on ? 'url(#arrow-head-on)' : 'url(#arrow-head)'} />
              {hit && (
                <line
                  className="arrow-hit"
                  x1={hit.from.x}
                  y1={hit.from.y}
                  x2={hit.to.x}
                  y2={hit.to.y}
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
        {pending?.moved && (
          <line className="arrow-line arrow-pending" x1={pending.dot.x} y1={pending.dot.y} x2={pending.to.x} y2={pending.to.y} markerEnd="url(#arrow-head-on)" />
        )}
      </svg>
      {/* A finger has no Delete key: the selected arrow has a delete button at its middle. */}
      {mid && arrowSel && !fixed && (
        <button
          type="button"
          className="arrow-delete"
          aria-label="Delete arrow"
          title="Delete arrow (Delete)"
          style={{ left: mid.x, top: mid.y, '--zoom': zoom } as React.CSSProperties}
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
            title="Drag onto another card or container to draw an arrow"
            style={{ left: dot.x, top: dot.y, '--zoom': zoom } as React.CSSProperties}
            onPointerDown={(e) => startConnect(e, dot)}
            onPointerMove={moveConnect}
            onPointerUp={endConnect}
            onPointerCancel={endConnect}
          />
        ))}
    </>
  );
}
