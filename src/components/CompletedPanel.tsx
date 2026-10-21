import type { CSSProperties } from 'react';
import { completedCardOf, dayLabel } from '../model/completed';
import { styleCss } from '../model/textStyle';
import type { CompletedEntry, TodoItem } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { FindMarks } from './FindMarks';
import { CompletedIcon } from './icons';

/**
 * Opens the Completed panel (Job #51): a round button by the zoom control, or a line in the ⋯ sheet
 * on a phone (`labelled`). While a search match is in the shut panel, the button is ringed.
 */
export function CompletedButton({ labelled = false, onOpen }: { labelled?: boolean; onOpen?: () => void }) {
  const open = useAppState((s) => s.ui.sidePanel === 'completed');
  const findTarget = useAppState((s) => {
    const at = s.ui.find?.current?.showInstead;
    return !!at && s.ui.sidePanel !== 'completed' && s.board.cards[at]?.kind === 'completed';
  });
  return (
    <button
      type="button"
      className={[labelled ? 'tb-button' : 'help-button dock-tool', findTarget && 'find-target'].filter(Boolean).join(' ')}
      aria-label="Completed"
      title="Completed items"
      aria-pressed={open}
      onClick={() => {
        appStore.toggleSidePanel('completed');
        onOpen?.();
      }}
    >
      <CompletedIcon />
      Completed
    </button>
  );
}

/** The Completed panel: items moved here by Clean up, grouped by day, newest first. Unticking one sends it back. */
export function CompletedPanel() {
  const card = useAppState((s) => completedCardOf(s.board));
  return (
    <div className="completed-panel">
      {!card?.groups.length ? (
        <p className="completed-empty">Nothing cleaned up yet</p>
      ) : (
        card.groups.map((g) => (
          <section key={g.date} className="completed-day" aria-label={dayLabel(g.date)}>
            <h3 className="completed-date">{dayLabel(g.date)}</h3>
            {g.entries.map((e) => (
              <CompletedRow key={e.item.id} entry={e} cardId={card.id} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

/** One cleaned-up item: untick it to send it back to its list. Its sub-items are shown as they were. */
function CompletedRow({ entry, cardId }: { entry: CompletedEntry; cardId: string }) {
  return (
    <div className="completed-entry" data-entry-id={entry.item.id}>
      <div className="completed-row">
        <label className="tick">
          <input
            type="checkbox"
            aria-label={`Send "${entry.item.text}" back to ${entry.fromTitle || 'its list'}`}
            title="Untick to send it back to its list"
            checked
            onChange={() => appStore.restoreCompleted(entry.item.id)}
          />
        </label>
        <span className="completed-text" data-find={`done:${cardId}:${entry.item.id}`} style={styleCss(entry.item.style) as CSSProperties}>
          <FindMarks find={`done:${cardId}:${entry.item.id}`} text={entry.item.text} />
        </span>
        <span className="completed-from">{entry.fromTitle || 'List'}</span>
      </div>
      <CompletedChildren items={entry.item.children} depth={1} cardId={cardId} />
    </div>
  );
}

function CompletedChildren({ items, depth, cardId }: { items: TodoItem[]; depth: number; cardId: string }) {
  return items.map((it) => (
    <div key={it.id}>
      <div className={`completed-row sub${it.done ? ' done' : ''}`} style={{ paddingLeft: depth * 22 }}>
        <input type="checkbox" aria-label={it.text.trim() ? `Done: ${it.text.trim()}` : 'Done'} checked={it.done} disabled />
        <span className="completed-text" data-find={`done:${cardId}:${it.id}`} style={styleCss(it.style) as CSSProperties}>
          <FindMarks find={`done:${cardId}:${it.id}`} text={it.text} />
        </span>
      </div>
      <CompletedChildren items={it.children} depth={depth + 1} cardId={cardId} />
    </div>
  ));
}
