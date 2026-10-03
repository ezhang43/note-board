import { applyStyle, boxesOf, sizeStepChange, toggleChange, type Box, type StyleChange } from '../../model/textStyle';
import type { StoreContext } from '../core';

// Formatting whole text boxes (owner request): from the format bar and from Ctrl+B / Ctrl+I /
// Ctrl+Shift+> / Ctrl+Shift+<.

/** A change as the bar and the keys ask for it: a set value, or "flip" / "one step". */
export type FormatAsk = StyleChange | 'bold' | 'italic' | 'larger' | 'smaller';

export function formatActions(ctx: StoreContext) {
  const { commit } = ctx;
  return {
    /** Format these text boxes (one undo step). */
    formatBoxes(boxes: Box[], ask: FormatAsk) {
      if (!boxes.length) return;
      commit((b) => {
        const change =
          ask === 'bold' || ask === 'italic'
            ? toggleChange(b, boxes, ask)
            : ask === 'larger' || ask === 'smaller'
              ? sizeStepChange(b, boxes, ask === 'larger' ? 1 : -1)
              : ask;
        return applyStyle(b, boxes, change);
      });
    },
    /** The text boxes the selection stands for: the selected checklist items, or every box in the selected cards and columns. */
    selectedBoxes(): Box[] {
      const { itemSel, selection } = ctx.state.ui;
      if (itemSel) {
        const lists = itemSel.lists ?? [{ cardId: itemSel.cardId, ids: itemSel.ids }];
        return lists.flatMap((l) => l.ids.map((itemId) => ({ cardId: l.cardId, itemId })));
      }
      return boxesOf(ctx.state.board, selection);
    },
  };
}
