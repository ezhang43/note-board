import { useEffect, useRef, useState } from 'react';
import { arrowLine } from '../model/arrows';
import type { Rect } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { blockEl, blockUnder, boardRect, clientToBoard } from './canvasDom';
import { CloseIcon } from './icons';

// Arrows between cards and columns (owner request, 2026-10-05). Where each arrow is drawn is read
// from where its blocks are on screen, so it follows them while they are dragged, glide, grow or sit
// in a column. A selected block shows a round handle on its right edge: drag it onto another block.

type Line = { x1: number; y1: number; x2: number; y2: number };

/** How long after a change the positions keep being read, to follow blocks gliding into place. */
const FOLLOW_MS = 400;

const sameLine = (a: Line | null | undefined, b: Line | null) =>
  a === b || (!!a && !!b && Math.abs(a.x1 - b.x1) < 0.5 && Math.abs(a.y1 - b.y1) < 0.5 && Math.abs(a.x2 - b.x2) < 0.5 && Math.abs(a.y2 - b.y2) < 0.5);

export function Arrows() {
  const board = useAppState((s) => s.board);
  const arrows = board.arrows ?? [];
  const selection = useAppState((s) => s.ui.selection);
  const arrowSel = useAppState((s) => (s.ui.selection.length ? null : s.ui.arrowSel));
  const previewing = useAppState((s) => s.ui.preview !== null);
  const busy = useAppState((s) => !!(s.ui.drag || s.ui.resize || s.ui.itemDrag || s.ui.marquee));
  const [lines, setLines] = useState<Record<string, Line | null>>({});
  const [handle, setHandle] = useState<{ x: number; y: number } | null>(null);
  // Drawing a new arrow: from which block, to where the pointer is, and the block under it.
  const [pending, setPending] = useState<{ from: string; start: Line; to: string | null } | null>(null);
  const handleFor = !previewing && !busy && selection.length === 1 ? selection[0] : null;

  // Read where the blocks are now, and for a moment after every change (blocks glide into place).
  const live = useRef({ arrows, handleFor, board });
  live.current = { arrows, handleFor, board };
  useEffect(() => {
    let frame = 0;
    let until = 0;
    const measure = () => {
      const { arrows, handleFor, board } = live.current;
      const rects = new Map<string, Rect | null>();
      const rectOf = (id: string) => {
        if (!rects.has(id)) {
          const el = blockEl(board, id);
          rects.set(id, el ? boardRect(el) : null);
        }
        return rects.get(id)!;
      };
      const next: Record<string, Line | null> = {};
      for (const a of arrows) {
        const ra = rectOf(a.from);
        const rb = rectOf(a.to);
        next[a.id] = ra && rb ? arrowLine(ra, rb) : null;
      }
      setLines((old) => {
        const keys = Object.keys(next);
        return keys.length === Object.keys(old).length && keys.every((k) => sameLine(old[k], next[k])) ? old : next;
      });
      const hr = handleFor ? rectOf(handleFor) : null;
      const h = hr ? { x: hr.x + hr.w, y: hr.y + hr.h / 2 } : null;
      setHandle((old) => (old && h && Math.abs(old.x - h.x) < 0.5 && Math.abs(old.y - h.y) < 0.5 ? old : h));
    };
    const loop = () => {
      measure();
      frame = performance.now() < until ? requestAnimationFrame(loop) : 0;
    };
    const follow = () => {
      until = performance.now() + FOLLOW_MS;
      if (!frame) frame = requestAnimationFrame(loop);
    };
    follow();
    const stop = appStore.subscribe(follow);
    window.addEventListener('resize', follow);
    return () => {
      stop();
      window.removeEventListener('resize', follow);
      cancelAnimationFrame(frame);
    };
  }, []);

  function startConnect(e: React.PointerEvent<HTMLButtonElement>) {
    if (!handleFor || !handle || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = clientToBoard(e.clientX, e.clientY);
    setPending({ from: handleFor, start: { x1: handle.x, y1: handle.y, x2: p.x, y2: p.y }, to: null });
  }
  function moveConnect(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pending) return;
    const p = clientToBoard(e.clientX, e.clientY);
    setPending({ ...pending, start: { ...pending.start, x2: p.x, y2: p.y }, to: blockUnder(e.clientX, e.clientY, pending.from) });
  }
  function endConnect(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pending) return;
    const to = e.type === 'pointerup' ? blockUnder(e.clientX, e.clientY, pending.from) : null;
    if (to) appStore.addArrow(pending.from, to);
    setPending(null);
  }

  // The block an arrow being drawn would join is outlined.
  useEffect(() => {
    if (!pending?.to) return;
    const el = blockEl(appStore.getState().board, pending.to);
    el?.classList.add('arrow-target');
    return () => el?.classList.remove('arrow-target');
  }, [pending?.to]);

  const selectedLine = arrowSel ? lines[arrowSel] : null;
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
          const l = lines[a.id];
          if (!l) return null;
          return (
            <g key={a.id} data-arrow-id={a.id} className={a.id === arrowSel ? 'arrow selected' : 'arrow'}>
              <line className="arrow-line" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} markerEnd={a.id === arrowSel ? 'url(#arrow-head-on)' : 'url(#arrow-head)'} />
              {!previewing && (
                <line
                  className="arrow-hit"
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
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
        {pending && <line className="arrow-line arrow-pending" {...pending.start} markerEnd="url(#arrow-head-on)" />}
      </svg>
      {selectedLine && arrowSel && (
        <button
          type="button"
          className="arrow-delete"
          aria-label="Delete arrow"
          title="Delete arrow (Delete)"
          style={{ left: (selectedLine.x1 + selectedLine.x2) / 2, top: (selectedLine.y1 + selectedLine.y2) / 2 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => appStore.deleteArrow(arrowSel)}
        >
          <CloseIcon />
        </button>
      )}
      {handleFor && handle && (
        <button
          type="button"
          className="arrow-handle"
          aria-label="Draw an arrow"
          title="Drag onto another card or column to draw an arrow"
          style={{ left: handle.x, top: handle.y }}
          onPointerDown={startConnect}
          onPointerMove={moveConnect}
          onPointerUp={endConnect}
          onPointerCancel={endConnect}
        />
      )}
    </>
  );
}
