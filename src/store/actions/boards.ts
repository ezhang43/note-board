import * as B from '../../model/board';
import { createBoardCard, createCard, newId } from '../../model/cards';
import { CARD_W, NEW_BLOCK_H } from '../../model/constants';
import { HABITS_NAME, findHabitsBoard, hiddenHabits, isHabit, tickedDays, withDay } from '../../model/habits';
import { JOURNAL_NAME, findJournalBoard, hiddenJournal, journalDateLine, journalBody, journalSpot, todaysNote, withJournalBody } from '../../model/journal';
import { deepEqual } from '../../model/merge';
import { hasFormatting, plainOf, withinLimits, type Rich } from '../../model/richText';
import { spotForNewBlock } from '../../model/layout';
import type { Board, NoteCard, TodoCard } from '../../model/types';
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
  /** The Journal and Habits boards left out of the Boards menu and Ctrl+arrows: never the open one, none until shares are known. */
  const hidden = (): string[] => {
    if (!ctx.state.ui.sharesKnown) return [];
    const ws = ctx.workspace();
    return [hiddenJournal(ws, sharedIds()), hiddenHabits(ws, sharedIds())].filter((id): id is string => !!id && id !== ctx.state.boards.open);
  };
  /** A change to one habit on the Habits board, as one change on that board's own undo. */
  const changeHabit = (cardId: string, change: (c: TodoCard) => TodoCard, merge?: string) => {
    const id = habitsId();
    if (id) ctx.commitTo(id, (b) => B.updateCard(b, cardId, (c) => (isHabit(c) ? change(c) : c)), merge);
  };

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
      // The hidden Journal and Habits boards are passed over, as in the Boards menu.
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
     * Add a board here: a new board inside this one, with a card on this board that opens it.
     * The card is placed like a new card (into the selected column, else the middle of the screen).
     */
    addBoardCard(): string {
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
      // On the open board it is placed by what is drawn; elsewhere heights are guessed, and it is
      // tidied once that board is drawn.
      const open = id === ctx.state.boards.open;
      ctx.commitTo(id, (b) =>
        todaysNote(b, line) ? b : B.addCard(b, note, { type: 'loose', ...journalSpot(b, open ? ctx.measured : () => undefined, open ? ctx.screenCentre() : { x: 0, y: 0 }) }),
      );
      if (open && ctx.state.board.cards[note.id]) ctx.requestSettle([note.id]);
      // Nothing stays selected behind the panel, so a key meant for the journal can't delete it.
      ctx.updateUi({ sidePanel: 'journal', journalBoard: id, historyOpen: false, selection: [], itemSel: null });
      return null;
    },
    /**
     * Typing or formatting in the Journal panel: the body under a note's date line (the date line
     * stays). The plain text is written into `text`, which everything else reads, and the formatting
     * beside it in `rich`, left out when there is none so a plain note keeps the shape it always had.
     * Typing merges into one undo step; each formatting change (`typing` false) is a step of its own.
     */
    setJournal(noteId: string, rich: Rich, typing = true) {
      const id = journalId();
      if (!id) return;
      const body = plainOf(rich);
      // A note too big for its formatting to load back keeps only its text, now rather than on a reload.
      const keep = hasFormatting(rich) && withinLimits(rich) ? rich : undefined;
      const write = (c: NoteCard): NoteCard => {
        const text = journalBody(c.text) === body ? c.text : withJournalBody(c.text, body);
        if (text === c.text && deepEqual(keep, c.rich)) return c;
        const { rich: _old, ...rest } = c;
        return keep ? { ...rest, text, rich: keep } : { ...rest, text };
      };
      ctx.commitTo(id, (b) => B.updateCard(b, noteId, (c) => (c.kind === 'note' ? write(c) : c)), typing ? `text:${noteId}` : undefined);
    },
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
    deleteHabit(cardId: string) {
      const id = habitsId();
      if (id) ctx.commitTo(id, (b) => (b.cards[cardId] && isHabit(b.cards[cardId]) ? B.deleteBlocks(b, [cardId]) : b));
    },
    /** The board the Habits panel shows and changes, or null before the first habit. */
    habitsBoard: habitsId,
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
      if (id === ws.home || !ws.boards[id]) return;
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
      // The hidden Journal and Habits boards can't be opened to restore them on their own, so they
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
