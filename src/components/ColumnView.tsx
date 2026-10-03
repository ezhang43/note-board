import { memo, useRef, type CSSProperties } from 'react';
import { swatchFor } from '../model/theme';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { useTakeFocus } from './useTakeFocus';
import { CardView } from './CardView';
import { COLUMN_MIN_H } from '../model/constants';
import { ChevronIcon, CloseIcon, ResizeIcon } from './icons';
import { blockPointerDown, useDragPosition } from './useBlockDrag';
import { resizeKeyDown, resizePointerDown } from './useResize';
import { useMeasuredHeight } from './useMeasure';

/** A column: a titled stack of cards. */
export const ColumnView = memo(function ColumnView({ id }: { id: string }) {
  const col = useAppState((s) => s.board.columns[id]);
  const selected = useAppState((s) => s.ui.selection.includes(id));
  const theme = useAppState((s) => s.view.theme);
  const drag = useAppState((s) => (s.ui.drag?.id === id ? s.ui.drag : null));
  const dropTarget = useAppState(
    (s) => (s.ui.drag?.kind === 'card' && s.ui.drag.overColumn === id) || s.ui.newDrag?.overColumn === id,
  );
  const draggedCard = useAppState((s) => (s.ui.drag?.kind === 'card' ? s.ui.drag.id : null));
  // How many columns the "Delete …?" shown on this column would delete (0 = not shown here).
  const confirmColumns = useAppState((s) =>
    s.ui.confirm?.columnId === id ? s.ui.confirm.ids.filter((x) => s.board.columns[x]).length : 0,
  );
  // …and how many cards go with them.
  const confirmCards = useAppState((s) =>
    s.ui.confirm?.columnId === id ? s.ui.confirm.ids.reduce((n, x) => n + (s.board.columns[x]?.cardIds.length ?? 0), 0) : 0,
  );
  // Where to draw it while something is being dragged (pushed aside, or moving with a group).
  const dragPos = useDragPosition(id, col ?? { x: 0, y: 0 });
  const inGroupDrag = useAppState((s) => !!s.ui.drag?.group.includes(id));
  const resize = useAppState((s) => (s.ui.resize?.id === id ? s.ui.resize : null));
  const sizeMatch = useAppState((s) => !!s.ui.resize?.matchIds.includes(id));
  const ref = useRef<HTMLElement>(null);
  const title = useRef<HTMLInputElement>(null);
  useTakeFocus(id, title, true);
  useMeasuredHeight(id, ref);
  if (!col) return null;

  const colors = swatchFor(col.color, theme);
  const pos = drag ?? dragPos;
  const w = resize?.liveW ?? col.w;
  // A card being dragged out is drawn on its own until it is dropped.
  const cardIds = col.cardIds.filter((c) => c !== draggedCard);
  // A column with cards is exactly as tall as its cards (no blank space when they collapse);
  // only an empty column keeps a minimum height, which its corner handle sets.
  const minH = col.collapsed ? undefined : cardIds.length ? 0 : (resize?.liveH ?? col.h ?? COLUMN_MIN_H);
  const classes = [
    'column',
    selected && 'selected',
    drag && 'dragging',
    // While following the pointer, don't glide (it would lag behind).
    (inGroupDrag || resize) && 'following',
    sizeMatch && 'size-match',
    dropTarget && 'drop-target',
    col.collapsed && 'collapsed',
    col.color === null && 'uncoloured',
  ];

  return (
    <section
      ref={ref}
      data-col-id={id}
      aria-label={col.title ? `Column: ${col.title}` : 'Untitled column'}
      className={classes.filter(Boolean).join(' ')}
      style={{ left: pos.x, top: pos.y, width: w, minHeight: minH, '--bg': colors.bg, '--edge': colors.edge, '--col-edge': colors.edge } as CSSProperties}
      onPointerDown={blockPointerDown('column', id)}
    >
      {/* Title and count centred; collapse arrow and × on the right. */}
      <div className="column-header">
        <div aria-hidden="true" />
        <div className="column-heading">
          <AutoSizeInput
            ref={title}
            className="column-title"
            aria-label="Column title"
            placeholder="Column title"
            value={col.title}
            onChange={(title) => appStore.setColumnTitle(id, title)}
          />
          <span className="column-count" aria-label={`${cardIds.length} cards`}>
            {cardIds.length}
          </span>
        </div>
        <div className="column-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={col.collapsed ? 'Expand column' : 'Collapse column'}
            title={col.collapsed ? 'Expand column' : 'Collapse column'}
            aria-expanded={!col.collapsed}
            onClick={() => appStore.toggleCollapsed(id)}
          >
            <ChevronIcon collapsed={col.collapsed} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Delete column and its cards"
            title="Delete column and its cards"
            onClick={() => appStore.askDeleteColumn(id)}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {confirmColumns > 0 && (
        <div className="confirm" role="alertdialog" aria-label="Delete column?">
          <div className="confirm-title">
            {confirmQuestion(confirmColumns, col.title, confirmCards)}
          </div>
          <div className="confirm-actions">
            <button type="button" className="confirm-cancel" autoFocus onClick={appStore.cancelDelete}>
              {confirmColumns === 1 ? 'Keep column' : 'Keep columns'}
            </button>
            <button type="button" className="confirm-delete" onClick={appStore.confirmDelete}>
              {confirmColumns === 1 ? 'Delete column' : 'Delete columns'}
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

      {/* The width can be changed even when the column is collapsed. */}
      <button type="button" className="resize-edge" aria-label="Resize column width" onPointerDown={resizePointerDown('column', id, 'width')} onKeyDown={resizeKeyDown('column', id, 'width')} />
      {!col.collapsed && (
        <>
          <button
            type="button"
            className="resize-corner"
            aria-label="Resize column"
            onPointerDown={resizePointerDown('column', id, cardIds.length ? 'width' : 'both')}
            onKeyDown={resizeKeyDown('column', id, cardIds.length ? 'width' : 'both')}
          >
            <ResizeIcon />
          </button>
        </>
      )}
    </section>
  );
});

/** "Delete “Week” and its 2 cards?", or for several columns "Delete 3 columns and their 5 cards?". */
function confirmQuestion(columns: number, title: string, cards: number): string {
  const what = columns === 1 ? `“${title || 'Untitled'}”` : `${columns} columns`;
  if (!cards) return `Delete ${what}?`;
  const their = columns === 1 ? 'its' : 'their';
  return `Delete ${what} and ${their} ${cards === 1 ? 'card' : `${cards} cards`}?`;
}
