import { useEffect, useRef, type CSSProperties } from 'react';
import { collapsedPreview, domainOf, hrefOf, progressText } from '../model/cards';
import { PALETTE } from '../model/palette';
import type { Card, LinkCard, NoteCard, TodoCard, TodoItem } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { GrowTextarea } from './GrowTextarea';
import { ChevronIcon, CloseIcon, ExternalIcon } from './icons';
import { blockPointerDown } from './useBlockDrag';
import { useMeasuredHeight } from './useMeasure';

const KIND_LABEL = { note: 'Note', todo: 'To-do list', link: 'Link' } as const;

/** A note, to-do list or link card, either loose on the board or inside a column. */
export function CardView({ id, inColumn }: { id: string; inColumn: boolean }) {
  const card = useAppState((s) => s.board.cards[id]);
  const selected = useAppState((s) => s.ui.selection.includes(id));
  const drag = useAppState((s) => (s.ui.drag?.id === id ? s.ui.drag : null));
  const ref = useRef<HTMLElement>(null);
  useMeasuredHeight(id, ref);
  if (!card) return null;

  const colors = PALETTE[card.color];
  const pos = drag ?? card;
  const style = {
    '--bg': colors.bg,
    '--edge': colors.edge,
    ...(inColumn ? {} : { left: pos.x, top: pos.y }),
  } as CSSProperties;
  const classes = ['card', inColumn ? 'in-column' : 'loose', selected && 'selected', drag && 'dragging', card.collapsed && 'collapsed'];

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

function flatten(items: TodoItem[], depth = 0): { item: TodoItem; depth: number }[] {
  return items.flatMap((item) => [{ item, depth }, ...flatten(item.children, depth + 1)]);
}

// Only the basics here; Enter / Tab / Completed section / dragging items come in step 5.
function TodoBody({ card }: { card: TodoCard }) {
  return (
    <div className="todo-body">
      <AutoSizeInput
        className="card-title"
        aria-label="List title"
        placeholder="List"
        value={card.title}
        onChange={(title) => appStore.setCardTitle(card.id, title)}
      />
      <div className="todo-items">
        {flatten(card.items).map(({ item, depth }) => (
          <TodoItemRow key={item.id} cardId={card.id} item={item} depth={depth} />
        ))}
      </div>
    </div>
  );
}

function TodoItemRow({ cardId, item, depth }: { cardId: string; item: TodoItem; depth: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (appStore.takeFocusRequest(item.id)) ref.current?.focus();
  }, [item.id]);

  return (
    <div className={`todo-item${item.done ? ' done' : ''}`} data-item-id={item.id} style={{ paddingLeft: depth * 22 }}>
      <input type="checkbox" aria-label="Done" checked={item.done} onChange={() => appStore.toggleItemDone(cardId, item.id)} />
      <GrowTextarea
        ref={ref}
        className="item-text"
        aria-label="Item text"
        placeholder="Item"
        value={item.text}
        onChange={(text) => appStore.setItemText(cardId, item.id, text)}
      />
    </div>
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
