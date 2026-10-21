import type { StorageLike } from '../model/persist';
import { HOTKEYS_KEY, startingHotkeys } from '../model/hotkeys';
import { COLOR_THEME_KEY, startingColorTheme } from '../model/theme';
import { blockActions } from './actions/blocks';
import { boardActions } from './actions/boards';
import { checklistActions } from './actions/checklist';
import { formatActions } from './actions/format';
import { gestureActions } from './actions/gestures';
import { weightActions } from './actions/weight';
import { habitColorActions } from './actions/habitColor';
import { announce } from './announce';
import { createCore } from './core';
import { later, type Schedule } from './env';

// The single store: one state object (board data, view, ui), changed only through its actions.
// The core (core.ts) holds the state, saving and undo; the actions live in ./actions/ by topic.

export type * from './types';
export { BOARD_SAVE_DELAY, VIEW_SAVE_DELAY } from './core';
export { COMPLETE_ARRIVE_MS, COMPLETE_LEAVE_MS } from './actions/checklist';
export { EXPAND_WATCH_MS, IMPORT_TOP_MARGIN } from './actions/blocks';

export type Store = ReturnType<typeof createStore>;

function saved(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null; // Storage blocked: the defaults (Honey, the usual keys).
  }
}

export function createStore(storage: StorageLike | null, schedule: Schedule = later) {
  const { ctx, api } = createCore(storage, schedule);
  // The color theme is a per-device setting like light / dark, started from what this device saved.
  ctx.updateView((v) => ({ ...v, colorTheme: startingColorTheme(saved(storage, COLOR_THEME_KEY)), hotkeys: startingHotkeys(saved(storage, HOTKEYS_KEY)) }));
  const boards = boardActions(ctx);
  /** Undo or redo, told to screen readers when it changed the board. */
  const step = (which: 'undo' | 'redo') => () => {
    const before = ctx.state.board;
    api[which]();
    if (ctx.state.board !== before) announce(which === 'undo' ? 'Undid the last change' : 'Redid the last change');
  };
  return {
    ...api,
    undo: step('undo'),
    redo: step('redo'),
    /** The checklist item or new block that was asked to take the cursor has taken it. */
    focusTaken: (id: string) => {
      const { focusItem, focusBlock } = ctx.state.ui;
      if (focusItem === id) ctx.updateUi({ focusItem: null, focusOffset: null });
      if (focusBlock === id) ctx.updateUi({ focusBlock: null });
    },
    ...blockActions(ctx),
    ...boards,
    ...weightActions(ctx, boards.habitsBoard),
    ...habitColorActions(ctx, boards.habitsBoard),
    ...gestureActions(ctx),
    ...checklistActions(ctx),
    ...formatActions(ctx),
  };
}
