import { ZOOM_STEP } from '../model/constants';
import { zoomLabel } from '../model/view';
import { appStore, useAppState } from '../store/appStore';
import { MinusIcon, PlusIcon } from './icons';

export function ZoomControl() {
  const zoom = useAppState((s) => s.view.zoom);
  return (
    <div className="zoom-control" role="group" aria-label="Zoom">
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
  );
}
