import { VisualizerIcon } from './icons';
import { openVisualizer } from './visualizerState';
import { prefetchVisualizer } from './lazyPanels';

/** Opens the Visualizer: a row in the ⋯ More menu on a computer, a full-width tile in the ⋯ sheet on a phone. */
export function VisualizerButton({ onOpen }: { onOpen?: () => void }) {
  return (
    <button
      type="button"
      className="tb-button"
      aria-label="Visualizer"
      title="Visualizer: completed items, replayed"
      onPointerEnter={() => prefetchVisualizer()}
      onFocus={() => prefetchVisualizer()}
      onClick={() => {
        openVisualizer();
        onOpen?.();
      }}
    >
      <VisualizerIcon />
      Visualizer
    </button>
  );
}
