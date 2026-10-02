import type { StorageLike } from '../model/persist';
import { blockActions } from './actions/blocks';
import { checklistActions } from './actions/checklist';
import { gestureActions } from './actions/gestures';
import { createCore } from './core';
import { later, type Schedule } from './env';

// The single store: one state object (board data, view, ui), changed only through its actions.
// The core (core.ts) holds the state, saving and undo; the actions live in ./actions/ by topic.

export type * from './types';
export { BOARD_SAVE_DELAY, VIEW_SAVE_DELAY } from './core';
export { COMPLETE_ARRIVE_MS, COMPLETE_LEAVE_MS } from './actions/checklist';
export { EXPAND_WATCH_MS, IMPORT_TOP_MARGIN } from './actions/blocks';

export type Store = ReturnType<typeof createStore>;

export function createStore(storage: StorageLike | null, schedule: Schedule = later) {
  const { ctx, api } = createCore(storage, schedule);
  return {
    ...api,
    /** The checklist item that was asked to take the cursor has taken it. */
    focusTaken: (itemId: string) => {
      if (ctx.state.ui.focusItem === itemId) ctx.updateUi({ focusItem: null, focusOffset: null });
    },
    ...blockActions(ctx),
    ...gestureActions(ctx),
    ...checklistActions(ctx),
  };
}
