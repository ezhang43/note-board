import { ZOOM_STEP } from '../model/constants';
import { FONT_SIZES } from '../model/font';
import { zoomLabel } from '../model/view';
import { appStore, useAppState } from '../store/appStore';
import { FitIcon, HistoryIcon, MinusIcon, PlusIcon, SearchIcon } from './icons';
import { usePhone } from './usePhone';

/**
 * Bottom-right corner: on the published site a small "Saving…" / "Saved" note, then text size
 * (A− / A+), the keyboard shortcuts (?) button and the zoom control.
 */
export function ZoomControl({ saveNote }: { saveNote?: string | null }) {
  const zoom = useAppState((s) => s.view.zoom);
  const historyOpen = useAppState((s) => s.ui.historyOpen);
  const findOpen = useAppState((s) => s.ui.find !== null);
  const note = saveNote && (
    <span className="save-note" role="status">
      {saveNote}
    </span>
  );
  // On a phone: only the save note. Two fingers zoom, text size is in the ⋯ menu, and there is no keyboard.
  if (usePhone()) return note ? <div className="corner-controls">{note}</div> : null;
  return (
    <div className="corner-controls">
      {note}
      <TextSizeButtons />
      <button type="button" className="help-button" aria-label="Search" title="Search the board (Ctrl+F)" aria-pressed={findOpen} onClick={() => (findOpen ? appStore.closeFind() : appStore.openFind())}>
        <SearchIcon />
      </button>
      <button type="button" className="help-button" aria-label="Version history" title="Version history" aria-pressed={historyOpen} onClick={appStore.toggleHistory}>
        <HistoryIcon />
      </button>
      <button type="button" className="help-button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={appStore.toggleShortcuts}>
        ?
      </button>
      <div className="zoom-control" role="group" aria-label="Zoom">
        <button type="button" aria-label="Fit to screen" title="Fit to screen (Shift+1)" onClick={appStore.fitToScreen}>
          <FitIcon />
        </button>
        <button type="button" aria-label="Zoom out" title="Zoom out (Ctrl+−)" onClick={() => appStore.zoomAtCentre(1 / ZOOM_STEP)}>
          <MinusIcon />
        </button>
        <button type="button" className="zoom-label" aria-label="Reset zoom" title="Reset zoom (Ctrl+0)" onClick={appStore.resetZoom}>
          {zoomLabel(zoom)}
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in (Ctrl+=)" onClick={() => appStore.zoomAtCentre(ZOOM_STEP)}>
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

/** A− / A+: text size on cards and columns, remembered on this device. */
export function TextSizeButtons() {
  const fontSize = useAppState((s) => s.view.fontSize);
  const smallest = fontSize === FONT_SIZES[0];
  const largest = fontSize === FONT_SIZES[FONT_SIZES.length - 1];
  return (
    <div className="zoom-control" role="group" aria-label="Text size">
      <button
        type="button"
        className="text-size"
        aria-label="Smaller text"
        title="Smaller text on cards and columns"
        aria-disabled={smallest ? true : undefined}
        onClick={() => appStore.changeFontSize(-1)}
      >
        A−
      </button>
      <button
        type="button"
        className="text-size"
        aria-label="Larger text"
        title="Larger text on cards and columns"
        aria-disabled={largest ? true : undefined}
        onClick={() => appStore.changeFontSize(1)}
      >
        A+
      </button>
    </div>
  );
}
