import * as B from '../../model/board';
import { createCard, newId } from '../../model/cards';
import { CARD_W, NEW_BLOCK_H } from '../../model/constants';
import { CHECKLIST_NAME, CHECKLIST_TITLE, checklistCardOf, findChecklistBoard } from '../../model/mainChecklist';
import { spotForNewBlock } from '../../model/layout';
import type { TodoCard } from '../../model/types';
import type { StoreContext } from '../core';

// The Main checklist side panel (owner request, 2026-11-12): one checklist kept on the person's own
// hidden "Main checklist" board, each change on that board's own undo history.

export function checklistPanelActions(ctx: StoreContext) {
  const sharedIds = () => ctx.state.ui.shares.flatMap((s) => s.boards);
  const checklistId = () => findChecklistBoard(ctx.workspace(), sharedIds());

  return {
    /** The board the Checklist panel shows and changes, or null before it first opens. */
    checklistBoard: checklistId,
    /**
     * Open or close the Checklist panel on the left (owner request, 2026-11-12). Opening changes nothing, as with
     * Habits, so a device holding an old offline copy has nothing of its own to upload over a newer online one: with
     * no list yet the panel shows an empty one, and `startChecklist` makes it on the first typing. On a phone
     * (`phone`) it takes the whole screen, so the right-hand panel closes.
     */
    openChecklist(phone = false): 'loading' | null {
      const { ui } = ctx.state;
      if (ui.checklistOpen) {
        ctx.updateUi({ checklistOpen: false });
        return null;
      }
      if (!ui.sharesKnown) return 'loading';
      ctx.updateUi({ preview: null }); // an old version being looked at is put away first
      const id = checklistId();
      // As the Journal opens with the cursor in today's page, the cursor goes to the end of the last item (not on a
      // phone, where the keyboard would cover the list before the person has looked at it).
      const last = id ? checklistCardOf(ctx.workspace().boards[id])?.items.at(-1) : undefined;
      ctx.updateUi({
        checklistOpen: true,
        itemSel: null,
        ...(phone ? { sidePanel: null, historyOpen: false, completedSteps: null } : last && { focusItem: last.id, focusOffset: last.text.length }),
      });
      return null;
    },
    /**
     * The first change in the panel's empty list (typing `text` into it). Makes the "Main checklist" board if there
     * is none (not an undo step, as with Habits) and its one checklist holding `text`, as one change on that board's
     * undo, in a free spot so it covers nothing already there. The cursor goes to the end of the text. Nothing (null)
     * while an old version is shown, or when the list already exists.
     */
    startChecklist(text: string): { board: string; card: string; item: string } | null {
      if (ctx.state.ui.preview) return null;
      let id = checklistId();
      if (id && checklistCardOf(ctx.workspace().boards[id])) return null;
      if (!id) {
        const made = newId('b');
        ctx.setOthers((o) => ({ ...o, [made]: { ...B.createBoard(), name: CHECKLIST_NAME } }));
        id = made;
      }
      const blank = createCard('todo') as TodoCard;
      const item = { ...blank.items[0], text };
      const card: TodoCard = { ...blank, title: CHECKLIST_TITLE, items: [item] };
      // Placed with guessed heights (the board isn't drawn), and tidied if that board is ever opened.
      ctx.commitTo(id, (b) => B.addCard(b, card, { type: 'loose', ...spotForNewBlock(b, CARD_W, NEW_BLOCK_H.todo, { x: 0, y: 0 }, () => undefined) }));
      if (checklistCardOf(ctx.workspace().boards[id])?.id !== card.id) return null;
      ctx.updateUi({ focusItem: item.id, focusOffset: text.length, itemSel: null });
      return { board: id, card: card.id, item: item.id };
    },
    /**
     * The Main checklist board whose cleaned-up items the Completed panel shows with the open board's (owner,
     * 2026-11-13), or null: when there is none, while it is the open board (shown once, as the board's own), and
     * while it isn't yet known which boards are shared (a share's "Main checklist" could be taken for it).
     */
    completedChecklist(): string | null {
      if (!ctx.state.ui.sharesKnown) return null;
      const id = checklistId();
      return id && id !== ctx.state.boards.open ? id : null;
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
  };
}
