import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Wedge } from '../model/visualizer';
import { startDisc, type Palette } from './visualizerDraw';

// Calm mode (owner request 2026-11-13) draws the finished picture and nothing moves, so the loop must not go on
// redrawing the whole canvas on every frame for ever (review 2026-11-15, item 7). No browser here: a stand-in
// canvas whose drawing calls are counted, and a hand-turned frame clock.

/** A drawing surface that accepts any call; counts the clears (one per drawn picture). */
function surface(count: { clears: number }) {
  const ctx: unknown = new Proxy(function () {}, {
    get: (_t, key) => {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key === 'clearRect') return () => void count.clears++;
      if (key === Symbol.toPrimitive) return () => 0;
      return ctx;
    },
    set: () => true,
    apply: () => ctx,
  });
  return ctx;
}

const palette: Palette = { hues: Array(9).fill('#f2b62b'), core: '#d94ee8', spark: '#fff3ff', lead: '#9dffb8', pink: '#ffc2f2', disc: '#3a1c78', label: '#b9a9e0', rim: '#8a74d0' };
const wedges: Wedge[] = [{ key: 'a', name: 'Alpha', count: 2, hue: 0, cells: [{ count: 2 } as Wedge['cells'][number]] }];
const slots = [
  { wedge: 0, cell: 0 },
  { wedge: 0, cell: 0 },
];

function rig(still: boolean) {
  const count = { clears: 0 };
  const frames: ((t: number) => void)[] = [];
  let resize: () => void = () => {};
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => surface({ clears: 0 }) }) });
  vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => frames.push(f));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        resize = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  const canvas = { clientWidth: 600, clientHeight: 400, width: 0, height: 0, dataset: {}, getContext: () => surface(count) } as unknown as HTMLCanvasElement;
  startDisc({ canvas, wedges, slots, palette, still, cards: [['a', 'b'], ['c', 'd']], onLanded: () => {} });
  /** Turns the frame clock: runs the frames asked for so far, `n` times over. */
  const run = (n: number, from = 0) => {
    for (let i = 0; i < n; i++) frames.splice(0).forEach((f) => f(from + i * 16));
  };
  return { count, frames, run, resize: () => resize() };
}

afterEach(() => vi.unstubAllGlobals());

describe('the Visualizer’s frame loop', () => {
  it('in Calm it draws once after landing and then stops asking for frames', () => {
    const r = rig(true);
    r.run(60);
    expect(r.count.clears).toBe(1);
    expect(r.frames).toHaveLength(0);
  });

  it('in Calm a resize draws the picture again, once', () => {
    const r = rig(true);
    r.run(5);
    r.resize();
    r.run(5, 100);
    expect(r.count.clears).toBe(2);
    expect(r.frames).toHaveLength(0);
  });

  it('with motion it keeps drawing every frame', () => {
    const r = rig(false);
    r.run(30);
    expect(r.count.clears).toBeGreaterThan(25);
    expect(r.frames.length).toBe(1);
  });
});
