import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DRAG_THRESHOLD, ZOOM_STEP } from '../model/constants';
import { FONT_SCALE } from '../model/font';
import { isDoubleTap, pressKind, type Touch } from '../model/tapZoom';
import { gridStyle, wheelPan, wheelPixels, wheelZoomFactor } from '../model/view';
import { appStore, useAppState } from '../store/appStore';
import type { Point, View } from '../model/types';
import type { ItemDrag } from '../store/store';
import { canvasRect, clientToCanvas, setCanvasElement } from './canvasDom';
import { followEdges } from './edgeFollow';
import { CardView } from './CardView';
import { ColumnView } from './ColumnView';
import { HOLD_MS } from './touchHold';
import { usePhone } from './usePhone';

const NO_GUIDES: never[] = [];
const NEW_CARD_LABEL = { note: 'New note', todo: 'New checklist', link: 'New link', column: 'New container' } as const;

export function Canvas() {
  const view = useAppState((s) => s.view);
  const snap = useAppState((s) => s.board.snap);
  const ref = useRef<HTMLDivElement>(null);

  const order = useAppState((s) => s.board.order);
  const phone = usePhone();
  // Nothing drawn (a Completed record is kept but never drawn): show the hint.
  const empty = useAppState((s) => s.board.order.every((id) => s.board.cards[id]?.kind === 'completed'));
  const draggedCard = useAppState((s) => (s.ui.drag?.kind === 'card' ? s.ui.drag.id : null));
  const draggedColumn = useAppState((s) => (s.ui.drag?.kind === 'column' ? s.ui.drag.id : null));
  const columns = useAppState((s) => s.board.columns);
  const land = useAppState((s) => s.ui.drag?.land ?? s.ui.newDrag?.land ?? null);
  const guides = useAppState((s) => s.ui.drag?.guides ?? NO_GUIDES);
  const newDrag = useAppState((s) => s.ui.newDrag);
  const resizeLabel = useAppState((s) => s.ui.resize);

  // Keep the store told how big the canvas is, so zoom buttons can zoom around its centre
  // and new blocks appear in the middle of the screen.
  useEffect(() => {
    const el = ref.current!;
    setCanvasElement(el);
    const update = () => appStore.setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // The browser scrolls the board area by itself to keep a text cursor in view near its edge.
    // That would shift everything drawn on it away from the pointer (owner bug report: the
    // selection box sat above the pointer), so turn it into a pan of the board instead.
    const unscroll = () => {
      const { scrollLeft: x, scrollTop: y } = el;
      if (!x && !y) return;
      el.scrollLeft = 0;
      el.scrollTop = 0;
      appStore.panBy(-x, -y);
    };
    el.addEventListener('scroll', unscroll);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', unscroll);
      setCanvasElement(null);
    };
  }, []);

  // Opening the board shows what's on it, centred (owner request): once when the page loads, and
  // again if the online copy arrives on an empty screen. Waits two frames so real heights are known.
  useEffect(() => {
    if (!order.length) return;
    let frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => appStore.showWholeBoard())));
    return () => cancelAnimationFrame(frame);
  }, []); // only on opening
  useEffect(() => {
    if (!appStore.takeCentreOnArrival()) return;
    let frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => appStore.showWholeBoard())));
    return () => cancelAnimationFrame(frame);
  }, [order]);

  // Scroll / swipe pans; Ctrl+scroll / pinch zooms at the cursor. Listens on the window
  // (not passive) so Ctrl+scroll never zooms the whole browser page instead.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = ref.current;
      if (!el) return;
      const overCanvas = e.target instanceof Node && el.contains(e.target);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (!overCanvas) return;
        const r = el.getBoundingClientRect();
        const { dy } = wheelPixels(e, el.clientHeight);
        appStore.zoomAt({ x: e.clientX - r.left, y: e.clientY - r.top }, wheelZoomFactor(dy));
        return;
      }
      if (!overCanvas) return;
      e.preventDefault();
      const { x, y } = wheelPan(e, el.clientHeight);
      appStore.panBy(x, y);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  // Phone (owner request): starting to edit in a card or container (the cursor coming in from outside
  // it, not moving between its own boxes) fills the screen's width with it, the tapped line staying put.
  useEffect(() => {
    if (!phone) return;
    const el = ref.current!;
    const onFocus = (e: FocusEvent) => {
      const field = e.target;
      if (!(field instanceof HTMLTextAreaElement || (field instanceof HTMLInputElement && field.type !== 'checkbox'))) return;
      const block = field.closest<HTMLElement>('[data-card-id], [data-col-id]');
      if (!block) return;
      const top = block.closest<HTMLElement>('[data-col-id]') ?? block;
      if (e.relatedTarget instanceof Node && top.contains(e.relatedTarget)) return;
      const r = field.getBoundingClientRect();
      appStore.fitBlockWidth((block.dataset.cardId ?? block.dataset.colId)!, clientToCanvas(r.left + r.width / 2, r.top + r.height / 2));
    };
    // A tap near another card's (hidden) buttons selects that card, and the buttons then appear under
    // the finger: the browser aims the click at them. After a finger press, a click on a header button
    // counts only when the press began on that button (keyboard clicks, with no press, still do).
    let down: PointerEvent | null = null;
    const onDown = (e: PointerEvent) => (down = e);
    const onClick = (e: MouseEvent) => {
      const press = down;
      down = null;
      const button = e.target instanceof Element ? e.target.closest('.card-header > .icon-button, .column-actions > .icon-button') : null;
      if (button && e.detail > 0 && press?.pointerType === 'touch' && !(press.target instanceof Node && button.contains(press.target))) e.stopPropagation();
    };
    el.addEventListener('focusin', onFocus);
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('focusin', onFocus);
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('click', onClick, true);
    };
  }, [phone]);

  // Hand tool: drag empty space to pan. (The Select tool's rectangle comes in step 4.)
  const drag = useRef<{ id: number; mode: 'pan' | 'marquee'; x: number; y: number; start: Point } | null>(null);
  // A finger on the empty board, for the zoom taps: double tap zooms in, a long tap zooms out.
  const press = useRef<{ id: number; down: Touch; moved: boolean } | null>(null);
  const lastTap = useRef<Touch | null>(null);
  // Shows the closed glove while the Hand tool drags the board.
  const [panning, setPanning] = useState(false);
  // The selection box keeps moving the board at the screen edge (owner request).
  const edges = useRef<ReturnType<typeof followEdges> | null>(null);
  const marquee = useAppState((s) => s.ui.marquee);
  const itemDrag = useAppState((s) => s.ui.itemDrag);

  // Touch screens (owner request): two fingers pinch to zoom and move together to pan, over cards
  // too. Listens before the blocks do; once a second finger lands, whatever the first one started
  // (a pan, a selection box, a block or item drag) is cancelled and the touches belong to the pinch
  // until every finger has lifted.
  useEffect(() => {
    const el = ref.current!;
    const fingers = new Map<number, Point>();
    // The view and the two fingers (relative to the canvas) when the pinch began.
    let pinch: { view: View; from: [Point, Point] } | null = null;
    const pair = (): [Point, Point] => {
      const r = el.getBoundingClientRect();
      const [a, b] = [...fingers.values()];
      return [{ x: a.x - r.left, y: a.y - r.top }, { x: b.x - r.left, y: b.y - r.top }];
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      // A tap on a card or container in between means the next tap on the board is not a double tap.
      if (e.target !== el && (e.target as Element).closest('[data-card-id], [data-col-id]')) lastTap.current = null;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) {
        // A finger put back down after one lifted: carry on from the new pair.
        if (fingers.size === 2) pinch = { view: appStore.getState().view, from: pair() };
        return e.stopPropagation();
      }
      if (fingers.size < 2) return;
      pinch = { view: appStore.getState().view, from: pair() };
      e.stopPropagation();
      e.preventDefault();
      if (drag.current?.mode === 'marquee') appStore.endMarquee();
      edges.current?.stop();
      edges.current = null;
      drag.current = null;
      press.current = null;
      lastTap.current = null;
      setPanning(false);
      for (const id of fingers.keys()) if (id !== e.pointerId) window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, pointerType: 'touch' }));
    };
    const onMove = (e: PointerEvent) => {
      if (!pinch || !fingers.has(e.pointerId)) return;
      e.stopPropagation();
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // A third finger is ignored; the first two steer. One finger left over does nothing.
      if (fingers.size >= 2) appStore.pinchTo(pinch.view, pinch.from, pair());
    };
    const onUp = (e: PointerEvent) => {
      if (!fingers.delete(e.pointerId) || !pinch) return;
      e.stopPropagation();
      if (!fingers.size) pinch = null;
    };
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    el.addEventListener('pointerup', onUp, true);
    el.addEventListener('pointercancel', onUp, true);
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onMove, true);
      el.removeEventListener('pointerup', onUp, true);
      el.removeEventListener('pointercancel', onUp, true);
    };
  }, []);

  // Blocks stop their own presses, so these handle presses on empty board.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const keep = e.ctrlKey || e.metaKey || e.shiftKey;
    if (!keep) appStore.clearSelection();
    // Clicking the board takes focus away from any text field (e.g. the board name).
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const at = clientToCanvas(e.clientX, e.clientY);
    const mode = appStore.getState().view.tool === 'hand' ? 'pan' : 'marquee';
    drag.current = { id: e.pointerId, mode, x: e.clientX, y: e.clientY, start: at };
    press.current = e.pointerType === 'touch' ? { id: e.pointerId, down: { x: e.clientX, y: e.clientY, t: Date.now() }, moved: false } : null;
    if (mode === 'pan') setPanning(true);
    // Select tool: drag a box; everything it touches is selected (Ctrl adds to the selection).
    if (mode === 'marquee') {
      appStore.startMarquee(at, keep);
      edges.current = followEdges((p, moved) => {
        const d = drag.current;
        if (!d) return;
        // The box's starting corner stays on the same spot of the board as the board moves.
        d.start = { x: d.start.x + moved.dx, y: d.start.y + moved.dy };
        appStore.updateMarquee(d.start, clientToCanvas(p.clientX, p.clientY));
      });
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = press.current;
    if (p?.id === e.pointerId && Math.hypot(e.clientX - p.down.x, e.clientY - p.down.y) >= DRAG_THRESHOLD) p.moved = true;
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.mode === 'marquee') {
      edges.current?.track(e);
      return appStore.updateMarquee(d.start, clientToCanvas(e.clientX, e.clientY));
    }
    appStore.panBy(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX;
    d.y = e.clientY;
  }

  // Touch screens, empty board only (owner request): two quick taps close together zoom in one step,
  // a finger resting without moving zooms out one step when it lifts (so a rest then a swipe still
  // pans or draws the box), each around the finger and by the zoom buttons' step.
  function zoomTap(e: React.PointerEvent<HTMLDivElement>) {
    const p = press.current;
    if (p?.id !== e.pointerId) return;
    press.current = null;
    const up = { x: e.clientX, y: e.clientY, t: Date.now() };
    const kind = pressKind(p.down, up, p.moved, HOLD_MS);
    const at = clientToCanvas(e.clientX, e.clientY);
    const double = kind === 'tap' && isDoubleTap(lastTap.current, p.down);
    if (kind === 'long') appStore.zoomAt(at, 1 / ZOOM_STEP);
    else if (double) appStore.zoomAt(at, ZOOM_STEP);
    lastTap.current = kind === 'tap' && !double ? up : null;
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    if (drag.current.mode === 'marquee') appStore.endMarquee();
    edges.current?.stop();
    edges.current = null;
    drag.current = null;
    setPanning(false);
  }

  const grid = gridStyle(view);
  const dot = snap ? 'var(--grid-dot)' : 'var(--grid-dot-faint)';

  return (
    <div
      ref={ref}
      className={`canvas tool-${view.tool}${panning ? ' panning' : ''}`}
      data-testid="canvas"
      role="main"
      aria-label="Board"
      data-pan-x={view.panX}
      data-pan-y={view.panY}
      data-zoom={view.zoom}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
        zoomTap(e);
        endDrag(e);
      }}
      onPointerCancel={(e) => {
        press.current = null;
        lastTap.current = null;
        endDrag(e);
      }}
      onContextMenu={(e) => press.current && e.preventDefault()} // a long tap zooms; no copy / paste menu
      style={{
        // Text size on cards and containers (A− / A+).
        '--fs': FONT_SCALE[view.fontSize],
        backgroundImage: `radial-gradient(${dot} ${grid.dotRadius}px, transparent ${grid.dotRadius + 0.2}px)`,
        backgroundSize: `${grid.size}px ${grid.size}px`,
        backgroundPosition: `${grid.offsetX}px ${grid.offsetY}px`,
      } as CSSProperties}
    >
      {empty && (
        <p className="empty-hint">
          {phone
            ? 'Tap the Add button (+) below to add a note, a checklist or a container.'
            : 'Add a note, a checklist or a container from the toolbar, or drag one onto the board. Press ? for keyboard shortcuts.'}
        </p>
      )}
      <div className="world" style={{ transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})` }}>
        {order.map((id) => {
          if (id === draggedCard || id === draggedColumn) return null;
          return columns[id] ? <ColumnView key={id} id={id} /> : <CardView key={id} id={id} inColumn={false} />;
        })}
        {/* The block being dragged is drawn last so it stays on top. */}
        {draggedColumn && <ColumnView key={draggedColumn} id={draggedColumn} />}
        {draggedCard && <CardView key={draggedCard} id={draggedCard} inColumn={false} />}
        {/* Alignment guides: where the dragged block lines up with another (owner request). */}
        {/* Keyed by place in the list: two guides can share axis, line and start (the block lined up
            with two others at once), and repeated keys made React leave old lines on the board. */}
        {guides.map((g, i) => (
          <div
            key={i}
            className={`align-guide ${g.axis}`}
            style={g.axis === 'x' ? { left: g.at, top: g.from, height: g.to - g.from } : { top: g.at, left: g.from, width: g.to - g.from }}
          />
        ))}
        {land && (
          <div
            className="landing-spot"
            data-testid="landing-spot"
            aria-hidden="true"
            style={{ left: land.x, top: land.y, width: land.w, height: land.h }}
          />
        )}
      </div>
      {newDrag?.at && (
        <div className="item-ghost" data-testid="new-card-ghost" style={{ left: newDrag.at.x + 14, top: newDrag.at.y + 10 }}>
          <span className="item-ghost-label">{NEW_CARD_LABEL[newDrag.kind]}</span>
        </div>
      )}
      {itemDrag && (
        <div className={itemDrag.lift ? 'item-ghost moving lifted' : 'item-ghost moving'} data-testid="item-ghost" style={itemGhostStyle(itemDrag)}>
          <span className="item-ghost-label">{itemDrag.label}</span>
          {itemDrag.hint && 'newList' in itemDrag.hint ? (
            <span className="item-ghost-extra">Drop to make a new list</span>
          ) : (
            itemDrag.extra && <span className="item-ghost-extra">{itemDrag.extra}</span>
          )}
        </div>
      )}
      {marquee && (
        <div
          className="marquee"
          data-testid="marquee"
          aria-hidden="true"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
        />
      )}
      {resizeLabel && (
        <div className="size-label" data-testid="size-label" style={{ left: resizeLabel.labelAt.x, top: resizeLabel.labelAt.y }}>
          {resizeLabel.label}
        </div>
      )}
    </div>
  );
}

/**
 * Where the dragged items' label is, moved by `translate` (not left / top, so nothing is laid out again
 * as the finger moves). By mouse it trails the pointer. Lifted by a finger it is the row's width, kept on
 * the screen, sitting on the finger's line, a little above it, so the gap opening under the finger stays in view.
 */
function itemGhostStyle({ at, lift }: ItemDrag): CSSProperties {
  if (!lift) return { translate: `${at.x + 14}px ${at.y + 10}px` };
  const x = Math.max(8, Math.min(at.x - lift.width / 2, (canvasRect()?.width ?? Infinity) - lift.width - 8));
  return { width: lift.width, translate: `${x}px max(8px, calc(${at.y + 12}px - 100%))` };
}
