import { useEffect, useState, type ComponentType } from 'react';
import { collab } from '../sync/collabSession';
import { closeVisualizer, closeWhenGone, useVisualizerOpen } from './visualizerState';

// The Visualizer (a full-screen view with its drawing code, about 13 KB zipped) is loaded the first time
// it opens, so the app starts without it (job perf-panels). Its button calls `prefetchVisualizer` on hover
// and focus, so the code is usually there before the click. Nothing is drawn while it loads, and nothing
// else on the screen shifts, since it covers the board. If it can't be fetched (offline, or the site was
// updated since this page opened) it closes again with a notice; a reload brings it back (a browser keeps a
// failed module import for the life of the page).
// simple: the Journal, Habits and Calendar panels stay in the main code. They take typing the moment they
// open, and a panel still loading would drop those first keys. Revisit with a way to hold keys until ready.

let loading: Promise<typeof import('./VisualizerOverlay')> | null = null;
const load = () =>
  (loading ??= import('./VisualizerOverlay').catch((e) => {
    loading = null; // a failed fetch is not kept
    throw e;
  }));
export const prefetchVisualizer = () => void load().catch(() => {});

export function Visualizer() {
  useEffect(closeWhenGone, []);
  const open = useVisualizerOpen();
  const [Overlay, setOverlay] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!open || Overlay) return;
    let live = true;
    load().then(
      (m) => live && setOverlay(() => m.VisualizerOverlay),
      () => {
        closeVisualizer();
        collab.setNotice('Couldn’t open the Visualizer. Check your connection and reload the page.');
      },
    );
    return () => {
      live = false;
    };
  }, [open, Overlay]);
  return open && Overlay ? <Overlay /> : null;
}
