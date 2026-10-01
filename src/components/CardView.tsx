import { useRef, type CSSProperties } from 'react';
import { collapsedPreview, domainOf, hrefOf } from '../model/cards';
import { CARD_W } from '../model/constants';
import { dayLabel } from '../model/completed';
import type { Card, CompletedCard, CompletedEntry, LinkCard, NoteCard, TodoItem } from '../model/types';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { GrowTextarea } from './GrowTextarea';
import { ChevronIcon, CloseIcon, ExternalIcon, ResizeIcon } from './icons';
import { TodoBody } from './TodoList';
import { blockPointerDown, useDragPosition } from './useBlockDrag';
import { resizePointerDown } from './useResize';
import { useMeasuredHeight } from './useMeasure';

const KIND_LABEL = { note: 'Note', todo: 'To-do list', link: 'Link', completed: 'Completed' } as const;

/** A note, to-do list or link card, either loose on the board or inside a column. */
export function CardView({ id, inColumn }: { id: string; inColumn: boolean }) {
  const card = useAppState((s) => s.board.cards[id]);
  const selected = useAppState((s) => s.ui.selection.includes(id));
  const drag = useAppState((s) => (s.ui.drag?.id === id ? s.ui.drag : null));
  const resize = useAppState((s) => (s.ui.resize?.id === id ? s.ui.resize : null));
  const sizeMatch = useAppState((s) => !!s.ui.resize?.matchIds.includes(id));
  // Where to draw it while something is being dragged (pushed aside, or moving with a group).
  const dragPos = useDragPosition(id, card ?? { x: 0, y: 0 });
  const inGroupDrag = useAppState((s) => !!s.ui.drag?.group.includes(id));
  const ref = useRef<HTMLElement>(null);
  useMeasuredHeight(id, ref);
  if (!card) return null;

  const pos = drag ?? dragPos;
  // Inside a column a card follows the column's width and fits its content.
  const w = resize?.liveW ?? card.w ?? CARD_W;
  const h = resize?.liveH ?? card.h;
  const style = {
    ...(inColumn ? {} : { left: pos.x, top: pos.y, width: w, minHeight: card.collapsed ? undefined : (h ?? undefined) }),
  } as CSSProperties;
  const classes = [
    'card',
    inColumn ? 'in-column' : 'loose',
    selected && 'selected',
    drag && 'dragging',
    // While following the pointer, don't glide (it would lag behind).
    (inGroupDrag || resize) && 'following',
    sizeMatch && 'size-match',
    card.collapsed && 'collapsed',
    card.kind !== 'note' && 'titled',
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
        <span className="card-meta">{card.collapsed ? collapsedPreview(card) : ''}</span>
        <button
          type="button"
          className="icon-button"
          aria-label={card.collapsed ? 'Expand card' : 'Collapse card'}
          aria-expanded={!card.collapsed}
          onClick={() => appStore.toggleCollapsed(id)}
        >
          <ChevronIcon collapsed={card.collapsed} />
        </button>
        {/* The Completed card can never be deleted, so it has no ×. */}
        {card.kind !== 'completed' && (
          <button type="button" className="icon-button" aria-label="Delete card" onClick={() => appStore.deleteCard(id)}>
            <CloseIcon />
          </button>
        )}
      </div>
      {!card.collapsed && <CardBody card={card} />}
      {/* A collapsed card can still be made wider or narrower, from its right edge. */}
      {!inColumn && card.collapsed && (
        <button type="button" className="resize-edge" aria-label="Resize card width" onPointerDown={resizePointerDown('card', id, 'width')} />
      )}
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
    case 'completed':
      return <CompletedBody card={card} />;
  }
}

/** The master Completed card: items moved here by Clean up, grouped by day, newest first. */
function CompletedBody({ card }: { card: CompletedCard }) {
  return (
    <div className="completed-card-body">
      <div className="completed-card-title">Completed</div>
      {!card.groups.length && <div className="completed-empty">Nothing cleaned up yet</div>}
      {card.groups.map((g) => (
        <section key={g.date} className="completed-day" aria-label={dayLabel(g.date)}>
          <h3 className="completed-date">{dayLabel(g.date)}</h3>
          {g.entries.map((e) => (
            <CompletedRow key={e.item.id} entry={e} />
          ))}
        </section>
      ))}
    </div>
  );
}

/** One cleaned-up item: untick it to send it back to its list. Its sub-items are shown as they were. */
function CompletedRow({ entry }: { entry: CompletedEntry }) {
  return (
    <div className="completed-entry" data-entry-id={entry.item.id}>
      <div className="completed-row">
        <input
          type="checkbox"
          aria-label={`Send "${entry.item.text}" back to ${entry.fromTitle || 'its list'}`}
          title="Untick to send it back to its list"
          checked
          onChange={() => appStore.restoreCompleted(entry.item.id)}
        />
        <span className="completed-text">{entry.item.text}</span>
        <span className="completed-from">{entry.fromTitle || 'List'}</span>
      </div>
      <CompletedChildren items={entry.item.children} depth={1} />
    </div>
  );
}

function CompletedChildren({ items, depth }: { items: TodoItem[]; depth: number }) {
  return items.map((it) => (
    <div key={it.id}>
      <div className={`completed-row sub${it.done ? ' done' : ''}`} style={{ paddingLeft: depth * 22 }}>
        <input type="checkbox" aria-label="Done" checked={it.done} disabled />
        <span className="completed-text">{it.text}</span>
      </div>
      <CompletedChildren items={it.children} depth={depth + 1} />
    </div>
  ));
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
