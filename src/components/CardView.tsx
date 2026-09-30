import { useRef, type CSSProperties } from 'react';
import { collapsedPreview, domainOf, hrefOf, progressText } from '../model/cards';
import { CARD_W } from '../model/constants';
import { PALETTE } from '../model/palette';
import type { Card, LinkCard, NoteCard } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { GrowTextarea } from './GrowTextarea';
import { ChevronIcon, CloseIcon, ExternalIcon, ResizeIcon } from './icons';
import { TodoBody } from './TodoList';
import { blockPointerDown, useGroupOffset } from './useBlockDrag';
import { resizePointerDown } from './useResize';
import { useMeasuredHeight } from './useMeasure';

const KIND_LABEL = { note: 'Note', todo: 'To-do list', link: 'Link' } as const;

/** A note, to-do list or link card, either loose on the board or inside a column. */
export function CardView({ id, inColumn }: { id: string; inColumn: boolean }) {
  const card = useAppState((s) => s.board.cards[id]);
  const selected = useAppState((s) => s.ui.selection.includes(id));
  const drag = useAppState((s) => (s.ui.drag?.id === id ? s.ui.drag : null));
  const resize = useAppState((s) => (s.ui.resize?.id === id ? s.ui.resize : null));
  const sizeMatch = useAppState((s) => !!s.ui.resize?.matchIds.includes(id));
  const [groupDx, groupDy] = useGroupOffset(id);
  const ref = useRef<HTMLElement>(null);
  useMeasuredHeight(id, ref);
  if (!card) return null;

  const colors = PALETTE[card.color];
  const pos = drag ?? { x: card.x + groupDx, y: card.y + groupDy };
  // Inside a column a card follows the column's width and fits its content.
  const w = resize?.w ?? card.w ?? CARD_W;
  const h = resize?.h ?? card.h;
  const style = {
    '--bg': colors.bg,
    '--edge': colors.edge,
    ...(inColumn ? {} : { left: pos.x, top: pos.y, width: w, minHeight: card.collapsed ? undefined : (h ?? undefined) }),
  } as CSSProperties;
  const classes = [
    'card',
    inColumn ? 'in-column' : 'loose',
    selected && 'selected',
    drag && 'dragging',
    sizeMatch && 'size-match',
    card.collapsed && 'collapsed',
  ];

  return (
    <article
      ref={ref}
      data-card-id={id}
      data-kind={card.kind}
      aria-label={`${KIND_LABEL[card.kind]} card`}
      className={classes.filter(Boolean).join(' ')}
      style={style}
      onPointerDown={blockPointerDown('card', id)}
    >
      <div className="card-header">
        <span className="card-meta">{card.collapsed ? collapsedPreview(card) : progressText(card)}</span>
        <button
          type="button"
          className="icon-button"
          aria-label={card.collapsed ? 'Expand card' : 'Collapse card'}
          aria-expanded={!card.collapsed}
          onClick={() => appStore.toggleCollapsed(id)}
        >
          <ChevronIcon collapsed={card.collapsed} />
        </button>
        <button type="button" className="icon-button" aria-label="Delete card" onClick={() => appStore.deleteCard(id)}>
          <CloseIcon />
        </button>
      </div>
      {!card.collapsed && <CardBody card={card} />}
      {!inColumn && !card.collapsed && (
        <button type="button" className="resize-corner" aria-label="Resize card" onPointerDown={resizePointerDown('card', id, 'both')}>
          <ResizeIcon />
        </button>
      )}
    </article>
  );
}

function CardBody({ card }: { card: Card }) {
  switch (card.kind) {
    case 'note':
      return <NoteBody card={card} />;
    case 'todo':
      return <TodoBody card={card} />;
    case 'link':
      return <LinkBody card={card} />;
  }
}

function NoteBody({ card }: { card: NoteCard }) {
  return (
    <GrowTextarea
      className="note-text"
      aria-label="Note text"
      placeholder="Write something…"
      value={card.text}
      onChange={(text) => appStore.setNoteText(card.id, text)}
    />
  );
}

function LinkBody({ card }: { card: LinkCard }) {
  const href = hrefOf(card.url);
  return (
    <div className="link-body">
      <AutoSizeInput
        className="card-title"
        aria-label="Link title"
        placeholder="Title"
        value={card.title}
        onChange={(title) => appStore.setCardTitle(card.id, title)}
      />
      <input
        className="link-url"
        aria-label="Link address"
        placeholder="Paste a URL"
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
