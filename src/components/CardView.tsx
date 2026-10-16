import { boxProps } from './textBox';
import { memo, useRef, type CSSProperties } from 'react';
import { shownName } from '../model/board';
import { collapsedPreview, domainOf, hrefOf, isPermanent } from '../model/cards';
import { CARD_W, COLLAPSED_MIN_H } from '../model/constants';
import { isBold } from '../model/palette';
import { swatchFor } from '../model/theme';
import type { BoardCard, Card, LinkCard, NoteCard } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { GrowTextarea } from './GrowTextarea';
import { NoteLinks, openLinkOnCtrlClick } from './TextLinks';
import { useTakeFocus } from './useTakeFocus';
import { ChevronIcon, ExternalIcon, ResizeIcon, TrashIcon } from './icons';
import { TodoBody } from './TodoList';
import { blockHoldPointerDown, blockPointerDown, useDragPosition } from './useBlockDrag';
import { resizeKeyDown, resizePointerDown } from './useResize';
import { useMeasuredHeight } from './useMeasure';

const KIND_LABEL = { note: 'Note', todo: 'Checklist', link: 'Link', completed: 'Completed', board: 'Board' } as const;

/** What a screen reader calls a card: its kind, and its title where it has one. */
function cardName(card: Card, boardName: string): string {
  if (card.kind === 'todo' || card.kind === 'link') return `${KIND_LABEL[card.kind]}: ${card.title || 'Untitled'}`;
  if (card.kind === 'board') return `Board: ${shownName(boardName)}`;
  return KIND_LABEL[card.kind];
}

/** A note, to-do list or link card, either loose on the board or inside a column. */
export const CardView = memo(function CardView({ id, inColumn }: { id: string; inColumn: boolean }) {
  const card = useAppState((s) => s.board.cards[id]);
  // A board card is named after the board it opens.
  const boardName = useAppState((s) => (card?.kind === 'board' ? (s.boards.open === card.boardId ? s.board.name : (s.boards.others[card.boardId]?.name ?? '')) : ''));
  const selected = useAppState((s) => s.ui.selection.includes(id));
  const theme = useAppState((s) => s.view.theme);
  const drag = useAppState((s) => (s.ui.drag?.id === id ? s.ui.drag : null));
  const resize = useAppState((s) => (s.ui.resize?.id === id ? s.ui.resize : null));
  const sizeMatch = useAppState((s) => !!s.ui.resize?.matchIds.includes(id));
  // Where to draw it while something is being dragged (pushed aside, or moving with a group).
  const dragPos = useDragPosition(id, card ?? { x: 0, y: 0 });
  const inGroupDrag = useAppState((s) => !!s.ui.drag?.group.includes(id));
  // A list about to take dragged items at its end, or a whole dragged list: dashed outline.
  const takes = useAppState((s) => {
    const h = s.ui.itemDrag?.hint;
    return s.ui.drag?.intoList === id || (!!h && 'cardId' in h && h.cardId === id && h.drop.mode === 'append');
  });
  const ref = useRef<HTMLElement>(null);
  useMeasuredHeight(id, ref);
  // The Completed record shows in the Completed panel, never on the board.
  if (!card || card.kind === 'completed') return null;

  const pos = drag ?? dragPos;
  // Inside a column a card follows the column's width and fits its content.
  const w = resize?.liveW ?? card.w ?? CARD_W;
  const h = resize?.liveH ?? card.h;
  // A colour picked in the Color menu lightly tints the card's header; the text keeps its usual ink (owner decision 2026-10-16).
  const tint = card.titleColor ? swatchFor(card.titleColor, theme) : null;
  const style = {
    ...(tint ? { '--tint': `color-mix(in srgb, ${tint.bg} 60%, var(--card-bg))`, '--tint-text': tint.text } : {}),
    ...(inColumn ? {} : { left: pos.x, top: pos.y, width: w, minHeight: (card.collapsed ? (resize?.liveH ?? card.collapsedH) : h) ?? undefined }),
  } as CSSProperties;
  const findTarget = useAppState((s) => s.ui.find?.current?.showInstead === id);
  const classes = [
    'card',
    inColumn ? 'in-column' : 'loose',
    selected && 'selected',
    drag && 'dragging',
    // While following the pointer, don't glide (it would lag behind).
    (inGroupDrag || resize) && 'following',
    sizeMatch && 'size-match',
    takes && 'append-target',
    card.collapsed && 'collapsed',
    tint && 'tinted',
    isBold(card.titleColor) && 'bold-tint',
    // Search: the current match is out of sight inside this card, so the card is marked.
    findTarget && 'find-target',
  ];

  return (
    <article
      ref={ref}
      data-card-id={id}
      data-kind={card.kind}
      aria-label={cardName(card, boardName)}
      className={classes.filter(Boolean).join(' ')}
      style={style}
      onPointerDown={blockPointerDown('card', id)}
      onPointerDownCapture={blockHoldPointerDown('card', id)}
    >
      <div className="card-header">
        <span className="card-meta">{card.collapsed ? (card.kind === 'board' ? <BoardCardName boardId={card.boardId} /> : collapsedPreview(card)) : ''}</span>
        <button
          type="button"
          className="icon-button"
          aria-label={card.collapsed ? 'Expand card' : 'Collapse card'}
          title={card.collapsed ? 'Expand card' : 'Collapse card'}
          aria-expanded={!card.collapsed}
          onClick={() => appStore.toggleCollapsed(id)}
        >
          <ChevronIcon collapsed={card.collapsed} />
        </button>
        {/* Board cards: the Completed record (never drawn) is the only card with no trash can. */}
        {!isPermanent(card) && (
          <button
            type="button"
            className="icon-button block-trash"
            aria-label="Delete card"
            title="Delete card (Ctrl+Z brings it back)"
            onClick={() => appStore.deleteCard(id)}
          >
            <TrashIcon />
          </button>
        )}
      </div>
      {!card.collapsed && <CardBody card={card} />}
      {/* A collapsed card can still be resized: wider or narrower from its right edge, or taller from its corner. */}
      {!inColumn && card.collapsed && (
        <>
          <button type="button" className="resize-edge" aria-label="Resize card width" onPointerDown={resizePointerDown('card', id, 'width')} onKeyDown={resizeKeyDown('card', id, 'width')} />
          <button type="button" className="resize-corner" aria-label="Resize card" onPointerDown={resizePointerDown('card', id, 'both', COLLAPSED_MIN_H)} onKeyDown={resizeKeyDown('card', id, 'both', COLLAPSED_MIN_H)}>
            <ResizeIcon />
          </button>
        </>
      )}
      {!inColumn && !card.collapsed && (
        <button type="button" className="resize-corner" aria-label="Resize card" onPointerDown={resizePointerDown('card', id, 'both')} onKeyDown={resizeKeyDown('card', id, 'both')}>
          <ResizeIcon />
        </button>
      )}
    </article>
  );
});

function CardBody({ card }: { card: Card }) {
  switch (card.kind) {
    case 'note':
      return <NoteBody card={card} />;
    case 'todo':
      return <TodoBody card={card} />;
    case 'link':
      return <LinkBody card={card} />;
    case 'completed':
      return null; // never drawn (see above)
    case 'board':
      return <BoardBody card={card} />;
  }
}

/** The name of board `boardId`, kept up to date (on the board itself it is renamed). */
function BoardCardName({ boardId }: { boardId: string }) {
  const name = useAppState((s) => (s.boards.open === boardId ? s.board.name : (s.boards.others[boardId]?.name ?? '')));
  return <>{shownName(name)}</>;
}

/**
 * A board card (owner request: boards inside boards): the board's name, how many cards are on it,
 * and Open board. Double-clicking the card opens it too. A deleted board's card says so.
 */
function BoardBody({ card }: { card: BoardCard }) {
  const count = useAppState((s) => {
    const b = s.boards.open === card.boardId ? s.board : s.boards.others[card.boardId];
    return b ? Object.keys(b.cards).length : -1;
  });
  const open = () => count >= 0 && appStore.openBoard(card.boardId);
  return (
    <div className="board-body" onDoubleClick={open}>
      <span className="board-card-name">
        <BoardCardName boardId={card.boardId} />
      </span>
      <span className="board-card-count">{count < 0 ? 'This board was deleted' : `${count} card${count === 1 ? '' : 's'}`}</span>
      <button type="button" className="tb-button board-open" aria-disabled={count < 0 ? true : undefined} onClick={open}>
        Open board
      </button>
    </div>
  );
}

function NoteBody({ card }: { card: NoteCard }) {
  const text = useRef<HTMLTextAreaElement>(null);
  useTakeFocus(card.id, text);
  return (
    <>
      <GrowTextarea
        ref={text}
        className="note-text"
        aria-label="Note text"
        {...boxProps({ cardId: card.id }, card.style)}
        find={`note:${card.id}`}
        placeholder="Write something…"
        value={card.text}
        onChange={(text) => appStore.setNoteText(card.id, text)}
        onClick={openLinkOnCtrlClick}
      />
      <NoteLinks text={card.text} />
    </>
  );
}

function LinkBody({ card }: { card: LinkCard }) {
  const href = hrefOf(card.url);
  // The address box is a plain field: a search match there rings the whole box.
  const findCurrent = useAppState((s) => s.ui.find?.current?.key === `url:${card.id}`);
  const title = useRef<HTMLInputElement>(null);
  useTakeFocus(card.id, title);
  return (
    <div className="link-body">
      <AutoSizeInput
        ref={title}
        className="card-title"
        aria-label="Link title"
        {...boxProps({ cardId: card.id }, card.style)}
        find={`title:${card.id}`}
        placeholder="Title"
        value={card.title}
        onChange={(title) => appStore.setCardTitle(card.id, title)}
      />
      <input
        className={findCurrent ? 'link-url find-current' : 'link-url'}
        data-find={`url:${card.id}`}
        aria-label="Link address"
        placeholder="Paste a link address"
        spellCheck={false}
        value={card.url}
        onChange={(e) => appStore.setLinkUrl(card.id, e.target.value)}
      />
      <a
        className="link-open"
        href={href ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={href ? undefined : true}
      >
        <ExternalIcon />
        <span>Open {domainOf(card.url) ?? 'link'}</span>
      </a>
    </div>
  );
}
