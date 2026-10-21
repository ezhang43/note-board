import type { ResizeDir } from '../model/sizing';
import { resizePointerDown } from './useResize';

/**
 * Invisible strips along a block's edges and squares at its corners, to resize it from that side
 * (owner request 2026-10-21). Pointer only: the keyboard keeps the right-edge strip and the corner
 * handle, which are separate buttons. These are buttons too (hidden from the keyboard and screen readers),
 * like the other handles. They are switched off on touch screens (styles.css). `heightFree` false (a container with cards, which is as tall as
 * its cards) makes every grip set the width only.
 */
export function ResizeGrips({ kind, id, dirs, heightFree = true, minH }: { kind: 'card' | 'column'; id: string; dirs: ResizeDir[]; heightFree?: boolean; minH?: number }) {
  return (
    <>
      {dirs.map((d) => (
        <button
          key={d}
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          data-grip={d}
          className={`resize-grip grip-${d}${heightFree ? '' : ' width-only'}`}
          onPointerDown={resizePointerDown(kind, id, heightFree ? d : d.includes('w') ? 'w' : 'e', minH)}
        />
      ))}
    </>
  );
}
