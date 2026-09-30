import { useEffect, useRef } from 'react';
import { gridStyle, wheelZoomFactor } from '../model/view';
import { appStore, useAppState } from '../store/appStore';
import { setCanvasElement } from './canvasDom';
import { CardView } from './CardView';
import { ColumnView } from './ColumnView';

/** Wheel deltas can be in pixels, lines or pages; turn them into pixels. */
function wheelPixels(e: WheelEvent, pageHeight: number) {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? pageHeight : 1;
  return { dx: e.deltaX * unit, dy: e.deltaY * unit };
}

export function Canvas() {
  const view = useAppState((s) => s.view);
  const snap = useAppState((s) => s.board.snap);
  const ref = useRef<HTMLDivElement>(null);

  const order = useAppState((s) => s.board.order);
  const draggedCard = useAppState((s) => (s.ui.drag?.kind === 'card' ? s.ui.drag.id : null));
  const draggedColumn = useAppState((s) => (s.ui.drag?.kind === 'column' ? s.ui.drag.id : null));
  const columns = useAppState((s) => s.board.columns);

  // Keep the store told how big the canvas is, so zoom buttons can zoom around its centre
  // and new blocks appear in the middle of the screen.
  useEffect(() => {
    const el = ref.current!;
    setCanvasElement(el);
    const update = () => appStore.setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setCanvasElement(null);
    };
  }, []);

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
      const { dx, dy } = wheelPixels(e, el.clientHeight);
      appStore.panBy(-dx, -dy);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  // Hand tool: drag empty space to pan. (The Select tool's rectangle comes in step 4.)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    // Blocks stop their own presses, so this is a press on empty board: clear the selection.
    appStore.clearSelection();
    // Clicking the board takes focus away from any text field (e.g. the board name).
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    e.preventDefault();
    if (appStore.getState().view.tool !== 'hand') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    appStore.panBy(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX;
    d.y = e.clientY;
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  const grid = gridStyle(view);
  const dot = snap ? 'var(--grid-dot)' : 'var(--grid-dot-faint)';

  return (
    <div
      ref={ref}
      className="canvas"
      data-testid="canvas"
      data-pan-x={view.panX}
      data-pan-y={view.panY}
      data-zoom={view.zoom}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        backgroundImage: `radial-gradient(${dot} ${grid.dotRadius}px, transparent ${grid.dotRadius + 0.2}px)`,
        backgroundSize: `${grid.size}px ${grid.size}px`,
        backgroundPosition: `${grid.offsetX}px ${grid.offsetY}px`,
      }}
    >
      <div className="world" style={{ transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})` }}>
        {order.map((id) => {
          if (id === draggedCard || id === draggedColumn) return null;
          return columns[id] ? <ColumnView key={id} id={id} /> : <CardView key={id} id={id} inColumn={false} />;
        })}
        {/* The block being dragged is drawn last so it stays on top. */}
        {draggedColumn && <ColumnView key={draggedColumn} id={draggedColumn} />}
        {draggedCard && <CardView key={draggedCard} id={draggedCard} inColumn={false} />}
      </div>
    </div>
  );
}
