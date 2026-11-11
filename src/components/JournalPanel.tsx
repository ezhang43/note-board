import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { JOURNAL_KNOWN_KEY, JOURNAL_NOTES, NOTE_NAME_MAX, UNTITLED_NOTE, groupJournal, isGroupOpen, isoWeek, journalBody, journalDateLine, journalDayKey, journalEntries, journalLongDate, journalPeek, journalWords, noteName, openToday, parseJournalOpen, toggleGroup, type JournalOpen } from '../model/journal';
import { newId } from '../model/cards';
import { dayKey } from '../model/completed';
import { deepEqual } from '../model/merge';
import { HIGHLIGHTS, journalRich, MAX_SIZE, MIN_SIZE, SIZE_STEPS, sizePx, type Look, type Toggle } from '../model/richText';
import { FONTS } from '../model/textStyle';
import { appStore, useAppState } from '../store/appStore';
import { BOARD_SAVE_DELAY } from '../store/store';
import { CaretIcon, PlusIcon, TrashIcon } from './icons';
import { RichEditor, type RichEditorHandle } from './RichEditor';

/** Which year, month and week groups are open: kept on this device only, never in the board's data (owner request, 2026-10-19). */
const OPEN_KEY = 'note-board:journal-open';
const PLAIN: Look = { type: 'p', b: false, i: false, u: false, s: false };
const PLACEHOLDER = 'Write about today…';
const NOTES_PLACEHOLDER = 'Notes to keep, not tied to a day…';
const count = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/**
 * The Journal side panel (owner request, 2026-10-18): the dated notes on the Journal board, newest
 * day first. Typing goes through the store like typing on the board, so it is saved and undoable.
 * The Journal alone has rich text (owner request, 2026-10-19): the Formatting bar acts on the note
 * last typed in. The page-and-timeline design (owner pick, 2026-10-22): today is a page of its own
 * on top, with its date as the heading and the cursor ready; the earlier days are a timeline below
 * it, grouped Month > Week (Year too for other years), each day a row that shows its first line and
 * opens in place to edit. Only the groups holding today start open.
 */
export function JournalPanel() {
  const board = useAppState((s) => {
    const id = s.ui.journalBoard;
    if (!id) return undefined;
    return id === s.boards.open ? s.board : s.boards.others[id];
  });
  // The general notes, with those this device remembers when an older app has dropped their places
  // (2026-11-10 follow-up; see generalNotes). They are never days, whatever their names.
  // Another tab may remember them in another order (2026-11-10 follow-up): read again when it does.
  const [otherTab, setOtherTab] = useState(0);
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === null || e.key.endsWith(JOURNAL_KNOWN_KEY)) setOtherTab((n) => n + 1);
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const written = useMemo(() => (board ? appStore.journalGeneralNotes(board) : []), [board, otherTab]);
  useEffect(() => appStore.rememberJournalNotes(), [board]);
  const entries = useMemo(() => (board ? journalEntries(board, journalDateLine(new Date()), written) : []), [board, written]);
  const today = dayKey(new Date());
  const years = useMemo(() => groupJournal(entries, today), [entries, today]);
  /** Today's note, which has the page on top (always the first entry when there is one). */
  const todayEntry = entries[0] && journalDayKey(entries[0].date) === today ? entries[0] : undefined;
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
  const head = (id: string, label: string, level: 'year' | 'month' | 'week', entriesIn?: number) => (
    <button type="button" className={`jg-head jg-${level}`} aria-expanded={isOpen(id)} onClick={() => toggle(id)}>
      {label}
      {entriesIn !== undefined && (
        <span className="jg-count" aria-hidden>
          {count(entriesIn)}
        </span>
      )}
    </button>
  );
  // The general notes (owner request, 2026-10-29; several, with names, 2026-11-10): each open every time the
  // panel opens (view state, like a day's fold). With none written yet, one "General notes" note is shown,
  // under the id it gets when it is first written, renamed or added below, so its sheet stays the same.
  const [firstId] = useState(() => newId('k'));
  const generals = written.length ? written : [firstId];
  /** The notes shown now, for a name field that goes with its note (see finish). */
  const shown = useRef(generals);
  shown.current = generals;
  /** General notes folded this visit, by id. */
  const [shutNotes, setShutNotes] = useState<ReadonlySet<string>>(new Set());
  /** The name being typed in a general note's header (view state until Enter or leaving the field saves it). */
  const [renaming, setRenaming] = useState<{ key: string; draft: string } | null>(null);
  // A name field has the cursor, with its text selected, each time it appears (owner decision, 2026-11-10):
  // when opened, and when its note comes back (redo, or from another device) with the name being typed.
  // It doesn't take the cursor from a field outside the panel (one typed in while the note was gone).
  const renameField = useCallback((el: HTMLInputElement | null) => {
    const now = el?.ownerDocument.activeElement;
    if (!el || (now && now !== el.ownerDocument.body && !el.closest('.journal-panel')?.contains(now))) return;
    el.focus();
    el.select();
  }, []);
  /** The general note whose name button takes the keyboard back once its name field goes (Enter or Escape). */
  const refocusName = useRef<string | null>(null);
  // Days whose fold was turned over this visit (view state: not saved, not undoable, gone when the panel closes):
  // today starts open and every earlier day starts folded, showing its first line.
  const [turned, setTurned] = useState<ReadonlySet<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<RichEditorHandle>(null);
  /** The entry being typed in, so the panel keeps the keyboard if undo takes that entry away. */
  const typing = useRef<HTMLElement | null>(null);
  /** The note the Formatting bar acts on, and how its selection looks. */
  const active = useRef<RichEditorHandle | null>(null);
  const handles = useRef(new Map<string, RichEditorHandle>());
  const [look, setLook] = useState<Look>(PLAIN);
  // "Saved" shows for a moment once a change in today's page has been written.
  const [saved, setSaved] = useState(false);
  const savedTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flashSaved = () => {
    savedTimers.current.forEach(clearTimeout);
    setSaved(false);
    savedTimers.current = [setTimeout(() => setSaved(true), BOARD_SAVE_DELAY + 50), setTimeout(() => setSaved(false), BOARD_SAVE_DELAY + 1700)];
  };
  useEffect(() => () => savedTimers.current.forEach(clearTimeout), []);
  // The Aa menu (style, size, font, highlight).
  const [styleOpen, setStyleOpen] = useState(false);
  // The size box's list (owner pick, 2026-10-30), open under the box.
  const [sizesOpen, setSizesOpen] = useState(false);
  const tools = useRef<HTMLDivElement>(null);

  useEffect(() => {
    active.current = first.current;
    first.current?.focusEnd();
  }, []);

  useLayoutEffect(() => {
    if (refocusName.current && !renaming) {
      root.current?.querySelector<HTMLElement>(`[data-note="${CSS.escape(refocusName.current)}"] .jn-name`)?.focus();
      refocusName.current = null;
    }
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

  useEffect(() => {
    if (!styleOpen) return;
    // A press outside the bar, or Escape, shuts the menu (Escape leaves the panel open while it is open, see escapeIsForPanel).
    const press = (e: PointerEvent) => !tools.current?.contains(e.target as Node) && setStyleOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setStyleOpen(false);
    };
    document.addEventListener('pointerdown', press, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', press, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [styleOpen]);

  const act = (fn: (h: RichEditorHandle) => void) => {
    const h = active.current?.el?.isConnected ? active.current : first.current;
    if (h) fn(h);
  };
  // Pressing a button must not take the cursor (or the highlighted words) away from the note.
  const keep = (e: React.SyntheticEvent) => e.preventDefault();
  /** Whether a menu's choice is the selection's (none is when the selection has more than one: Mixed). */
  const is = (key: 'font' | 'hl', value: string) => !look.mixed?.includes(key) && (look[key] ?? '') === value;
  // The size box: the selection's size in px as shown (the old Small and Large show as 14 and 21), empty when it has more than one.
  const mixedSize = !!look.mixed?.includes('size');
  const px = Math.round(sizePx(look.size, look.type));
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
  const choice = (label: string, on: boolean, run: () => void, style?: React.CSSProperties) => (
    <button key={label} type="button" aria-pressed={on} style={style} onClick={run}>
      {label}
    </button>
  );

  const entry = (e: (typeof entries)[number], isToday: boolean) => {
    const card = board?.cards[e.id];
    const value = journalRich(card?.kind === 'note' ? card.text : '', card?.kind === 'note' ? card.rich : undefined);
    const shut = isToday === turned.has(e.id);
    const fold = (ev: React.MouseEvent<HTMLButtonElement>) => {
      // Folding the day holding the cursor takes the cursor to this header, not to the panel (see the layout effect above).
      if (!shut) typing.current = null;
      ev.currentTarget.focus();
      setTurned((was) => {
        const next = new Set(was);
        if (!next.delete(e.id)) next.add(e.id);
        return next;
      });
    };
    const peek = shut ? journalPeek(e.body) : '';
    const key = journalDayKey(e.date);
    const editor = !shut && (
      <RichEditor
        ref={(h) => {
          if (e.id === (todayEntry ?? entries[0])?.id) first.current = h;
          if (h) handles.current.set(e.id, h);
          else handles.current.delete(e.id);
        }}
        value={value}
        label={`Journal, ${e.date}`}
        placeholder={isToday && !e.body.trim() ? PLACEHOLDER : undefined}
        onChange={(rich, typed) => {
          appStore.setJournal(e.id, rich, typed);
          if (isToday) flashSaved();
        }}
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
    );
    if (isToday) {
      const words = journalWords(e.body);
      return (
        <section key={e.id} className={`journal-entry journal-page${shut ? ' shut' : ''}`}>
          <h3>
            <button type="button" className="jg-head jg-day" aria-expanded={!shut} onClick={fold}>
              <span className="sr-only">{e.date}</span>
              <span className="jp-title" aria-hidden>
                {key ? journalLongDate(key) : e.date}
              </span>
              {peek && <span className="jg-peek">{peek}</span>}
              {key && (
                <span className="jp-week" aria-hidden>
                  Week {isoWeek(key)}
                </span>
              )}
            </button>
          </h3>
          {editor}
          {!shut && (
            <p className="journal-foot">
              <span>{words === 1 ? '1 word' : `${words} words`}</span>
              <span className={`journal-saved${saved ? ' on' : ''}`}>✓ Saved</span>
            </p>
          )}
        </section>
      );
    }
    return (
      <section key={e.id} className={`journal-entry journal-row${shut ? ' shut' : ''}`}>
        <h3>
          <button type="button" className="jg-head jg-day" aria-expanded={!shut} onClick={fold}>
            <span className="sr-only">{e.date}</span>
            <span className="jd" aria-hidden>
              <b>{key ? Number(key.slice(8)) : ''}</b>
              <span>{e.date.slice(0, 3)}</span>
            </span>
            {peek && <span className="jg-peek">{peek}</span>}
          </button>
        </h3>
        {editor}
      </section>
    );
  };

  /** One general note's sheet: an arrow that folds it, its name (click to rename) and the trash. */
  const generalSheet = (key: string, count: number) => {
    const card = board?.cards[key];
    const text = card?.kind === 'note' ? card.text : `${JOURNAL_NOTES}\n\n`;
    const name = noteName(text) || UNTITLED_NOTE;
    const value = journalRich(text, card?.kind === 'note' ? card.rich : undefined);
    const peek = journalPeek(journalBody(text));
    const open = !shutNotes.has(key);
    const editing = renaming?.key === key ? renaming : null;
    const finish = (save: boolean) => {
      // Enter or Escape unmounts the field; a blur that follows finds `renaming` already gone. A field that
      // goes with its note (undo, or from another device) keeps the name being typed, for when the note comes back.
      if (!editing || !shown.current.includes(key)) return;
      if (save) appStore.renameJournalNote(key, editing.draft);
      setRenaming(null);
    };
    return (
      <section key={key} data-note={key} className={`journal-notes${open ? '' : ' shut'}`}>
        <h3 className="jn-head">
          <button
            type="button"
            className="jg-head jg-notes"
            aria-expanded={open}
            aria-label={name}
            title={open ? 'Fold' : 'Open'}
            onClick={(ev) => {
              // Folding it while it holds the cursor takes the cursor to this arrow, as a day's fold does.
              if (open) typing.current = null;
              ev.currentTarget.focus();
              setShutNotes((was) => {
                const next = new Set(was);
                if (!next.delete(key)) next.add(key);
                return next;
              });
            }}
          />
          {editing ? (
            <input
              ref={renameField}
              className="jn-rename"
              aria-label="Name"
              value={editing.draft}
              maxLength={NOTE_NAME_MAX}
              onChange={(ev) => setRenaming({ key, draft: ev.target.value })}
              onKeyDown={(ev) => {
                // A key in an input method (IME), such as the Enter that picks a character, is part of the typing.
                if (ev.nativeEvent.isComposing || ev.keyCode === 229) return;
                if (ev.key === 'Enter') {
                  ev.preventDefault();
                  refocusName.current = key;
                  finish(true);
                } else if (ev.key === 'Escape') {
                  refocusName.current = key;
                  finish(false);
                }
              }}
              onBlur={() => finish(true)}
            />
          ) : (
            <button type="button" className="jn-name jp-title" aria-label={`Rename ${name}`} title="Rename" onClick={() => setRenaming({ key, draft: name })}>
              {name}
            </button>
          )}
          {!open && !editing && peek && <span className="jg-peek">{peek}</span>}
          <span className="jn-tools">
            {count > 1 && (
              <button
                type="button"
                className="jn-del"
                aria-label={`Delete “${name}”`}
                title="Delete"
                onClick={() => {
                  appStore.deleteJournalNote(key);
                  root.current?.focus(); // the button goes with its note; Ctrl+Z in the panel brings it back
                }}
              >
                <TrashIcon />
              </button>
            )}
          </span>
        </h3>
        {open && (
          <RichEditor
            ref={(h) => {
              if (h) handles.current.set(key, h);
              else handles.current.delete(key);
            }}
            value={value}
            label={name}
            placeholder={peek ? undefined : NOTES_PLACEHOLDER}
            onChange={(rich, typed) => appStore.setJournalNotes(rich, typed, key)}
            onLook={(l) => {
              active.current = handles.current.get(key) ?? null;
              setLook((was) => (deepEqual(was, l) ? was : l));
            }}
            onFocus={(el) => {
              typing.current = el;
              active.current = handles.current.get(key) ?? null;
            }}
            onBlur={(el) => {
              queueMicrotask(() => {
                if (el.isConnected && typing.current === el) typing.current = null;
              });
            }}
            onEscape={() => root.current?.focus()}
          />
        )}
      </section>
    );
  };

  const thisYear = today.slice(0, 4);
  const timeline = years.flatMap((y) => {
    const months = y.months
      .map((m) => ({ ...m, weeks: m.weeks.map((w) => ({ ...w, rest: w.entries.filter((e) => e.id !== todayEntry?.id) })).filter((w) => w.rest.length) }))
      .filter((m) => m.weeks.length)
      .map((m) => ({ ...m, total: m.weeks.reduce((n, w) => n + w.rest.length, 0) })); // counts are the rows under the header (today's note is on its page)
    if (!months.length) return [];
    const inner = months.map((m) => (
      <div key={m.id} className="jg">
        {head(m.id, m.label, 'month', m.total)}
        {isOpen(m.id) &&
          m.weeks.map((w) => (
            <div key={w.id} className="jg">
              {head(w.id, w.label, 'week', isOpen(w.id) ? undefined : w.rest.length)}
              {isOpen(w.id) && w.rest.map((e) => entry(e, false))}
            </div>
          ))}
      </div>
    ));
    // This year has no header of its own (its months are enough); another year is a group like the rest.
    return y.id === thisYear
      ? inner
      : [
          <div key={y.id} className="jg">
            {head(y.id, y.label, 'year')}
            {isOpen(y.id) && inner}
          </div>,
        ];
  });

  return (
    <div className="journal-panel" tabIndex={-1} ref={root}>
      <div className="journal-tools" role="toolbar" aria-label="Formatting" ref={tools} onPointerDown={keep} onMouseDown={keep}>
        {markButton('b', 'Bold', 'Ctrl+B', 'B')}
        {markButton('i', 'Italic', 'Ctrl+I', 'I')}
        {markButton('u', 'Underline', 'Ctrl+U', 'U')}
        {markButton('s', 'Strikethrough', 'Ctrl+Shift+X', 'S')}
        <span className="jt-sep" aria-hidden />
        {listButton('bullet', 'Bulleted list', 'Ctrl+Shift+8', '•')}
        {listButton('number', 'Numbered list', 'Ctrl+Shift+7', '1.')}
        <button type="button" aria-label="Divider" title="Divider (Alt+I, then R)" onClick={() => act((h) => h.divider())}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="M2 8h12" />
            <path d="M4 3.5h8M4 12.5h8" opacity="0.45" />
          </svg>
        </button>
        <span className="jt-sep" aria-hidden />
        <button type="button" className="jt-hl" aria-label="Highlight yellow" title="Highlight yellow" aria-pressed={is('hl', 'yellow')} onClick={() => act((h) => h.setMark('hl', is('hl', 'yellow') ? undefined : 'yellow'))}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 11.5l5.6-5.6 2.5 2.5L5.5 14H3zM9.2 5.3L11 3.5l2 2-1.8 1.8M3 14h3" />
          </svg>
        </button>
        <button type="button" className="jt-aa" aria-label="Text style" title="Style, size, font and highlight" aria-haspopup="true" aria-expanded={styleOpen} onClick={() => {
            setSizesOpen(false); // the size list starts shut each time the menu opens
            setStyleOpen((o) => !o);
          }}>
          <span aria-hidden>
            <b>A</b>
            <small>a</small>
          </span>
          <CaretIcon />
        </button>
        {styleOpen && (
          <div className="jt-menu" role="group" aria-label="Text style">
            <div className="jt-row">
              <span className="jt-label">Style</span>
              <div className="jt-mini" role="group" aria-label="Style">
                {choice('Normal', look.type === 'p', () => act((h) => h.setType('p')))}
                {choice('Heading 1', look.type === 'h1', () => act((h) => h.setType('h1')))}
                {choice('Heading 2', look.type === 'h2', () => act((h) => h.setType('h2')))}
              </div>
            </div>
            <div className="jt-row">
              <span className="jt-label">Size</span>
              {/* aria-disabled, not disabled, at 10 and 36: a press on a disabled button may not reach the toolbar's keep in every browser, and would take the cursor out of the note. */}
              <div className="jt-size" role="group" aria-label="Text size">
                <button type="button" aria-label="Smaller" title="Smaller" aria-disabled={!mixedSize && px <= MIN_SIZE} onClick={() => (mixedSize || px > MIN_SIZE) && act((h) => h.stepSize(-1))}>
                  −
                </button>
                <button type="button" className="jt-size-box" aria-label={mixedSize ? 'Size: mixed' : `Size ${px}`} title="Choose a size" aria-expanded={sizesOpen} onClick={() => setSizesOpen((o) => !o)}>
                  {mixedSize ? '' : px}
                </button>
                <button type="button" aria-label="Larger" title="Larger" aria-disabled={!mixedSize && px >= MAX_SIZE} onClick={() => (mixedSize || px < MAX_SIZE) && act((h) => h.stepSize(1))}>
                  +
                </button>
                {sizesOpen && (
                  <div className="jt-sizes" role="group" aria-label="Sizes">
                    {SIZE_STEPS.map((n) =>
                      choice(String(n), !mixedSize && px === n, () => {
                        act((h) => h.setSize(n));
                        setSizesOpen(false);
                      }),
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="jt-row">
              <span className="jt-label">Font</span>
              <div className="jt-fonts" role="group" aria-label="Font">
                {FONTS.map((f) => choice(f.label, is('font', f.key === 'sans' ? '' : f.key), () => act((h) => h.setMark('font', f.key === 'sans' ? undefined : f.key)), { fontFamily: `var(--font${f.key === 'sans' ? '' : `-${f.key}`})` }))}
              </div>
            </div>
            <div className="jt-row">
              <span className="jt-label">Highlight</span>
              <div className="jt-hls" role="group" aria-label="Highlight">
                {HIGHLIGHTS.map((c) => (
                  <button key={c} type="button" className="jt-dot" data-hl={c} aria-label={c[0].toUpperCase() + c.slice(1)} title={c[0].toUpperCase() + c.slice(1)} aria-pressed={is('hl', c)} onClick={() => act((h) => h.setMark('hl', c))} />
                ))}
                {choice('None', is('hl', ''), () => act((h) => h.setMark('hl', undefined)))}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Only with a Journal board to write into, like the days. */}
      {board && (
        // The one + for all the general notes (owner request, 2026-11-11): above the first, adding a note at the top of the list.
        <div className="jn-bar">
          <button
            type="button"
            className="jn-add"
            aria-label="Add a general note"
            title="Add a general note"
            onClick={() => {
              const added = appStore.addJournalNote(generals[0]);
              if (added) setRenaming({ key: added, draft: UNTITLED_NOTE });
            }}
          >
            <PlusIcon />
          </button>
        </div>
      )}
      {board && generals.map((id) => generalSheet(id, generals.length))}
      {todayEntry && entry(todayEntry, true)}
      {timeline}
    </div>
  );
}
