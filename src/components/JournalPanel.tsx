import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { groupJournal, isGroupOpen, journalDateLine, journalEntries, journalPeek, openToday, parseJournalOpen, toggleGroup, type JournalOpen } from '../model/journal';
import { dayKey } from '../model/completed';
import { deepEqual } from '../model/merge';
import { HIGHLIGHTS, isList, journalRich, type Look, type Toggle } from '../model/richText';
import { FONTS } from '../model/textStyle';
import { appStore, useAppState } from '../store/appStore';
import { RichEditor, type RichEditorHandle } from './RichEditor';

/** Which year, month and week groups are open: kept on this device only, never in the board's data (owner request, 2026-10-19). */
const OPEN_KEY = 'note-board:journal-open';
const PLAIN: Look = { type: 'p', b: false, i: false, u: false, s: false };

/**
 * The Journal side panel (owner request, 2026-10-18): the dated notes on the Journal board, newest
 * day first, each one's text ready to edit. Today's note gets the cursor when the panel opens.
 * Typing goes through the store like typing on the board, so it is saved and undoable. The Journal
 * alone has rich text (owner request, 2026-10-19): the Formatting bar acts on the note last typed in.
 * The days are grouped Year > Month > Week; only the groups holding today start open.
 */
export function JournalPanel() {
  const board = useAppState((s) => {
    const id = s.ui.journalBoard;
    if (!id) return undefined;
    return id === s.boards.open ? s.board : s.boards.others[id];
  });
  const entries = useMemo(() => (board ? journalEntries(board, journalDateLine(new Date())) : []), [board]);
  const today = dayKey(new Date());
  const years = useMemo(() => groupJournal(entries, today), [entries, today]);
  // Opening the panel shows today, so a shut group holding today opens again.
  const [choices, setChoices] = useState<JournalOpen>(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(OPEN_KEY);
    } catch {
      // Blocked storage: the defaults are used.
    }
    return openToday(parseJournalOpen(saved), today);
  });
  const isOpen = (id: string) => isGroupOpen(choices, id, today);
  const toggle = (id: string) => setChoices((was) => toggleGroup(was, id, today));
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(choices));
    } catch {
      // Not saved: it still works until the page is closed.
    }
  }, [choices]);
  const head = (id: string, label: string, level: 'year' | 'month' | 'week') => (
    <button type="button" className={`jg-head jg-${level}`} aria-expanded={isOpen(id)} onClick={() => toggle(id)}>
      {label}
    </button>
  );
  // Days folded this visit (view state: not saved, not undoable, gone when the panel closes).
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<RichEditorHandle>(null);
  /** The entry being typed in, so the panel keeps the keyboard if undo takes that entry away. */
  const typing = useRef<HTMLElement | null>(null);
  /** The note the Formatting bar acts on, and how its selection looks. */
  const active = useRef<RichEditorHandle | null>(null);
  const handles = useRef(new Map<string, RichEditorHandle>());
  const [look, setLook] = useState<Look>(PLAIN);

  useEffect(() => {
    active.current = first.current;
    first.current?.focusEnd();
  }, []);

  useLayoutEffect(() => {
    if (typing.current && !typing.current.isConnected) {
      typing.current = null;
      root.current?.focus();
    }
    // A group was shut over the note the Formatting bar was acting on: the bar shows no look.
    if (active.current && !active.current.el?.isConnected) {
      active.current = null;
      setLook(PLAIN);
    }
  });

  const act = (fn: (h: RichEditorHandle) => void) => {
    const h = active.current?.el?.isConnected ? active.current : first.current;
    if (h) fn(h);
  };
  // Pressing a button must not take the cursor (or the highlighted words) away from the note.
  const keep = (e: React.SyntheticEvent) => e.preventDefault();
  /** A menu's value: "-" (shown as Mixed) when the selection has more than one, so any choice acts. */
  const menu = (key: 'size' | 'font' | 'hl') => (look.mixed?.includes(key) ? '-' : (look[key] ?? ''));
  const mixed = (
    <option value="-" disabled hidden>
      Mixed
    </option>
  );
  const markButton = (mark: Toggle, label: string, keys: string, glyph: string) => (
    <button type="button" className={`jt-${mark}`} aria-label={label} title={`${label} (${keys})`} aria-pressed={look[mark]} onClick={() => act((h) => h.toggle(mark))}>
      {glyph}
    </button>
  );
  const listButton = (type: 'bullet' | 'number', label: string, keys: string, glyph: string) => (
    <button type="button" aria-label={label} title={`${label} (${keys})`} aria-pressed={look.type === type} onClick={() => act((h) => h.list(type))}>
      {glyph}
    </button>
  );

  const entry = (e: (typeof entries)[number]) => {
    const card = board?.cards[e.id];
    const value = journalRich(card?.kind === 'note' ? card.text : '', card?.kind === 'note' ? card.rich : undefined);
    const shut = folded.has(e.id);
    const fold = (ev: React.MouseEvent<HTMLButtonElement>) => {
      // Folding the day holding the cursor takes the cursor to this header, not to the panel (see the layout effect above).
      if (!shut) typing.current = null;
      ev.currentTarget.focus();
      setFolded((was) => {
        const next = new Set(was);
        if (!next.delete(e.id)) next.add(e.id);
        return next;
      });
    };
    const peek = shut ? journalPeek(e.body) : '';
    return (
      <section key={e.id} className="journal-entry">
        <h3>
          <button type="button" className="jg-head jg-day" aria-expanded={!shut} onClick={fold}>
            {e.date}
            {peek && <span className="jg-peek">{peek}</span>}
          </button>
        </h3>
        {!shut && (
          <RichEditor
            ref={(h) => {
              if (e.id === entries[0]?.id) first.current = h;
              if (h) handles.current.set(e.id, h);
              else handles.current.delete(e.id);
            }}
            value={value}
            label={`Journal, ${e.date}`}
            onChange={(rich, typed) => appStore.setJournal(e.id, rich, typed)}
            onLook={(l) => {
              active.current = handles.current.get(e.id) ?? null;
              setLook((was) => (deepEqual(was, l) ? was : l));
            }}
            onFocus={(el) => {
              typing.current = el;
              active.current = handles.current.get(e.id) ?? null;
            }}
            onBlur={(el) => {
              // After a blur caused by the entry going away, `typing` still names it (see above).
              queueMicrotask(() => {
                if (el.isConnected && typing.current === el) typing.current = null;
              });
            }}
            // Escape leaves the text (a second Escape closes the panel), as on the board.
            onEscape={() => root.current?.focus()}
          />
        )}
      </section>
    );
  };

  return (
    <div className="journal-panel" tabIndex={-1} ref={root}>
      <div className="journal-tools" role="toolbar" aria-label="Formatting" onPointerDown={keep} onMouseDown={keep}>
        {markButton('b', 'Bold', 'Ctrl+B', 'B')}
        {markButton('i', 'Italic', 'Ctrl+I', 'I')}
        {markButton('u', 'Underline', 'Ctrl+U', 'U')}
        {markButton('s', 'Strikethrough', 'Ctrl+Shift+X', 'S')}
        {listButton('bullet', 'Bulleted list', 'Ctrl+Shift+8', '•')}
        {listButton('number', 'Numbered list', 'Ctrl+Shift+7', '1.')}
        {/* The menus take the focus while open; each puts it back in the note before acting. */}
        <select
          aria-label="Style"
          title="Style"
          value={isList(look.type) ? 'list' : look.type}
          onChange={(e) => act((h) => h.setType(e.target.value as 'p' | 'h1' | 'h2'))}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <option value="p">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="list" disabled hidden>
            List
          </option>
        </select>
        <select
          aria-label="Text size"
          title="Text size"
          value={menu('size')}
          onChange={(e) => act((h) => h.setMark('size', e.target.value || undefined))}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {mixed}
          <option value="small">Small</option>
          <option value="">Normal</option>
          <option value="large">Large</option>
        </select>
        <select
          aria-label="Font"
          title="Font"
          value={menu('font')}
          onChange={(e) => act((h) => h.setMark('font', e.target.value || undefined))}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {mixed}
          {FONTS.map((f) => (
            <option key={f.key} value={f.key === 'sans' ? '' : f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Highlight"
          title="Highlight"
          value={menu('hl')}
          onChange={(e) => act((h) => h.setMark('hl', e.target.value || undefined))}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {mixed}
          <option value="">None</option>
          {HIGHLIGHTS.map((c) => (
            <option key={c} value={c}>
              {c[0].toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>
      {years.map((y) => (
        <div key={y.id} className="jg">
          {head(y.id, y.label, 'year')}
          {isOpen(y.id) &&
            y.months.map((m) => (
              <div key={m.id} className="jg jg-in">
                {head(m.id, m.label, 'month')}
                {isOpen(m.id) &&
                  m.weeks.map((w) => (
                    <div key={w.id} className="jg jg-in">
                      {head(w.id, w.label, 'week')}
                      {isOpen(w.id) && w.entries.map(entry)}
                    </div>
                  ))}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
