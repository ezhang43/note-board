import { useEffect, useSyncExternalStore, type CSSProperties } from 'react';
import './appFonts';
import { Canvas } from './components/Canvas';
import { CommentThread } from './components/Comments';
import { EstimatePicker } from './components/Estimate';
import { ask, ConfirmDialog } from './components/ConfirmDialog';
import { UndoToast } from './components/UndoToast';
import { DeleteCompleted } from './components/DeleteCompleted';
import { DeleteAccountPanel } from './components/DeleteAccountPanel';
import { BrainDumpDialog } from './components/BrainDumpDialog';
import { FeedbackPanel } from './components/FeedbackPanel';
import { FindBar } from './components/FindBar';
import { FormatBar } from './components/FormatBar';
import { HistoryPanel, PreviewBar } from './components/HistoryPanel';
import { ItemBar } from './components/ItemBar';
import { LiveRegion } from './components/LiveRegion';
import { PhoneBar } from './components/PhoneBar';
import { NoticeBanner } from './components/SharePanel';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { Visualizer } from './components/Visualizer';
import { Tour } from './components/Tour';
import { Toolbar } from './components/Toolbar';
import { ZoomControl } from './components/ZoomControl';
import { usePhone } from './components/usePhone';
import { appStore, BoardScope, useAppState, useViewOnly } from './store/appStore';
import { ChecklistPanel } from './components/ChecklistPanel';
import { ViewOnlyNote } from './components/ViewOnly';
import { PomodoroPanel } from './components/PomodoroPanel';
import { SidePanel } from './components/SidePanel';
import { CompletedPanel } from './components/CompletedPanel';
import { JournalPanel } from './components/JournalPanel';
import { HabitsPanel } from './components/HabitsPanel';
import { CalendarPanel } from './components/CalendarPanel';
import { PanelResizeHandle } from './components/PanelResizeHandle';
import { PANEL_MIN } from './model/calendar';
import { panelWidths, usePanelWidths } from './store/panelWidths';
import { calendar } from './store/calendar';
import { announce } from './store/announce';
import { useShortcuts } from './components/useShortcuts';
import { useDropPaste } from './components/useDropPaste';

/** What a panel's resize strip is called: "Resize journal". */
const RESIZE_NAME = { history: 'version history', pomodoro: 'focus timer', completed: 'completed', journal: 'journal', habits: 'habits' } as const;
const closeSidePanel = () => appStore.toggleSidePanel('pomodoro');
const closeCalendar = () => appStore.toggleSidePanel('calendar');
const closeCompleted = () => appStore.closeCompleted();
const closeJournal = () => appStore.toggleSidePanel('journal');
const closeHabits = () => appStore.toggleSidePanel('habits');

/**
 * `onSignOut` and `saveNote` ("Saving…" / "Saved" / offline) are given on the published site, where
 * the board is synced to its owner's account. Every Sign out on the board (toolbar, folded ⋯, phone ⋯)
 * asks first (owner request, 2026-11-12); the ones on the sign-in screen's own error cards don't.
 */
export function App({ onSignOut, saveNote }: { onSignOut?: () => void; saveNote?: string | null }) {
  useShortcuts();
  useDropPaste();
  // null = saving online failed (the banner shows): said aloud too, as it appears.
  useEffect(() => {
    if (saveNote === null) announce('Couldn’t save online. Changes are on this device only.');
  }, [saveNote]);
  const phone = usePhone();
  // Only "Saved" makes the reassurance true. "Saving…" is not enough (signing out sends the waiting changes
  // but doesn't wait for them to arrive), and no note at all means the board isn't synced online (the demo page).
  const allSent = saveNote === 'Saved';
  const signOut = onSignOut && (async () => {
    const body = allSent ? 'Your boards stay saved online. You can sign in again any time.' : 'Some of your latest changes haven’t been saved online yet, so they may be missing when you sign in again.';
    if (await ask({ title: 'Sign out?', body, action: 'Sign out' })) onSignOut();
  });
  const previewing = useAppState((s) => s.ui.preview !== null);
  const viewOnly = useViewOnly();
  const sidePanel = useAppState((s) => s.ui.sidePanel);
  const historyShown = useAppState((s) => s.ui.historyOpen);
  // Anything in the right-hand spot (history, the side panel) moves the corner controls aside.
  const historyOpen = historyShown || sidePanel !== null;
  // Each panel's width is the person's own (owner requests 2026-10-16 and 2026-10-20), the calendar's
  // for Week and Month separately. The CSS clamp keeps 300px of board beside it when the window shrinks.
  const calendarWidth = useSyncExternalStore(calendar.subscribe, () => calendar.get().widths[calendar.get().view]);
  const others = usePanelWidths();
  const panel = sidePanel ?? (historyShown ? 'history' : null);
  const resize =
    panel && !phone
      ? panel === 'calendar'
        ? { name: 'calendar', width: calendarWidth, set: (w: number) => calendar.setWidth(calendar.get().view, w), reset: () => calendar.resetWidth(calendar.get().view) }
        : { name: RESIZE_NAME[panel], width: others[panel], set: (w: number) => panelWidths.set(panel, w), reset: () => panelWidths.reset(panel) }
      : null;
  // The Checklist panel on the left (owner request, 2026-11-12), open beside any panel on the right. With one
  // open there it gives way first, keeping 300px of board between the two while the window allows.
  const checklistOpen = useAppState((s) => s.ui.checklistOpen);
  const completedBoard = useAppState((s) => s.ui.completedBoard);
  // A phone shows one panel at a time: a panel opened on the right closes the checklist.
  useEffect(() => {
    if (phone && checklistOpen && historyOpen) appStore.openChecklist();
  }, [phone, checklistOpen, historyOpen]);
  const classes = ['app', phone && 'phone', previewing && 'previewing', viewOnly && 'view-only', historyOpen && 'history-open', checklistOpen && 'checklist-open']
    .filter(Boolean)
    .join(' ');
  const room = resize ? `max(${PANEL_MIN}px, 100vw - ${PANEL_MIN}px - var(--side-width))` : `100vw - ${PANEL_MIN}px`;
  const style = {
    ...(resize && { '--side-width': `clamp(${PANEL_MIN}px, ${resize.width}px, 100vw - ${PANEL_MIN}px)` }),
    ...(checklistOpen && !phone && { '--left-width': `clamp(${PANEL_MIN}px, ${others.checklist}px, ${room})` }),
  } as CSSProperties;
  return (
    <div className={classes} style={style}>
      <LiveRegion />
      <Toolbar onSignOut={signOut} />
      <Canvas />
      {phone && <PhoneBar onSignOut={signOut} />}
      {phone && <ItemBar />}
      <ZoomControl saveNote={saveNote} />
      <FindBar />
      <HistoryPanel />
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
        // Opened from the Checklist panel, it shows that checklist's record (completedBoard).
        <SidePanel title={completedBoard ? 'Completed: Checklist' : 'Completed'} onClose={closeCompleted}>
          <BoardScope value={completedBoard}>
            <CompletedPanel />
          </BoardScope>
        </SidePanel>
      )}
      {sidePanel === 'journal' && (
        <JournalPanel onClose={closeJournal} />
      )}
      {sidePanel === 'habits' && (
        <SidePanel title="Habits" onClose={closeHabits}>
          <HabitsPanel />
        </SidePanel>
      )}
      {resize && <PanelResizeHandle name={resize.name} width={resize.width} onSet={resize.set} onReset={resize.reset} />}
      {checklistOpen && <ChecklistPanel />}
      {checklistOpen && !phone && (
        <PanelResizeHandle
          side="left"
          name="checklist"
          width={others.checklist}
          beside={resize?.width ?? 0}
          onSet={(w) => panelWidths.set('checklist', w)}
          onReset={() => panelWidths.reset('checklist')}
        />
      )}
      <PreviewBar />
      <FormatBar />
      <ShortcutsPanel />
      <Visualizer />
      <DeleteCompleted />
      <NoticeBanner />
      <ViewOnlyNote />
      <UndoToast />
      <DeleteAccountPanel />
      <FeedbackPanel />
      <BrainDumpDialog />
      <Tour />
      <CommentThread />
      <EstimatePicker />
      <ConfirmDialog />
    </div>
  );
}
