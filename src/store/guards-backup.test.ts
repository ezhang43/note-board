import { describe, expect, it } from 'vitest';
import { serializeBoard } from '../model/persist';
import type { VersionStore } from './versions';
import { createStore } from './store';
import { localVersionStore, restoreFromBackup } from './versions';

// Restoring from a backup file (review pass, job 156). Both tests pass today.

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

describe('restoring a backup made before there were several boards', () => {
  it('with several boards here, replaces only the open board, and Ctrl+Z undoes it', async () => {
    const store = createStore(null, (fn) => fn());
    const home = store.getState().boards.home;
    store.renameBoard('Home');
    const second = store.newBoard();
    store.renameBoard('Second');
    store.openBoard(home);
    const legacy = serializeBoard({ ...store.getState().board, name: 'From file' });

    expect(store.isFullBackup(legacy)).toBe(false);
    await restoreFromBackup(store, localVersionStore(memory()), legacy);

    expect(store.getState().board.name).toBe('From file');
    expect(store.boardName(second)).toBe('Second');
    store.undo();
    expect(store.getState().board.name).toBe('Home');
  });

  it('a one-board restore still goes ahead when its safety copy cannot be saved, and Ctrl+Z brings the old board back', async () => {
    const failing: VersionStore = {
      list: async () => [],
      get: async () => null,
      save: async () => {
        throw new Error('quota');
      },
      remove: async () => {},
    };
    const store = createStore(null, (fn) => fn());
    store.renameBoard('Mine');
    const backup = serializeBoard({ ...store.getState().board, name: 'Old' });
    await restoreFromBackup(store, failing, backup);
    expect(store.getState().board.name).toBe('Old');
    store.undo();
    expect(store.getState().board.name).toBe('Mine');
  });
});
