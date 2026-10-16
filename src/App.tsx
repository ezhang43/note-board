import { useSyncExternalStore, type CSSProperties } from 'react';
import { Canvas } from './components/Canvas';
import { DeleteCompleted } from './components/DeleteCompleted';
import { DeleteAccountPanel } from './components/DeleteAccountPanel';
import { FeedbackPanel } from './components/FeedbackPanel';
import { FindBar } from './components/FindBar';
import { FormatBar } from './components/FormatBar';
import { HistoryPanel, PreviewBar } from './components/HistoryPanel';
import { DuePanel, DuePicker } from './components/Due';
import { ItemBar } from './components/ItemBar';
import { PhoneBar } from './components/PhoneBar';
import { NoticeBanner } from './components/SharePanel';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { Tour } from './components/Tour';
import { Toolbar } from './components/Toolbar';
import { ZoomControl } from './components/ZoomControl';
import { usePhone } from './components/usePhone';
import { appStore, useAppState } from './store/appStore';
import { PomodoroPanel } from './components/PomodoroPanel';
import { SidePanel } from './components/SidePanel';
import { CompletedPanel } from './components/CompletedPanel';
import { CalendarPanel, CalendarResizeHandle } from './components/CalendarPanel';
import { PANEL_MIN } from './model/calendar';
import { calendar } from './store/calendar';

const closeSidePanel = () => appStore.toggleSidePanel('pomodoro');
const closeCalendar = () => appStore.toggleSidePanel('calendar');
const closeCompleted = () => appStore.toggleSidePanel('completed');
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
  // The calendar panel's width is the person's own, for Week and Month separately (owner request,
  // 2026-10-16). The CSS clamp keeps 300px of board beside it when the window shrinks.
  const calendarWidth = useSyncExternalStore(calendar.subscribe, () => calendar.get().widths[calendar.get().view]);
  const resizable = sidePanel === 'calendar' && !phone;
  const classes = ['app', phone && 'phone', previewing && 'previewing', historyOpen && 'history-open'].filter(Boolean).join(' ');
  const style = resizable ? ({ '--side-width': `clamp(${PANEL_MIN}px, ${calendarWidth}px, 100vw - ${PANEL_MIN}px)` } as CSSProperties) : undefined;
  return (
    <div className={classes} style={style}>
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
      {sidePanel === 'completed' && (
        <SidePanel title="Completed" onClose={closeCompleted}>
          <CompletedPanel />
        </SidePanel>
      )}
      {resizable && <CalendarResizeHandle />}
      <DuePicker />
      <PreviewBar />
      <FormatBar />
      <ShortcutsPanel />
      <DeleteCompleted />
      <NoticeBanner />
      <DeleteAccountPanel />
      <FeedbackPanel />
      <Tour />
    </div>
  );
}
