import * as B from '../../model/board';
import { createCard, newId } from '../../model/cards';
import { CARD_W, NEW_BLOCK_H } from '../../model/constants';
import { HABITS_NAME, findHabitsBoard, isHabit, tickedDays, withDay } from '../../model/habits';
import { spotForNewBlock } from '../../model/layout';
import type { TodoCard } from '../../model/types';
import type { StoreContext } from '../core';

// The Habits side panel (owner request, 2026-10-19): habits kept on the person's own hidden
// "Habits" board, each change on that board's own undo history.

export function habitActions(ctx: StoreContext) {
  const sharedIds = () => ctx.state.ui.shares.flatMap((s) => s.boards);
  /** The Habits panel's board, found afresh each time, so one that arrives from another device is used and a shared one never is. */
  const habitsId = () => findHabitsBoard(ctx.workspace(), sharedIds());
  /** A change to one habit on the Habits board, as one change on that board's own undo. */
  const changeHabit = (cardId: string, change: (c: TodoCard) => TodoCard, merge?: string) => {
    const id = habitsId();
    if (id) ctx.commitTo(id, (b) => B.updateCard(b, cardId, (c) => (isHabit(c) ? change(c) : c)), merge);
  };

  return {
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
      ctx.updateUi({ sidePanel: 'habits', historyOpen: false, selection: [], itemSel: null, completedSteps: null });
      return null;
    },
    /** A new habit at the end of the list, named `name` (trimmed; nothing for a blank name). Returns its id. */
    addHabit(name: string): string | null {
      const title = name.trim();
      if (!title || ctx.state.ui.sidePanel !== 'habits') return null;
      let id = habitsId();
      if (!id) {
        const made = newId('b');
        ctx.setOthers((o) => ({ ...o, [made]: { ...B.createBoard(), name: HABITS_NAME } }));
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
    /** Deletes a habit at once, with the Undo message (owner, 2026-10-22): Undo or Ctrl+Z in the panel brings it back. */
    deleteHabit(cardId: string) {
      const id = habitsId();
      const habit = id ? ctx.workspace().boards[id]?.cards[cardId] : undefined;
      if (!id || !habit || !isHabit(habit)) return;
      ctx.deleting(`Deleted the habit “${habit.title}”`, () => ctx.commitTo(id, (b) => (b.cards[cardId] ? B.deleteBlocks(b, [cardId]) : b)), id);
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
  };
}
