// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appStore } from '../store/appStore';
import { setCanvasElement } from './canvasDom';
import { followEdges, NO_EDGES } from './edgeFollow';

describe('followEdges', () => {
  let frames: FrameRequestCallback[];
  let panSpy: ReturnType<typeof vi.spyOn>;

  const stepFrame = () => {
    const next = frames.splice(0);
    for (const cb of next) cb(0);
  };

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const canvas = document.createElement('div');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 52, right: 1200, bottom: 800, width: 1200, height: 748, x: 0, y: 52, toJSON: () => ({}) });
    setCanvasElement(canvas);
    panSpy = vi.spyOn(appStore, 'panBy').mockImplementation(() => {});
  });

  afterEach(() => {
    setCanvasElement(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not pan the board while isActive returns false, and pans once it becomes true', () => {
    let active = false;
    const onPan = vi.fn();
    const edges = followEdges(onPan, () => active);

    // Away from the edges first so the tracker arms.
    edges.track({ clientX: 250, clientY: 250 });
    stepFrame();
    expect(panSpy).not.toHaveBeenCalled();

    // Move to the top-left edge while still inactive (e.g. highlighting text inside one item).
    edges.track({ clientX: 8, clientY: 60 });
    stepFrame();
    expect(panSpy).not.toHaveBeenCalled();
    expect(onPan).not.toHaveBeenCalled();

    // Once active (e.g. selecting across items or past the drag threshold), edge panning runs.
    active = true;
    stepFrame();
    expect(panSpy).toHaveBeenCalledTimes(1);
    expect(onPan).toHaveBeenCalledTimes(1);

    edges.stop();
  });

  it('NO_EDGES never pans the board', () => {
    NO_EDGES.track({ clientX: 250, clientY: 250 });
    NO_EDGES.track({ clientX: 8, clientY: 60 });
    stepFrame();
    NO_EDGES.stop();
    expect(panSpy).not.toHaveBeenCalled();
  });
});
