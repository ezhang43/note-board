import { boxProps } from './textBox';
import { shownCardIds } from '../model/board';
import { memo, useRef, type CSSProperties } from 'react';
import { swatchFor } from '../model/theme';
import { isBold } from '../model/palette';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { useTakeFocus } from './useTakeFocus';
import { CardView } from './CardView';
import { COLUMN_MIN_H } from '../model/constants';
import { ChevronIcon, ResizeIcon, TrashIcon } from './icons';
import { blockHoldPointerDown, blockPointerDown, useDragPosition } from './useBlockDrag';
import { ResizeGrips } from './ResizeGrips';
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
    s.ui.confirm?.columnId === id
      ? s.ui.confirm.ids.reduce((n, x) => n + shownCardIds(s.board, x).length, 0)
      : 0,
  );
  // An older board can keep its Completed record in a column: it isn't drawn or counted there.
  const hidden = useAppState((s) => s.board.columns[id]?.cardIds.find((c) => s.board.cards[c]?.kind === 'completed') ?? null);
  // Where to draw it while something is being dragged (pushed aside, or moving with a group).
  const dragPos = useDragPosition(id, col ?? { x: 0, y: 0 });
  const inGroupDrag = useAppState((s) => !!s.ui.drag?.group.includes(id));
  const resize = useAppState((s) => (s.ui.resize?.id === id ? s.ui.resize : null));
  const sizeMatch = useAppState((s) => !!s.ui.resize?.matchIds.includes(id));
  const ref = useRef<HTMLElement>(null);
  const title = useRef<HTMLInputElement>(null);
  useTakeFocus(id, title, true);
  useMeasuredHeight(id, ref);
  // Search: the current match is out of sight inside this collapsed column, so the column is marked.
  const findTarget = useAppState((s) => s.ui.find?.current?.showInstead === id);
  // Every hook is above this: while a block is dragged a version can show without it, and it must still draw nothing.
  if (!col) return null;

  const colors = swatchFor(col.color, theme);
  const pos = drag ?? dragPos;
  const w = resize?.liveW ?? col.w;
  // A card being dragged out is drawn on its own until it is dropped.
  const cardIds = col.cardIds.filter((c) => c !== draggedCard && c !== hidden);
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
    isBold(col.color) && 'bold',
    findTarget && 'find-target',
  ];

  return (
    <section
      ref={ref}
      data-col-id={id}
      aria-label={col.title ? `Container: ${col.title}` : 'Untitled container'}
      className={classes.filter(Boolean).join(' ')}
      style={{ left: resize?.liveX ?? pos.x, top: resize?.liveY ?? pos.y, width: w, minHeight: minH, '--bg': colors.bg, '--edge': colors.edge, '--col-text': colors.text } as CSSProperties}
      onPointerDown={blockPointerDown('column', id)}
      onPointerDownCapture={blockHoldPointerDown('column', id)}
    >
      {/* The left edge and the other corners set the width too (owner request 2026-10-21); the corners of an empty one also set its minimum height. First, so the buttons paint above them. */}
      <ResizeGrips kind="column" id={id} dirs={col.collapsed ? ['w'] : ['w', 'nw', 'ne', 'sw']} heightFree={!cardIds.length} />
      {/* Title and count on the left; collapse arrow and trash can on the right. */}
      <div className="column-header">
        <div className="column-heading">
          <AutoSizeInput
            ref={title}
            className="column-title"
            aria-label="Container title"
            {...boxProps({ columnId: id }, col.style)}
            find={`column:${id}`}
            placeholder="Container title"
            value={col.title}
            onChange={(title) => appStore.setColumnTitle(id, title)}
          />
          <span className="column-count" role="img" aria-label={cardIds.length === 1 ? '1 card' : `${cardIds.length} cards`}>
            {cardIds.length}
          </span>
        </div>
        <div className="column-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={col.collapsed ? 'Expand container' : 'Collapse container'}
            title={col.collapsed ? 'Expand container' : 'Collapse container'}
            aria-expanded={!col.collapsed}
            onClick={() => appStore.toggleCollapsed(id)}
          >
            <ChevronIcon collapsed={col.collapsed} />
          </button>
          <button
            type="button"
            className="icon-button block-trash"
            aria-label="Delete container and its cards"
            title="Delete container and its cards"
            onClick={() => appStore.askDeleteColumn(id)}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {confirmColumns > 0 && (
        <div className="confirm" role="alertdialog" aria-label="Delete container?">
          <div className="confirm-title">
            {confirmQuestion(confirmColumns, col.title, confirmCards)}
          </div>
          <div className="confirm-actions">
            <button type="button" className="confirm-cancel" autoFocus onClick={appStore.cancelDelete}>
              {confirmColumns === 1 ? 'Keep container' : 'Keep containers'}
            </button>
            <button type="button" className="confirm-delete" onClick={appStore.confirmDelete}>
              {confirmColumns === 1 ? 'Delete container' : 'Delete containers'}
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
      <button type="button" className="resize-edge" aria-label="Resize container width" onPointerDown={resizePointerDown('column', id, 'e')} onKeyDown={resizeKeyDown('column', id, 'e')} />
      {!col.collapsed && (
        <>
          <button
            type="button"
            className="resize-corner"
            aria-label="Resize container"
            onPointerDown={resizePointerDown('column', id, cardIds.length ? 'e' : 'se')}
            onKeyDown={resizeKeyDown('column', id, cardIds.length ? 'e' : 'se')}
          >
            <ResizeIcon />
          </button>
        </>
      )}
    </section>
  );
});

/** "Delete “Week” and its 2 cards?", or for several containers "Delete 3 containers and their 5 cards?". */
function confirmQuestion(columns: number, title: string, cards: number): string {
  const what = columns === 1 ? `“${title || 'Untitled'}”` : `${columns} containers`;
  if (!cards) return `Delete ${what}?`;
  const their = columns === 1 ? 'its' : 'their';
  return `Delete ${what} and ${their} ${cards === 1 ? 'card' : `${cards} cards`}?`;
}
