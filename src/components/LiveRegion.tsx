import { useSyncExternalStore, type CSSProperties } from 'react';
import { announcer } from '../store/announce';

// Hidden from the eye, not from a screen reader.
const hidden: CSSProperties = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

/** The page's one polite live region: it speaks what the store announces (store/announce.ts). Always on the page, so changes in it are heard. */
export function LiveRegion() {
  const text = useSyncExternalStore(announcer.subscribe, announcer.get);
  return (
    <div data-testid="announcer" aria-live="polite" aria-atomic="true" style={hidden}>
      {text}
    </div>
  );
}
