import { edgePanStep } from '../model/edgePan';
import { appStore } from '../store/appStore';
import { canvasRect } from './canvasDom';

type Pointer = { clientX: number; clientY: number };

/**
 * While a drag is in progress, keeps moving the board when the pointer rests near an edge of the
 * board area, and calls `onPan` (with how far the board moved) so the drag can update as if the
 * pointer had moved. Call `track` on every pointer move and `stop` when the drag ends.
 * A drag that starts near an edge only moves the board once the pointer has been away from the edges.
 */
export function followEdges(onPan: (p: Pointer, moved: { dx: number; dy: number }) => void) {
  let last: Pointer | null = null;
  let armed = false;
  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);
    const area = canvasRect();
    if (!last || !area) return;
    const step = edgePanStep({ x: last.clientX, y: last.clientY }, area);
    if (!step.dx && !step.dy) {
      armed = true;
      return;
    }
    if (!armed) return;
    appStore.panBy(step.dx, step.dy);
    onPan(last, step);
  };
  frame = requestAnimationFrame(tick);
  return {
    track(p: Pointer) {
      last = { clientX: p.clientX, clientY: p.clientY };
    },
    stop() {
      cancelAnimationFrame(frame);
    },
  };
}
