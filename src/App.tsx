import { Canvas } from './components/Canvas';
import { FormatBar } from './components/FormatBar';
import { HistoryPanel, PreviewBar } from './components/HistoryPanel';
import { ItemBar } from './components/ItemBar';
import { PhoneBar } from './components/PhoneBar';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { Toolbar } from './components/Toolbar';
import { ZoomControl } from './components/ZoomControl';
import { usePhone } from './components/usePhone';
import { useAppState } from './store/appStore';
import { useShortcuts } from './components/useShortcuts';

/**
 * `onSignOut` and `saveNote` ("Saving…" / "Saved" / offline) are given on the published site, where
 * the board is synced to its owner's account.
 */
export function App({ onSignOut, saveNote }: { onSignOut?: () => void; saveNote?: string | null }) {
  useShortcuts();
  const phone = usePhone();
  const previewing = useAppState((s) => s.ui.preview !== null);
  const historyOpen = useAppState((s) => s.ui.historyOpen);
  const classes = ['app', phone && 'phone', previewing && 'previewing', historyOpen && 'history-open'].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <Toolbar onSignOut={onSignOut} />
      <Canvas />
      {phone && <PhoneBar onSignOut={onSignOut} />}
      {phone && <ItemBar />}
      <ZoomControl saveNote={saveNote} />
      <HistoryPanel />
      <PreviewBar />
      <FormatBar />
      <ShortcutsPanel />
    </div>
  );
}
