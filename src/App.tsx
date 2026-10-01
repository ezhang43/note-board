import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { ZoomControl } from './components/ZoomControl';
import { useShortcuts } from './components/useShortcuts';

/** `onSignOut` is given on the published site, where the board is synced to its owner's account. */
export function App({ onSignOut }: { onSignOut?: () => void }) {
  useShortcuts();
  return (
    <div className="app">
      <Toolbar onSignOut={onSignOut} />
      <Canvas />
      <ZoomControl />
    </div>
  );
}
