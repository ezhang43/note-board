import { useEffect, useState } from 'react';
import { clampPanelWidth, PANEL_MIN, PANEL_STEP } from '../model/calendar';

/**
 * A strip on a side panel's left edge to drag (or use the arrow keys on) to make the panel wider or
 * narrower; double-click puts the usual width back (owner request, 2026-10-16 for the calendar,
 * 2026-10-20 for every panel). Not part of the panel itself, which scrolls and would clip it.
 * `width` is the remembered width; `onSet` and `onReset` keep it. `side="left"` is the Checklist panel's,
 * on the left, whose strip is on its right edge (owner request, 2026-11-12).
 */
export function PanelResizeHandle({
  name,
  width,
  onSet,
  onReset,
  side = 'right',
}: {
  name: string;
  width: number;
  onSet: (width: number) => void;
  onReset: () => void;
  side?: 'left' | 'right';
}) {
  const left = side === 'left';
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const set = (w: number) => onSet(clampPanelWidth(w, window.innerWidth));
  const now = clampPanelWidth(width, windowWidth);
  return (
    <div
      className={left ? 'panel-resize left' : 'panel-resize'}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${name}`}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={Math.max(PANEL_MIN, windowWidth - PANEL_MIN)}
      aria-valuenow={now}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && set(left ? e.clientX : window.innerWidth - e.clientX)}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        // Not a board shortcut: the arrows must not nudge selected blocks.
        e.preventDefault();
        e.stopPropagation();
        set(now + ((e.key === 'ArrowLeft') !== left ? PANEL_STEP : -PANEL_STEP));
      }}
    />
  );
}
