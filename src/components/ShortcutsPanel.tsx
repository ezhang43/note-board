import { useEffect, useState } from 'react';
import { HOTKEY_NAMES, hotkeyFromEvent, labelOf, type HotkeyAction } from '../model/hotkeys';
import { appStore, useAppState } from '../store/appStore';
import { CloseIcon } from './icons';

/**
 * A row's keys: fixed text, or a key the person can change (job 118: `{ action }`, shown as the key
 * this device has chosen, a button that records a new one).
 */
type Row = [string, string] | { action: HotkeyAction; what: string };

/** Every keyboard shortcut, grouped. ⌘ works in place of Ctrl on a Mac. */
const GROUPS: { title: string; keys: Row[] }[] = [
  {
    title: 'Board',
    keys: [
      ['Ctrl+Z / Ctrl+Y', 'Undo / redo (also while typing)'],
      { action: 'hand', what: 'Hand tool' },
      { action: 'select', what: 'Select tool' },
      ['Ctrl+= / Ctrl+− / Ctrl+0', 'Zoom in / out / back to 100%'],
      ['Shift+1', 'Fit to screen: every card and container in view'],
      ['Ctrl+arrows', 'Switch boards: Left / Right the previous / next board in the Boards menu, Up the board above, Down the first board inside (not while typing)'],
      ['Ctrl+scroll or pinch', 'Zoom at the pointer'],
      ['?', 'Show or hide this list'],
    ],
  },
  {
    title: 'Cards and containers',
    keys: [
      { action: 'selectAll', what: 'Select every card and container (in a checklist: see below)' },
      { action: 'copy', what: 'Copy the selection' },
      { action: 'paste', what: 'Paste the selection' },
      { action: 'duplicate', what: 'Duplicate the selection' },
      { action: 'delete', what: 'Delete the selection (Backspace too)' },
      ['Arrows (Shift: 5 steps)', 'Move the selection'],
      ['Alt+arrows', 'Jump to the nearest card or container that way'],
      ['Escape', 'Leave a text field (keeps the card selected), then clear the selection'],
    ],
  },
  {
    title: 'Text',
    keys: [
      ['Ctrl+B / Ctrl+I', 'Bold / italic: the whole text box, selected items, or every box in selected cards'],
      ['Ctrl+Shift+> / <', 'Larger / smaller (Small, Normal, Large)'],
      ['Highlight some text', 'Shows the format bar: bold, italic, size and font'],
    ],
  },
  {
    title: 'Checklists',
    keys: [
      ['Enter', 'Split at the cursor; at the start, add an item above'],
      ['Ctrl+Enter', 'Tick the item (or untick it); the cursor moves to the next one'],
      ['Tab / Shift+Tab', 'Nest under the item above / move out a level'],
      ['Backspace in an empty item', 'Delete it'],
      ['Delete at the end', 'Join the next item into this one'],
      ['Up / Down', 'Move between items and cards'],
      ['Ctrl+Shift+Up / Down', 'Move the item up / down past its neighbor'],
      ['Shift+click, or press and drag', 'Select several items (drag on into the next cards of a container)'],
      ['Ctrl+A again and again', "Select the item text, the list, the container's lists, then the whole board"],
      ['Ctrl+C / Ctrl+X / Ctrl+V', 'Copy / cut / paste selected items'],
      ['Ctrl+Shift+Backspace', 'Delete every item in the Completed sections on this board (asks first; Control on a Mac too)'],
    ],
  },
];

/** The website pages beside the app (SPEC "Website"), opened in a new tab so the board stays open. */
const SITE_LINKS = [
  ['About BusyAnts', 'about'],
  ['FAQ', 'faq'],
  ['Terms of use', 'terms'],
  ['Privacy policy', 'privacy'],
];

/** The keyboard shortcuts panel: opened by the ? button (bottom right) or the ? key; Escape closes it. */
export function ShortcutsPanel() {
  const open = useAppState((s) => s.ui.shortcutsOpen);
  const keys = useAppState((s) => s.view.hotkeys);
  // Which key is waiting for a new one, and the short note under the heading (why a key was refused).
  const [recording, setRecording] = useState<HotkeyAction | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) {
      setRecording(null);
      setNote('');
    }
  }, [open]);
  // While recording, the next key press goes here and nowhere else (so it can't also act on the board).
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.repeat) return;
      if (e.key === 'Escape') {
        setRecording(null);
        return setNote('');
      }
      const got = hotkeyFromEvent(e);
      if (!got) return; // only Ctrl, Shift or ⌘ so far: keep waiting
      setNote('error' in got ? got.error : appStore.setHotkey(recording, got) ?? '');
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording]);
  const record = (action: HotkeyAction) => {
    const now = recording === action ? null : action;
    setRecording(now);
    setNote(now ? `Press the new key for ${HOTKEY_NAMES[action]}, or Escape to cancel.` : '');
  };
  const reset = () => {
    appStore.resetHotkeys();
    setRecording(null);
    setNote('');
  };
  if (!open) return null;
  return (
    <div className="shortcuts-backdrop" onPointerDown={(e) => e.target === e.currentTarget && appStore.closeShortcuts()}>
      <section className="shortcuts-panel" role="dialog" aria-label="Keyboard shortcuts">
        <header className="shortcuts-header">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="tb-button quiet" onClick={reset}>
            Reset to defaults
          </button>
          <button type="button" className="icon-button" aria-label="Close" title="Close (Escape)" onClick={appStore.closeShortcuts}>
            <CloseIcon />
          </button>
        </header>
        <p className="shortcuts-hint">Click a key to change it. Undo, redo, zoom, the arrows and the checklist keys stay as they are.</p>
        <p className="shortcuts-note" role="status">
          {note}
        </p>
        {GROUPS.map((g) => (
          <div key={g.title} className="shortcuts-group">
            <h3>{g.title}</h3>
            <dl>
              {g.keys.map((row) => {
                const [fixed, what] = Array.isArray(row) ? row : [null, row.what];
                const action = Array.isArray(row) ? null : row.action;
                return (
                  <div key={action ?? fixed} className="shortcut">
                    <dt>
                      {action ? (
                        <button type="button" className="key-button" aria-label={`${HOTKEY_NAMES[action]}: ${labelOf(keys[action])}`} aria-pressed={recording === action} onClick={() => record(action)}>
                          <kbd>{recording === action ? 'Press a key…' : labelOf(keys[action])}</kbd>
                        </button>
                      ) : (
                        <kbd>{fixed}</kbd>
                      )}
                    </dt>
                    <dd>{what}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
        <nav className="shortcuts-site" aria-label="About BusyAnts">
          {SITE_LINKS.map(([name, page]) => (
            <a key={page} href={`${import.meta.env.BASE_URL}${page}/`} target="_blank" rel="noopener noreferrer">
              {name}
            </a>
          ))}
        </nav>
      </section>
    </div>
  );
}
