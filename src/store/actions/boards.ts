import * as B from '../../model/board';
import { createBoardCard, createCard, newId } from '../../model/cards';
import { CARD_W, NEW_BLOCK_H } from '../../model/constants';
import { CHECKLIST_TITLE, checklistCardOf, findChecklistBoard, hiddenChecklist, newChecklistBoard } from '../../model/mainChecklist';
import { HABITS_NAME, findHabitsBoard, hiddenHabits, isHabit, tickedDays, withDay } from '../../model/habits';
import { JOURNAL_KNOWN_KEY, JOURNAL_NAME, JOURNAL_NOTES, UNTITLED_NOTE, addGeneralNote, deleteGeneralNote, findJournalBoard, generalNotes, generalSpot, generalSpotBelow, hiddenJournal, renameGeneralNote, journalDateLine, journalBody, journalSpot, todaysNote, withJournalBody } from '../../model/journal';
import { deepEqual } from '../../model/merge';
import { hasFormatting, plainOf, withinLimits, type Rich } from '../../model/richText';
import { spotForNewBlock, type MeasuredHeight } from '../../model/layout';
import type { Board, NoteCard, Point, TodoCard } from '../../model/types';
import { boardNeighbor, pathTo, withoutBoard, type Workspace } from '../../model/workspace';
import { restorable } from '../../model/sharing';
import type { StoreContext } from '../core';

// Several boards, and boards inside boards (owner request, 2026-10-05): opening, adding and
// deleting boards. Undo belongs to each board; adding or deleting a board itself isn't undone
// (a deleted board can be brought back from Version history).

const blankBoard = (): Board => ({ ...B.createBoard(), name: '' });

export function boardActions(ctx: StoreContext) {
  const { commit, setOthers, openBoard } = ctx;
  const sharedIds = () => ctx.state.ui.shares.flatMap((s) => s.boards);
  /** The board the Journal panel writes into: none once a share holds it (shared boards are never used). */
  const journalId = () => {
    const id = ctx.state.ui.journalBoard;
    return id && !sharedIds().includes(id) ? id : null;
  };
  /** The Habits panel's board, found afresh each time, so one that arrives from another device is used and a shared one never is. */
  const habitsId = () => findHabitsBoard(ctx.workspace(), sharedIds());
  const checklistId = () => findChecklistBoard(ctx.workspace(), sharedIds());
  /** The Journal and Habits boards left out of the Boards menu and Ctrl+arrows: never the open one, none until shares are known. */
  const hidden = (): string[] => {
    if (!ctx.state.ui.sharesKnown) return [];
    const ws = ctx.workspace();
    return [hiddenJournal(ws, sharedIds()), hiddenHabits(ws, sharedIds()), hiddenChecklist(ws, sharedIds())].filter((id): id is string => !!id && id !== ctx.state.boards.open);
  };
  /** A change to one habit on the Habits board, as one change on that board's own undo. */
  const changeHabit = (cardId: string, change: (c: TodoCard) => TodoCard, merge?: string) => {
    const id = habitsId();
    if (id) ctx.commitTo(id, (b) => B.updateCard(b, cardId, (c) => (isHabit(c) ? change(c) : c)), merge);
  };
  /**
   * Journal note `c` with `rich` written under its first line (the date line, or "General notes"),
   * which stays. The plain text goes into `text`, which everything else reads, and the formatting
   * beside it in `rich`, left out when there is none so a plain note keeps the shape it always had.
   */
  const writeJournal = (c: NoteCard, rich: Rich): NoteCard => {
    const body = plainOf(rich);
    // A note too big for its formatting to load back keeps only its text, now rather than on a reload.
    const keep = hasFormatting(rich) && withinLimits(rich) ? rich : undefined;
    const text = journalBody(c.text) === body ? c.text : withJournalBody(c.text, body);
    if (text === c.text && deepEqual(keep, c.rich)) return c;
    const { rich: _old, ...rest } = c;
    return keep ? { ...rest, text, rich: keep } : { ...rest, text };
  };
  /**
   * Typing or formatting in the Journal panel: the body under a note's date line (see writeJournal).
   * Typing merges into one undo step; each formatting change (`typing` false) is a step of its own.
   */
  const setJournal = (noteId: string, rich: Rich, typing = true) => {
    const id = journalId();
    if (!id) return;
    ctx.commitTo(id, (b) => B.updateCard(b, noteId, (c) => (c.kind === 'note' ? writeJournal(c, rich) : c)), typing ? `text:${noteId}` : undefined);
  };

  /**
   * Where a new block goes on board `boardId`: placed by what is drawn when it is the open board;
   * elsewhere heights are guessed, and it is tidied once that board is drawn.
   */
  const placing = (boardId: string): [MeasuredHeight, Point] =>
    boardId === ctx.state.boards.open ? [ctx.measured, ctx.screenCentre()] : [() => undefined, { x: 0, y: 0 }];
  /**
   * The general notes this device last saw on the Journal board, by id, in order (2026-11-10 follow-up):
   * an older copy of the app drops their places, and these find them again (see generalNotes).
   * Kept in this browser only; the board's own data is never changed by them until the next change in the panel.
   * Read again each time (another tab may have written it), and parsed again only when it has changed.
   */
  const KNOWN_MAX = 500;
  let knownRaw: string | null = null;
  let known: string[] = [];
  const knownNotes = (): string[] => {
    const raw = ctx.read(JOURNAL_KNOWN_KEY);
    if (raw === knownRaw) return known;
    knownRaw = raw;
    try {
      const got: unknown = JSON.parse(raw ?? '[]');
      known = Array.isArray(got) ? got.filter((x): x is string => typeof x === 'string').slice(0, 10 * KNOWN_MAX) : [];
    } catch {
      known = [];
    }
    return known;
  };
  const journalBoardNow = (): Board | undefined => {
    const id = journalId();
    return id ? ctx.workspace().boards[id] : undefined;
  };
  /**
   * The "General notes" note, made when it is first written, renamed, or has a note added above it (see withFirst),
   * with the id the panel shows it under (so the sheet keeps the cursor as it comes), or a new one.
   */
  const firstNote = (id?: string): NoteCard => ({ ...createCard('note', id), kind: 'note', text: `${JOURNAL_NOTES}\n\n`, general: 1 }) as NoteCard;
  /** The Journal board `b` with `card` as its first general note, beside everything; unchanged if it has one already (or that id is taken). */
  const withFirst = (b: Board, card: NoteCard): Board => {
    const id = journalId();
    if (!id || generalNotes(b, knownNotes()).length || b.cards[card.id]) return b;
    return B.addCard(b, card, { type: 'loose', ...generalSpot(b, ...placing(id)) });
  };
  /** Notes just added to the Journal board are tidied at once when that board is the open one (drawn). */
  const settle = (boardId: string, cardIds: string[]) => {
    const here = boardId === ctx.state.boards.open ? cardIds.filter((k) => ctx.state.board.cards[k]) : [];
    if (here.length) ctx.requestSettle(here);
  };
  /**
   * Remembers the Journal board's general notes on this device once they have places (see knownNotes):
   * after each change in the panel, and whenever the panel shows them (they may have come from another device).
   */
  function remember() {
    const b = journalBoardNow();
    if (!b) return;
    const was = knownNotes();
    const ids = generalNotes(b, was);
    if (!ids.some((k) => (b.cards[k] as NoteCard).general !== undefined)) return;
    // Ids no longer listed (a note deleted, which Undo can bring back without its place) stay where they were.
    // simple: up to KNOWN_MAX ids; past that, ids no longer listed go first, from the start of the list.
    const next = [...ids];
    was.forEach((k, i) => {
      if (next.includes(k)) return;
      const before = was.slice(0, i).reverse().find((p) => next.includes(p));
      next.splice(before === undefined ? 0 : next.indexOf(before) + 1, 0, k);
    });
    let over = next.length - KNOWN_MAX;
    const keep = next.filter((k) => over <= 0 || ids.includes(k) || over-- <= 0);
    if (deepEqual(keep, was)) return;
    ctx.write(JOURNAL_KNOWN_KEY, JSON.stringify(keep));
  }

  return {
    hiddenBoards: hidden,
    openBoard,
    /** A board's name ('' if unnamed or gone). */
    boardName(id: string): string {
      const { board, boards } = ctx.state;
      return id === boards.open ? board.name : (boards.others[id]?.name ?? '');
    },
    /** The boards from the top down to the open one, for going back up. */
    pathToOpen: () => pathTo(ctx.workspace(), ctx.state.boards.open),
    /** Ctrl+arrow keys: opens the next / previous / parent / first inner board and returns its id; null (nothing opens) at an end. */
    moveBoard(move: Parameters<typeof boardNeighbor>[2]): string | null {
      // The hidden Journal, Habits and Main checklist boards are passed over, as in the Boards menu.
      const ws = ctx.workspace();
      const skip = hidden();
      let id = boardNeighbor(ws, ctx.state.boards.open, move);
      while (id && skip.includes(id)) id = boardNeighbor(ws, id, move);
      if (id) openBoard(id);
      return id && ctx.state.boards.open === id ? id : null;
    },
    /** New board: a fresh, unnamed board on its own (not inside another), opened straight away. */
    newBoard(): string {
      const id = newId('b');
      setOthers((o) => ({ ...o, [id]: blankBoard() }));
      openBoard(id);
      return id;
    },
    /**
     * Add a board here: a new board inside this one, with a card on this board that opens it ('' on a read-only board).
     * The card is placed like a new card (into the selected column, else the middle of the screen).
     */
    addBoardCard(): string {
      if (ctx.viewOnly()) return ''; // not on a read-only board (job 161), where the card couldn't go
      const id = newId('b');
      setOthers((o) => ({ ...o, [id]: blankBoard() }));
      const card = createBoardCard(id);
      const { board, ui } = ctx.state;
      const selected = ui.selection.length === 1 ? ui.selection[0] : null;
      const place =
        B.placementForNewCard(board, selected) ??
        ({ type: 'loose', ...spotForNewBlock(board, CARD_W, NEW_BLOCK_H.board, ctx.screenCentre(), ctx.measured) } as const);
      commit((b) => B.addCard(b, card, place), { ui: { selection: [card.id], itemSel: null } });
      ctx.requestSettle([place.type === 'column' ? place.columnId : card.id]);
      return id;
    },
    /**
     * The Journal button (owner request, 2026-10-18): opens the Journal side panel, or closes it,
     * leaving the open board as it is. The panel writes into the person's own board called "Journal"
     * (made on its own, with no card opening it, the first time); opening it adds today's dated note
     * at the top of that board if it isn't there, as one change on that board's undo. Returns
     * 'loading' (changing nothing) while it isn't yet known which boards are shared: never uses one of those.
     */
    openJournal(): 'loading' | null {
      const { ui } = ctx.state;
      if (ui.sidePanel === 'journal') {
        ctx.updateUi({ sidePanel: null });
        return null;
      }
      if (!ui.sharesKnown) return 'loading';
      ctx.updateUi({ preview: null }); // an old version being looked at is put away first
      let id = findJournalBoard(ctx.workspace(), sharedIds());
      if (!id) {
        const made = newId('b');
        setOthers((o) => ({ ...o, [made]: { ...blankBoard(), name: JOURNAL_NAME } }));
        id = made;
      }
      const line = journalDateLine(new Date());
      const note = { ...createCard('note'), text: `${line}\n\n` };
      const at = placing(id);
      ctx.commitTo(id, (b) => (todaysNote(b, line, knownNotes()) ? b : B.addCard(b, note, { type: 'loose', ...journalSpot(b, ...at, knownNotes()) })));
      settle(id, [note.id]);
      // Nothing stays selected behind the panel, so a key meant for the journal can't delete it.
      ctx.updateUi({ sidePanel: 'journal', journalBoard: id, historyOpen: false, selection: [], itemSel: null });
      return null;
    },
    setJournal,
    /**
     * Typing or formatting in one of the Journal panel's general notes (owner request, 2026-10-29;
     * several since 2026-11-10): written as setJournal writes a day, into the general note `noteId`,
     * or the first one in the list when it is left out. Since new notes go on top (2026-11-11), that is
     * the newest "Untitled note", not "General notes", once one has been added. The panel always passes
     * `noteId`, so only a caller that leaves it out gets this default.
     * With none yet, the "General notes" note is added on the first typing, not when the panel opens, so opening it changes nothing; that first typing and the
     * note's coming are one undo step.
     */
    setJournalNotes(rich: Rich, typing = true, noteId?: string) {
      const id = journalId();
      const board = id ? ctx.workspace().boards[id] : undefined;
      if (!id || !board) return; // the Journal board went (sync or a restore) while the panel was open
      const ids = generalNotes(board, knownNotes());
      if (noteId && ids.includes(noteId)) return setJournal(noteId, rich, typing);
      if (ids.length) return noteId ? undefined : setJournal(ids[0], rich, typing); // a note named that went (undo, sync) is left alone
      if (!plainOf(rich) && !hasFormatting(rich)) return; // nothing written: nothing is added
      const card = writeJournal(firstNote(noteId), rich);
      ctx.commitTo(id, (b) => withFirst(b, card), typing ? `text:${card.id}` : undefined);
      settle(id, [card.id]);
      remember();
    },
    /**
     * The + at the top of the general notes (owner request, 2026-11-11; it was in each note's header,
     * 2026-11-10): adds an "Untitled note" as the first general note, above every other, as one undo
     * step. `first` is the id of the note the panel shows on top: with none written yet, it is the id
     * the panel shows "General notes" under, and that note is added with it (below the new one).
     * Returns the new note's id, or null when nothing was added.
     */
    addJournalNote(first: string): string | null {
      const id = journalId();
      if (!id || !ctx.workspace().boards[id]) return null;
      const note = { ...createCard('note'), kind: 'note', text: `${UNTITLED_NOTE}\n\n` } as NoteCard;
      const at = placing(id);
      let made: string | null = null;
      ctx.commitTo(id, (b) => {
        const withIt = withFirst(b, firstNote(first));
        if (withIt !== b) made = first;
        // On the board it goes below the old first (the list's order is `general`, not where they sit).
        return addGeneralNote(withIt, note, generalSpotBelow(withIt, first, ...at), knownNotes());
      });
      if (!ctx.workspace().boards[id]?.cards[note.id]) return null;
      // Both when the first comes with it: it isn't drawn yet, so the new one was placed below its guessed height.
      settle(id, made ? [made, note.id] : [note.id]);
      remember();
      return note.id;
    },
    /**
     * Renaming a general note in its header (owner decision, 2026-11-10): its first line becomes
     * `name` ("Untitled note" when empty), as one undo step. With none written yet, `noteId` is the id
     * the panel shows "General notes" under, and that note is added with the new name (the same name adds nothing).
     */
    renameJournalNote(noteId: string, name: string) {
      const id = journalId();
      if (!id || !ctx.workspace().boards[id]) return;
      ctx.commitTo(id, (b) => {
        if (generalNotes(b, knownNotes()).length) return renameGeneralNote(b, noteId, name, knownNotes());
        const first = firstNote(noteId);
        const renamed = renameGeneralNote(withFirst(b, first), noteId, name);
        return (renamed.cards[noteId] as NoteCard | undefined)?.text !== first.text ? renamed : b;
      });
      settle(id, [noteId]);
      remember();
    },
    /**
     * The trash in a general note's header (owner decision, 2026-11-10): deletes it at once with the
     * Undo message; Undo or Ctrl+Z in the panel brings it back. The last general note is never deleted.
     */
    deleteJournalNote(noteId: string) {
      const id = journalId();
      if (id) ctx.deleting('Deleted 1 note', () => ctx.commitTo(id, (b) => deleteGeneralNote(b, noteId, knownNotes())), id);
      remember();
    },
    /** The Journal panel's general notes, in order (see generalNotes), with what this device remembers of them. */
    journalGeneralNotes(board: Board | undefined = journalBoardNow()): string[] {
      return board ? generalNotes(board, knownNotes()) : [];
    },
    /** The panel shows the general notes: this device remembers them (see remember). */
    rememberJournalNotes: remember,
    /** Ctrl+Z / Ctrl+Y in the Journal panel: on the Journal board's own history, whichever board is open. */
    undoJournal() {
      const id = journalId();
      if (id) ctx.undoOn(id, 'undo');
    },
    redoJournal() {
      const id = journalId();
      if (id) ctx.undoOn(id, 'redo');
    },
    /**
     * The Habits button (owner request, 2026-10-19): opens the Habits side panel, or closes it,
     * leaving the open board as it is. Nothing is made until the first habit is added. Returns
     * 'loading' (changing nothing) while it isn't yet known which boards are shared.
     */
    openHabits(): 'loading' | null {
      const { ui } = ctx.state;
      if (ui.sidePanel === 'habits') {
        ctx.updateUi({ sidePanel: null });
        return null;
      }
      if (!ui.sharesKnown) return 'loading';
      ctx.updateUi({ preview: null }); // an old version being looked at is put away first
      // Nothing stays selected behind the panel, so a key meant for it can't delete it.
      ctx.updateUi({ sidePanel: 'habits', historyOpen: false, selection: [], itemSel: null });
      return null;
    },
    /** A new habit at the end of the list, named `name` (trimmed; nothing for a blank name). Returns its id. */
    addHabit(name: string): string | null {
      const title = name.trim();
      if (!title || ctx.state.ui.sidePanel !== 'habits') return null;
      let id = habitsId();
      if (!id) {
        const made = newId('b');
        setOthers((o) => ({ ...o, [made]: { ...blankBoard(), name: HABITS_NAME } }));
        id = made;
      }
      const card: TodoCard = { ...(createCard('todo') as TodoCard), title };
      // Placed with guessed heights (the board isn't drawn), and tidied if that board is ever opened.
      ctx.commitTo(id, (b) => B.addCard(b, card, { type: 'loose', ...spotForNewBlock(b, CARD_W, NEW_BLOCK_H.todo, { x: 0, y: 0 }, () => undefined) }));
      return card.id;
    },
    renameHabit: (cardId: string, name: string) => changeHabit(cardId, (c) => (c.title === name ? c : { ...c, title: name }), `title:${cardId}`),
    /** Tick or untick one day (a "YYYY-MM-DD" key) of a habit. */
    toggleHabitDay: (cardId: string, day: string) => changeHabit(cardId, (c) => withDay(c, day, !tickedDays(c).has(day))),
    /** Delete a habit with its ticks, as one change on the Habits board's undo (Ctrl+Z in the panel, or Version history, brings it back). */
    /** Deletes a habit at once, with the Undo message (owner, 2026-10-22): Undo or Ctrl+Z in the panel brings it back. */
    deleteHabit(cardId: string) {
      const id = habitsId();
      const habit = id ? ctx.workspace().boards[id]?.cards[cardId] : undefined;
      if (!id || !habit || !isHabit(habit)) return;
      ctx.deleting(`Deleted the habit “${habit.title}”`, () => ctx.commitTo(id, (b) => (b.cards[cardId] ? B.deleteBlocks(b, [cardId]) : b)), id);
    },
    /** The board the Habits panel shows and changes, or null before the first habit. */
    habitsBoard: habitsId,
    /** The board the Checklist panel shows and changes, or null before it first opens. */
    checklistBoard: checklistId,
    /**
     * Open or close the Checklist panel on the left (owner request, 2026-11-12). The first time, its
     * board is made with its one checklist (not an undo step: there is nothing to undo back to). On a
     * phone (`phone`) it takes the whole screen, so the right-hand panel closes.
     */
    openChecklist(phone = false): 'loading' | null {
      const { ui } = ctx.state;
      if (ui.checklistOpen) {
        ctx.updateUi({ checklistOpen: false, ...(ui.completedBoard ? { completedBoard: null, sidePanel: ui.sidePanel === 'completed' ? null : ui.sidePanel } : {}) });
        return null;
      }
      if (!ui.sharesKnown) return 'loading';
      ctx.updateUi({ preview: null }); // an old version being looked at is put away first
      let id = checklistId();
      if (!id) {
        const made = newId('b');
        setOthers((o) => ({ ...o, [made]: newChecklistBoard() }));
        id = made;
      }
      // Its checklist was deleted (on the board itself, opened from search): a new one, as one change on its undo.
      const board = ctx.workspace().boards[id];
      if (board && !checklistCardOf(board)) ctx.commitTo(id, (b) => B.addCard(b, { ...(createCard('todo') as TodoCard), title: CHECKLIST_TITLE }, { type: 'loose', x: 0, y: 0 }));
      ctx.updateUi({ checklistOpen: true, itemSel: null, ...(phone ? { sidePanel: null, historyOpen: false, completedBoard: null } : {}) });
      return null;
    },
    /** Ctrl+Z / Ctrl+Y in the Checklist panel: on the Main checklist board's own history, whichever board is open. */
    undoChecklist() {
      const id = checklistId();
      if (id) ctx.undoOn(id, 'undo');
    },
    redoChecklist() {
      const id = checklistId();
      if (id) ctx.undoOn(id, 'redo');
    },
    /** Ctrl+Z / Ctrl+Y in the Habits panel: on the Habits board's own history, whichever board is open. */
    undoHabits() {
      const id = habitsId();
      if (id) ctx.undoOn(id, 'undo');
    },
    redoHabits() {
      const id = habitsId();
      if (id) ctx.undoOn(id, 'redo');
    },
    /**
     * Delete a board and every card that opens it (the home board never). If it is open, the board
     * above it opens first. Boards inside it are kept and then stand alone.
     */
    deleteBoard(id: string) {
      const ws = ctx.workspace();
      // A board in a share this person can only view or comment on stays (job 161).
      if (id === ws.home || !ws.boards[id] || ctx.viewOnly(id)) return;
      if (ctx.state.boards.open === id) {
        const path = pathTo(ws, id);
        openBoard(path.length > 1 ? path[path.length - 2] : ws.home);
      }
      const after = withoutBoard(ctx.workspace(), id);
      const open = ctx.state.boards.open;
      // The cards on the open board go as an ordinary change (Ctrl+Z shows them as deleted boards).
      if (after.boards[open] !== ctx.state.board) {
        commit((b) => B.deleteBlocks(b, Object.values(b.cards).filter((c) => c.kind === 'board' && c.boardId === id).map((c) => c.id)), { ui: { selection: [] } });
      }
      setOthers(() => {
        const others = { ...after.boards };
        delete others[open];
        return others;
      });
    },
    /**
     * Put an old version back (version history): the open board as it was then (one change, so
     * Ctrl+Z undoes it), and any board deleted since comes back too. Other boards are left as they are,
     * and so are boards of a share someone else shared with this person (owner, 2026-10-06; see
     * restorable). Returns those shares' starting boards, or 'loading' (changing nothing) while it
     * isn't yet known which boards are shared (job #33).
     */
    restoreVersion(ws: Workspace): string[] | 'loading' {
      if (!ctx.state.ui.sharesKnown) return 'loading';
      ctx.updateUi({ preview: null });
      // The hidden Journal, Habits and Main checklist boards can't be opened to restore them on their own, so they
      // come back too (check of PR #94), each as one change on its own undo; a version without one leaves it as it is.
      for (const id of hidden()) if (ws.boards[id]) ctx.commitTo(id, () => ws.boards[id]);
      const open = ctx.state.boards.open;
      const missing = Object.keys(ws.boards).filter((id) => id !== open && !ctx.workspace().boards[id]);
      const { ids, kept } = restorable(ctx.state.ui.shares, ws.boards[open] ? [open, ...missing] : missing);
      const back = ids.filter((id) => id !== open);
      if (back.length) setOthers((o) => ({ ...o, ...Object.fromEntries(back.map((id) => [id, ws.boards[id]])) }));
      const then = ids.includes(open) ? ws.boards[open] : undefined;
      if (then) commit(() => then, { ui: { historyOpen: false, selection: [], itemSel: null } });
      else ctx.updateUi({ historyOpen: false });
      return kept;
    },
  };
}
