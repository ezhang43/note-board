import * as B from '../../model/board';
import { isHabit, withHabitColor } from '../../model/habits';
import type { BoldKey } from '../../model/palette';
import type { TodoCard } from '../../model/types';
import type { StoreContext } from '../core';

// A habit's color (owner picks, 2026-10-22): one of the 8 bold swatches, kept as its card's title
// color on the Habits board, so saving, sync, undo and Version history work as for its name.

export function habitColorActions(ctx: StoreContext, habitsBoard: () => string | null) {
  return {
    /** Give a habit one of the 8 bold colors (null: the default green), as one change on the Habits board's undo; nothing for any other color. */
    setHabitColor(cardId: string, color: BoldKey | null) {
      const id = habitsBoard();
      if (id) ctx.commitTo(id, (b) => B.updateCard(b, cardId, (c) => (isHabit(c) ? withHabitColor(c as TodoCard, color) : c)));
    },
  };
}
