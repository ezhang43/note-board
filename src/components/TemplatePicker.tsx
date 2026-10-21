import { useMemo, type CSSProperties } from 'react';
import { EXAMPLE, PREVIEW_ASPECT, TEMPLATES, templateBoard, templatePreview, type Template } from '../model/templates';
import { swatchFor } from '../model/theme';
import { appStore, useAppState } from '../store/appStore';
import { BoardsIcon } from './icons';
import { usePhone } from './usePhone';
import { toast } from './useShortcuts';

// Starting from a template or the example (owner request, job #162, 2026-10-22). Tiles for the six
// templates and a strip for the example, used twice: in the middle of an empty board, and in the
// "Start a board" dialog opened by "New from a template…" in the Boards menu.

/** Makes the board, says so, and brings a filled board into view. `after` runs once it is made (the dialog closes). */
function start(t: Template, example: boolean, after?: () => void) {
  const how = appStore.startFromTemplate(t.id, example);
  if (!how) return;
  // A board filled in place is fitted to the screen once drawn (a new board is, by opening).
  // (not if it was undone or another board opened in the meantime)
  const filled = appStore.getState().board.order;
  if (how === 'filled') requestAnimationFrame(() => requestAnimationFrame(() => appStore.getState().board.order === filled && appStore.showWholeBoard()));
  toast(example ? `Opened “${t.name}”` : `Started “${t.name}”`);
  after?.();
}

/** The small drawing of a template's containers and cards. */
function Preview({ t }: { t: Template }) {
  const theme = useAppState((s) => s.view.theme);
  const preview = useMemo(() => templatePreview(templateBoard(t)), [t]);
  const pct = (n: number) => `${n}%`;
  return (
    <span className="tpl-thumb" aria-hidden="true" style={{ aspectRatio: PREVIEW_ASPECT }}>
      {preview.columns.map((c, i) => {
        const colors = swatchFor(c.color, theme);
        const style: CSSProperties = { left: pct(c.left), top: pct(c.top), width: pct(c.width), height: pct(c.height), background: colors.bg, borderColor: colors.edge };
        return (
          <i key={i} style={style}>
            {c.cards.map((k, j) => (
              <b key={j} style={{ top: pct(k.top), height: pct(k.height) }} />
            ))}
          </i>
        );
      })}
    </span>
  );
}

export function TemplateGrid({ after }: { after?: () => void }) {
  return (
    <div className="tpl-grid">
      {TEMPLATES.map((t) => (
        <button key={t.id} type="button" className="tpl-tile" onClick={() => start(t, false, after)}>
          <Preview t={t} />
          <span className="tpl-name">{t.name}</span>
          <span className="tpl-blurb">{t.blurb}</span>
        </button>
      ))}
    </div>
  );
}

/** "Weekend in Lisbon": always opens as a board of its own. */
export function ExampleStrip({ after }: { after?: () => void }) {
  return (
    <button type="button" className="tpl-example" onClick={() => start(EXAMPLE, true, after)}>
      <Preview t={EXAMPLE} />
      <span className="tpl-example-text">
        <span className="tpl-name">
          {EXAMPLE.name}
          <span className="tpl-badge">Example</span>
        </span>
        <span className="tpl-blurb">{EXAMPLE.blurb}</span>
      </span>
      <span className="tpl-go">Open</span>
    </button>
  );
}

/** Shown in the middle of an empty board, in place of the one-line hint. */
export function EmptyStart() {
  const phone = usePhone();
  return (
    // The board behind takes presses (pan, select); the picks stop them. A scroll over a picker taller than
    // the window scrolls it (not the board); otherwise it pans the board as everywhere else.
    <div className="empty-start" onWheel={(e) => !(e.ctrlKey || e.metaKey) && e.currentTarget.scrollHeight > e.currentTarget.clientHeight && e.stopPropagation()}>
      <div className="empty-start-inner" onPointerDown={(e) => e.stopPropagation()}>
        <BoardsIcon />
        <h2>Start from a template</h2>
        <p>Pick one, then change anything you like.</p>
        <TemplateGrid />
        <ExampleStrip />
        <p className="tpl-hint">
          {phone
            ? 'Or tap the Add button (+) below to add a note, a checklist or a container.'
            : 'Or add a note, a checklist or a container from the toolbar, or drag one onto the board. Press ? for keyboard shortcuts.'}
        </p>
      </div>
    </div>
  );
}
