import { lazy, Suspense, useEffect } from 'react';
import { closeWhenGone, useVisualizerOpen } from './visualizerState';

// The Visualizer (a full-screen view with its drawing code, about 13 KB zipped) is loaded the first time
// it opens, so the app starts without it (job perf-panels). Its button calls `prefetchVisualizer` on hover
// and focus, so the code is usually there before the click. Nothing is drawn while it loads, and nothing
// else on the screen shifts, since it covers the board.
// simple: the Journal, Habits and Calendar panels stay in the main code. They take typing the moment they
// open, and a panel still loading would drop those first keys. Revisit with a way to hold keys until ready.

const load = () => import('./VisualizerOverlay');
export const prefetchVisualizer = () => void load().catch(() => {});

const Overlay = lazy(() => load().then((m) => ({ default: m.VisualizerOverlay })));

export function Visualizer() {
  useEffect(closeWhenGone, []);
  const open = useVisualizerOpen();
  return open ? (
    <Suspense fallback={null}>
      <Overlay />
    </Suspense>
  ) : null;
}
