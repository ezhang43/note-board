import { appStore, useAppState } from '../store/appStore';
import { CloseIcon } from './icons';

/** Every keyboard shortcut, grouped. ⌘ works in place of Ctrl on a Mac. */
const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Board',
    keys: [
      ['Ctrl+Z / Ctrl+Y', 'Undo / redo (also while typing)'],
      ['H / V', 'Hand tool / Select tool'],
      ['Ctrl+= / Ctrl+− / Ctrl+0', 'Zoom in / out / back to 100%'],
      ['Ctrl+scroll or pinch', 'Zoom at the pointer'],
      ['?', 'Show or hide this list'],
    ],
  },
  {
    title: 'Cards and columns',
    keys: [
      ['Ctrl+A', 'Select every card and column (in a checklist: see below)'],
      ['Ctrl+C / Ctrl+V', 'Copy / paste the selection'],
      ['Ctrl+D', 'Duplicate the selection'],
      ['Delete / Backspace', 'Delete the selection'],
      ['Arrows (Shift: 5 steps)', 'Move the selection'],
      ['Alt+arrows', 'Jump to the nearest card that way'],
      ['Escape', 'Leave a text field (keeps the card selected), then clear the selection'],
    ],
  },
  {
    title: 'Checklists',
    keys: [
      ['Enter', 'Split at the cursor; at the start, add an item above'],
      ['Tab / Shift+Tab', 'Nest under the item above / move out a level'],
      ['Backspace in an empty item', 'Delete it'],
      ['Delete at the end', 'Join the next item into this one'],
      ['Up / Down', 'Move between items and cards'],
      ['Ctrl+Shift+Up / Down', 'Move the item up / down past its neighbour'],
      ['Shift+click, or press and drag', 'Select several items (drag on into the next cards of a column)'],
      ['Ctrl+A again and again', "Select the item text, the list, the column's lists, then the whole board"],
      ['Ctrl+C / Ctrl+X / Ctrl+V', 'Copy / cut / paste selected items'],
    ],
  },
];

/** The keyboard shortcuts panel: opened by the ? button (bottom right) or the ? key; Escape closes it. */
export function ShortcutsPanel() {
  const open = useAppState((s) => s.ui.shortcutsOpen);
  if (!open) return null;
  return (
    <div className="shortcuts-backdrop" onPointerDown={(e) => e.target === e.currentTarget && appStore.closeShortcuts()}>
      <section className="shortcuts-panel" role="dialog" aria-label="Keyboard shortcuts">
        <header className="shortcuts-header">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="icon-button" aria-label="Close" title="Close (Escape)" onClick={appStore.closeShortcuts}>
            <CloseIcon />
          </button>
        </header>
        {GROUPS.map((g) => (
          <div key={g.title} className="shortcuts-group">
            <h3>{g.title}</h3>
            <dl>
              {g.keys.map(([k, what]) => (
                <div key={k} className="shortcut">
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>
    </div>
  );
}
