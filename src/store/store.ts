import type { StorageLike } from '../model/persist';
import { COLOR_THEME_KEY, startingColorTheme } from '../model/theme';
import { blockActions } from './actions/blocks';
import { boardActions } from './actions/boards';
import { checklistActions } from './actions/checklist';
import { formatActions } from './actions/format';
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

function savedColorTheme(storage: StorageLike | null): string | null {
  try {
    return storage?.getItem(COLOR_THEME_KEY) ?? null;
  } catch {
    return null; // Storage blocked: Honey.
  }
}

export function createStore(storage: StorageLike | null, schedule: Schedule = later) {
  const { ctx, api } = createCore(storage, schedule);
  // The color theme is a per-device setting like light / dark, started from what this device saved.
  ctx.updateView((v) => ({ ...v, colorTheme: startingColorTheme(savedColorTheme(storage)) }));
  const boards = boardActions(ctx);
  return {
    ...api,
    /** The checklist item or new block that was asked to take the cursor has taken it. */
    focusTaken: (id: string) => {
      const { focusItem, focusBlock } = ctx.state.ui;
      if (focusItem === id) ctx.updateUi({ focusItem: null, focusOffset: null });
      if (focusBlock === id) ctx.updateUi({ focusBlock: null });
    },
    ...blockActions(ctx),
    ...boards,
    ...gestureActions(ctx),
    ...checklistActions(ctx),
    ...formatActions(ctx),
  };
}
