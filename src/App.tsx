import { Canvas } from './components/Canvas';
import { FormatBar } from './components/FormatBar';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { Toolbar } from './components/Toolbar';
import { ZoomControl } from './components/ZoomControl';
import { useShortcuts } from './components/useShortcuts';

/**
 * `onSignOut` and `saveNote` ("Saving…" / "Saved" / offline) are given on the published site, where
 * the board is synced to its owner's account.
 */
export function App({ onSignOut, saveNote }: { onSignOut?: () => void; saveNote?: string | null }) {
  useShortcuts();
  return (
    <div className="app">
      <Toolbar onSignOut={onSignOut} />
      <Canvas />
      <ZoomControl saveNote={saveNote} />
      <FormatBar />
      <ShortcutsPanel />
    </div>
  );
}
