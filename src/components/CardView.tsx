import { BoardReadOnly, boxProps } from './textBox';
import { memo, use, useRef, useState, type CSSProperties } from 'react';
import { shownName } from '../model/board';
import { collapsedPreview, domainOf, hrefOf, isPermanent } from '../model/cards';
import { hasTicked } from '../model/checklist';
import { CARD_W, COLLAPSED_MIN_H } from '../model/constants';
import { mediaOf, type Media } from '../model/media';
import { isBold } from '../model/palette';
import { swatchFor } from '../model/theme';
import type { BoardCard, Card, LinkCard, NoteCard } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { CommentChip } from './Comments';
import { GrowTextarea } from './GrowTextarea';
import { NoteLinks, openLinkOnCtrlClick } from './TextLinks';
import { useTakeFocus } from './useTakeFocus';
import { ChevronIcon, ExternalIcon, ResizeIcon, TrashIcon } from './icons';
import { TodoBody, TodoTitle } from './TodoList';
import { blockHoldPointerDown, blockPointerDown, useDragPosition } from './useBlockDrag';
import { ResizeGrips } from './ResizeGrips';
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
  // Search: the current match is out of sight inside this card, so the card is marked.
  const findTarget = useAppState((s) => s.ui.find?.current?.showInstead === id);
  const ref = useRef<HTMLElement>(null);
  useMeasuredHeight(id, ref);
  // Every hook is above this: while a block is dragged a version can show without it, and it must still draw nothing.
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
    ...(inColumn ? {} : { left: resize?.liveX ?? pos.x, top: resize?.liveY ?? pos.y, width: w, minHeight: (card.collapsed ? (resize?.liveH ?? card.collapsedH) : h) ?? undefined }),
  } as CSSProperties;
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
      {/* Every other edge and corner resizes too, with the mouse or a finger (owner request 2026-10-21). First, so the buttons and tick boxes (and their touch areas) paint above them. */}
      {!inColumn && (
        <ResizeGrips
          kind="card"
          id={id}
          dirs={card.collapsed ? ['n', 's', 'w', 'nw', 'ne', 'sw'] : ['n', 's', 'e', 'w', 'nw', 'ne', 'sw']}
          minH={card.collapsed ? COLLAPSED_MIN_H : undefined}
        />
      )}
      {/* A (not collapsed) list's title row counts as part of the list when items or a whole list are dropped on it (data-todo-of), as its title did when it sat in the body. */}
      <div className="card-header" data-todo-of={card.kind === 'todo' && !card.collapsed ? id : undefined}>
        <span className="card-meta">{card.collapsed ? (card.kind === 'board' ? <BoardCardName boardId={card.boardId} /> : collapsedPreview(card)) : ''}</span>
        <CommentChip id={id} />
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
        {/* Last in the page order, so Tab still goes buttons, title, items as before; drawn first (see .card-header > .card-title). */}
        {!card.collapsed && <CardTitle card={card} boardName={boardName} />}
      </div>
      {!card.collapsed && <CardBody card={card} />}
      {/* A collapsed card can still be resized: wider or narrower from its right edge, or taller from its corner. */}
      {!inColumn && card.collapsed && (
        <>
          <button type="button" className="resize-edge" aria-label="Resize card width" onPointerDown={resizePointerDown('card', id, 'e')} onKeyDown={resizeKeyDown('card', id, 'e')} />
          <button type="button" className="resize-corner" aria-label="Resize card" onPointerDown={resizePointerDown('card', id, 'se', COLLAPSED_MIN_H)} onKeyDown={resizeKeyDown('card', id, 'se', COLLAPSED_MIN_H)}>
            <ResizeIcon />
          </button>
        </>
      )}
      {!inColumn && !card.collapsed && (
        <button type="button" className="resize-corner" aria-label="Resize card" onPointerDown={resizePointerDown('card', id, 'se')} onKeyDown={resizeKeyDown('card', id, 'se')}>
          <ResizeIcon />
        </button>
      )}
    </article>
  );
});

/** A list's, link's or board's title, on the card's button row (a note has none; a collapsed card shows its preview there instead). */
function CardTitle({ card, boardName }: { card: Card; boardName: string }) {
  switch (card.kind) {
    case 'todo':
      // The cell lets Clean up share the title's line when there is room and drop to a line of its own, under the title, when there is not (owner request 2026-10-24, job 208); the arrow and trash can stay on the title's line either way.
      return (
        <div className="title-cell">
          <TodoTitle card={card} />
          {/* While something in the list is ticked (job 200): moves the ticked items into the Completed panel. */}
          {hasTicked(card.items) && (
            <button type="button" className="list-clean-up" title="Move this list's ticked items into the Completed panel, under today's date" onClick={() => appStore.cleanUpList(card.id)}>
              Clean up
            </button>
          )}
        </div>
      );
    case 'link':
      return <LinkTitle card={card} />;
    case 'board':
      return <span className="card-title board-title">{shownName(boardName)}</span>;
    default:
      return null;
  }
}

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
    return b ? Object.values(b.cards).filter((c) => c.kind !== 'completed').length : -1; // the Completed record isn't drawn
  });
  const open = () => count >= 0 && appStore.openBoard(card.boardId);
  return (
    <div className="board-body" onDoubleClick={open}>
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

/**
 * A picture, video or embedded player for a link card whose address is one (decided from the address
 * each time it is drawn; nothing extra is saved, nothing uploaded). Media that fails to load is dropped,
 * leaving the ordinary link card. A player swallows the pointer, so until its card is selected a clear
 * cover lets a click select (or drag) the card instead of starting playback.
 */
function LinkMedia({ card }: { card: LinkCard }) {
  const media = mediaOf(card.url);
  // simple: a failed picture or video stays hidden until the card is drawn afresh (no retry); add a retry if offline starts to matter.
  const [failed, setFailed] = useState<string | null>(null);
  const selected = useAppState((s) => s.ui.selection.includes(card.id));
  if (!media || failed === media.src) return null;
  const fail = () => setFailed(media.src);
  const alt = card.title || `Image from ${domainOf(card.url) ?? 'the web'}`;
  return (
    <div className={`link-media ${media.kind}`}>
      <MediaElement media={media} alt={alt} onFail={fail} />
      {media.kind !== 'image' && !selected && <div className="media-cover" />}
    </div>
  );
}

function MediaElement({ media, alt, onFail }: { media: Media; alt: string; onFail: () => void }) {
  if (media.kind === 'image') return <img src={media.src} alt={alt} loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={onFail} />;
  if (media.kind === 'video') return <video src={media.src} controls preload="metadata" onError={onFail} />;
  return (
    <iframe
      src={media.src}
      title={alt}
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      allow="fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

/** A link card's title, on the card's button row. */
function LinkTitle({ card }: { card: LinkCard }) {
  const title = useRef<HTMLInputElement>(null);
  useTakeFocus(card.id, title);
  return (
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
  );
}

function LinkBody({ card }: { card: LinkCard }) {
  const href = hrefOf(card.url);
  // The address box is a plain field: a search match there rings the whole box.
  const findCurrent = useAppState((s) => s.ui.find?.current?.key === `url:${card.id}`);
  const readOnly = use(BoardReadOnly);
  return (
    <div className="link-body">
      <LinkMedia card={card} />
      <input
        className={findCurrent ? 'link-url find-current' : 'link-url'}
        data-find={`url:${card.id}`}
        aria-label="Link address"
        placeholder="Paste a link address"
        spellCheck={false}
        readOnly={readOnly}
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
