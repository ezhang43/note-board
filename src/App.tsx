import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { ZoomControl } from './components/ZoomControl';
import { useShortcuts } from './components/useShortcuts';

export function App() {
  useShortcuts();
  return (
    <div className="app">
      <Toolbar />
      <Canvas />
      <ZoomControl />
    </div>
  );
}
