import { useRef, type CSSProperties } from 'react';
import { COLUMN_DEFAULT, PALETTE } from '../model/palette';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { CardView } from './CardView';
import { ChevronIcon, CloseIcon } from './icons';
import { blockPointerDown } from './useBlockDrag';
import { useMeasuredHeight } from './useMeasure';

/** A column: a titled stack of cards. */
export function ColumnView({ id }: { id: string }) {
  const col = useAppState((s) => s.board.columns[id]);
  const selected = useAppState((s) => s.ui.selection.includes(id));
  const drag = useAppState((s) => (s.ui.drag?.id === id ? s.ui.drag : null));
  const dropTarget = useAppState((s) => s.ui.drag?.kind === 'card' && s.ui.drag.overColumn === id);
  const draggedCard = useAppState((s) => (s.ui.drag?.kind === 'card' ? s.ui.drag.id : null));
  const confirming = useAppState((s) => s.ui.confirmDelete === id);
  const ref = useRef<HTMLElement>(null);
  useMeasuredHeight(id, ref);
  if (!col) return null;

  const colors = col.color ? PALETTE[col.color] : COLUMN_DEFAULT;
  const pos = drag ?? col;
  // A card being dragged out is drawn on its own until it is dropped.
  const cardIds = col.cardIds.filter((c) => c !== draggedCard);
  const classes = ['column', selected && 'selected', drag && 'dragging', dropTarget && 'drop-target', col.collapsed && 'collapsed'];

  return (
    <section
      ref={ref}
      data-col-id={id}
      aria-label={`Column ${col.title}`}
      className={classes.filter(Boolean).join(' ')}
      style={{ left: pos.x, top: pos.y, width: col.w, '--bg': colors.bg, '--edge': colors.edge } as CSSProperties}
      onPointerDown={blockPointerDown('column', id)}
    >
      <div className="column-header">
        <button
          type="button"
          className="icon-button"
          aria-label={col.collapsed ? 'Expand column' : 'Collapse column'}
          aria-expanded={!col.collapsed}
          onClick={() => appStore.toggleCollapsed(id)}
        >
          <ChevronIcon collapsed={col.collapsed} />
        </button>
        <AutoSizeInput
          className="column-title"
          aria-label="Column title"
          placeholder="Untitled"
          value={col.title}
          onChange={(title) => appStore.setColumnTitle(id, title)}
        />
        <span className="column-count" aria-label={`${cardIds.length} cards`}>
          {cardIds.length}
        </span>
        <div className="toolbar-spacer" />
        <button type="button" className="icon-button" aria-label="Delete column and its cards" onClick={() => appStore.askDeleteColumn(id)}>
          <CloseIcon />
        </button>
      </div>

      {confirming && (
        <div className="confirm" role="alertdialog" aria-label="Delete column?">
          <div className="confirm-title">Delete “{col.title || 'Untitled'}”?</div>
          <div className="confirm-actions">
            <button type="button" className="confirm-cancel" autoFocus onClick={appStore.cancelDeleteColumn}>
              Cancel
            </button>
            <button type="button" className="confirm-delete" onClick={appStore.confirmDeleteColumn}>
              Delete column
            </button>
          </div>
        </div>
      )}

      {!col.collapsed &&
        (cardIds.length ? (
          cardIds.map((cid) => <CardView key={cid} id={cid} inColumn />)
        ) : (
          <div className="column-empty">Drop cards here</div>
        ))}
    </section>
  );
}
