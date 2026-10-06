import { Canvas } from './components/Canvas';
import { DeleteCompleted } from './components/DeleteCompleted';
import { FindBar } from './components/FindBar';
import { FormatBar } from './components/FormatBar';
import { HistoryPanel, PreviewBar } from './components/HistoryPanel';
import { DuePanel, DuePicker } from './components/Due';
import { ItemBar } from './components/ItemBar';
import { PhoneBar } from './components/PhoneBar';
import { NoticeBanner } from './components/SharePanel';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { Toolbar } from './components/Toolbar';
import { ZoomControl } from './components/ZoomControl';
import { usePhone } from './components/usePhone';
import { appStore, useAppState } from './store/appStore';
import { PomodoroPanel } from './components/PomodoroPanel';
import { SidePanel } from './components/SidePanel';
import { CalendarPanel } from './components/CalendarPanel';

const closeSidePanel = () => appStore.toggleSidePanel('pomodoro');
const closeCalendar = () => appStore.toggleSidePanel('calendar');
import { useShortcuts } from './components/useShortcuts';

/**
 * `onSignOut` and `saveNote` ("Saving…" / "Saved" / offline) are given on the published site, where
 * the board is synced to its owner's account.
 */
export function App({ onSignOut, saveNote }: { onSignOut?: () => void; saveNote?: string | null }) {
  useShortcuts();
  const phone = usePhone();
  const previewing = useAppState((s) => s.ui.preview !== null);
  const sidePanel = useAppState((s) => s.ui.sidePanel);
  // Anything in the right-hand spot (history, Due, the side panel) moves the corner controls aside.
  const historyOpen = useAppState((s) => s.ui.historyOpen || s.ui.dueOpen || s.ui.sidePanel !== null);
  const classes = ['app', phone && 'phone', previewing && 'previewing', historyOpen && 'history-open'].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <Toolbar onSignOut={onSignOut} />
      <Canvas />
      {phone && <PhoneBar onSignOut={onSignOut} />}
      {phone && <ItemBar />}
      <ZoomControl saveNote={saveNote} />
      <FindBar />
      <HistoryPanel />
      <DuePanel />
      {sidePanel === 'pomodoro' && (
        <SidePanel title="Focus timer" onClose={closeSidePanel}>
          <PomodoroPanel />
        </SidePanel>
      )}
      {sidePanel === 'calendar' && (
        <SidePanel title="Google Calendar" onClose={closeCalendar}>
          <CalendarPanel />
        </SidePanel>
      )}
      <DuePicker />
      <PreviewBar />
      <FormatBar />
      <ShortcutsPanel />
      <DeleteCompleted />
      <NoticeBanner />
    </div>
  );
}
