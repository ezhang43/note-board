import * as B from '../../model/board';
import { createCard, newId } from '../../model/cards';
import { JOURNAL_KNOWN_KEY, JOURNAL_NAME, JOURNAL_NOTES, UNTITLED_NOTE, addGeneralNote, deleteGeneralNote, findJournalBoard, generalNotes, generalSpot, generalSpotBelow, moveGeneralNote, noteName, renameGeneralNote, journalDateLine, journalBody, journalSpot, todaysNote, withJournalBody } from '../../model/journal';
import { deepEqual } from '../../model/merge';
import { hasFormatting, plainOf, withinLimits, type Rich } from '../../model/richText';
import type { MeasuredHeight } from '../../model/layout';
import type { Board, NoteCard, Point } from '../../model/types';
import type { StoreContext } from '../core';
import { announce } from '../announce';

// The Journal side panel (owner request, 2026-10-18): dated daily notes and general notes kept on
// the person's own hidden "Journal" board, each change on that board's own undo history.

export function journalActions(ctx: StoreContext) {
  const sharedIds = () => ctx.state.ui.shares.flatMap((s) => s.boards);
  /** The board the Journal panel writes into: none once a share holds it (shared boards are never used). */
  const journalId = () => {
    const id = ctx.state.ui.journalBoard;
    return id && !sharedIds().includes(id) ? id : null;
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
        ctx.setOthers((o) => ({ ...o, [made]: { ...B.createBoard(), name: JOURNAL_NAME } }));
        id = made;
      }
      const line = journalDateLine(new Date());
      const note = { ...createCard('note'), text: `${line}\n\n` };
      const at = placing(id);
      ctx.commitTo(id, (b) => (todaysNote(b, line, knownNotes()) ? b : B.addCard(b, note, { type: 'loose', ...journalSpot(b, ...at, knownNotes()) })));
      settle(id, [note.id]);
      // Nothing stays selected behind the panel, so a key meant for the journal can't delete it.
      ctx.updateUi({ sidePanel: 'journal', journalBoard: id, historyOpen: false, selection: [], itemSel: null, completedSteps: null });
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
    /**
     * Rearranging the general notes (owner request, 2026-11-21): the note `noteId` goes to place `to`
     * (0 is the top), dragged by its grip or with Alt+arrows, as one undo step on the Journal board.
     * Only the places (`general`) change, so it saves and syncs like any change. A screen reader hears the new place.
     */
    moveJournalNote(noteId: string, to: number) {
      const id = journalId();
      const board = id ? ctx.workspace().boards[id] : undefined;
      if (!id || !board) return;
      ctx.commitTo(id, (b) => moveGeneralNote(b, noteId, to, knownNotes()));
      const after = ctx.workspace().boards[id];
      if (after === board) return;
      remember();
      const ids = generalNotes(after, knownNotes());
      const c = after.cards[noteId];
      if (c?.kind === 'note') announce(`Moved “${noteName(c.text) || UNTITLED_NOTE}” to place ${ids.indexOf(noteId) + 1} of ${ids.length}`);
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
  };
}
