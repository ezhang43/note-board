import * as B from '../../model/board';
import { createCard, newId } from '../../model/cards';
import { CARD_W, NEW_BLOCK_H } from '../../model/constants';
import { dayKey } from '../../model/calendar';
import { HABITS_NAME, WEIGHT_TITLE, isWeightDay, parseKg, weightCard, weightEntries, weightHolder, withWeight, withoutWeight } from '../../model/habits';
import { spotForNewBlock } from '../../model/layout';
import type { TodoCard } from '../../model/types';
import type { StoreContext } from '../core';

// Weight (owner request, 2026-10-21): the Weight card of the Habits panel. It lives on the Habits
// board next to the habits, so saving, sync, undo and Version history work as for them.

export function weightActions(ctx: StoreContext, habitsBoard: () => string | null) {
  return {
    /**
     * A weight, typed as kilograms: kept for `day` (today or an earlier day; replacing that day's), as one
     * change on the Habits board's undo. Returns the weight kept, or null (changing nothing) for a blank or
     * out-of-range entry, or a later or unreal day. The Habits board and the Weight card are made by the first one.
     */
    saveWeight(text: string, day: string): number | null {
      const kg = parseKg(text);
      if (kg === null || !isWeightDay(day, dayKey(new Date())) || ctx.state.ui.sidePanel !== 'habits') return null;
      let id = habitsBoard();
      if (!id) {
        const made = newId('b');
        ctx.setOthers((o) => ({ ...o, [made]: { ...B.createBoard(), name: HABITS_NAME } }));
        id = made;
      }
      ctx.commitTo(id, (b) => {
        const card = weightCard(b) ?? weightHolder(b);
        if (card) return B.updateCard(b, card.id, (c) => withWeight(c as TodoCard, day, kg));
        const fresh = withWeight({ ...(createCard('todo') as TodoCard), title: WEIGHT_TITLE }, day, kg);
        // Placed with guessed heights (the board isn't drawn), and tidied if that board is ever opened.
        return B.addCard(b, fresh, { type: 'loose', ...spotForNewBlock(b, CARD_W, NEW_BLOCK_H.todo, { x: 0, y: 0 }, () => undefined) });
      });
      return kg;
    },
    /**
     * Remove one day's weight, as one change on the Habits board's undo; the last one takes the Weight
     * card with it, unless something else was typed on it (review 137-A L4).
     */
    removeWeight(day: string) {
      const id = habitsBoard();
      if (!id) return;
      ctx.commitTo(id, (b) => {
        const card = weightCard(b);
        if (!card || !weightEntries(card).some((e) => e.day === day)) return b;
        const left = withoutWeight(card, day);
        const empty = !weightEntries(left).length && left.items.every((i) => !i.text.trim() && !i.children.length);
        return empty ? B.deleteBlocks(b, [card.id]) : B.updateCard(b, card.id, () => left);
      });
    },
  };
}
