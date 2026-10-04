import { describe, expect, it } from 'vitest';
import { readBoard } from '../model/persist';
import { KEEP_VERSIONS, VERSION_GAP_MS } from '../model/versions';
import { createStore } from './store';
import { localVersionStore, restoreVersion, startVersions } from './versions';

// Version history (owner request): the board as it was is saved when editing starts after a quiet spell.

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

async function settled() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup() {
  const store = createStore(null, (fn) => fn());
  const versions = localVersionStore(memory());
  const clock = { now: new Date(2026, 9, 4, 9, 0).getTime() };
  const recorder = startVersions(store, versions, { now: () => clock.now });
  return { store, versions, clock, recorder };
}

describe('saving versions', () => {
  it('the first change saves the board as it was just before it', async () => {
    const { store, versions } = setup();
    store.renameBoard('Before');
    await settled();
    store.renameBoard('After');
    await settled();
    const list = await versions.list();
    expect(list).toHaveLength(1);
    expect(readBoard(await versions.get(list[0].id))?.name).toBe('My first board');
  });

  it('no new version while editing carries on; one after a 10-minute quiet spell', async () => {
    const { store, versions, clock } = setup();
    store.renameBoard('One');
    await settled();
    clock.now += VERSION_GAP_MS - 1000;
    store.renameBoard('Two');
    await settled();
    expect(await versions.list()).toHaveLength(1);
    clock.now += VERSION_GAP_MS;
    store.renameBoard('Three');
    await settled();
    const list = await versions.list();
    expect(list).toHaveLength(2);
    // Newest first: the board just before "Three".
    expect(readBoard(await versions.get(list[0].id))?.name).toBe('Two');
  });

  it("a change from another device doesn't save a version (that device saves its own)", async () => {
    const { store, versions } = setup();
    store.replaceBoard({ ...store.getState().board, name: 'From the phone' });
    await settled();
    expect(await versions.list()).toHaveLength(0);
  });

  it(`keeps the newest ${KEEP_VERSIONS}`, async () => {
    const { store, versions, clock } = setup();
    for (let i = 0; i < KEEP_VERSIONS + 2; i++) {
      clock.now += VERSION_GAP_MS;
      store.renameBoard(`Name ${i}`);
      await settled();
    }
    expect(await versions.list()).toHaveLength(KEEP_VERSIONS);
  });
});

describe('looking at and restoring a version', () => {
  it('previewing shows the old board without touching the real one, and edits are refused meanwhile', async () => {
    const { store, versions } = setup();
    store.renameBoard('Old');
    await settled();
    store.renameBoard('New');
    await settled();
    const [v] = await versions.list();
    store.previewVersion(v, readBoard(await versions.get(v.id))!);
    expect(store.getState().ui.preview?.board.name).toBe('My first board');
    expect(store.getState().board.name).toBe('New');
    store.renameBoard('Typed while looking');
    expect(store.getState().board.name).toBe('New');
    store.endPreview();
    expect(store.getState().ui.preview).toBeNull();
  });

  it('restoring saves the current board as a version first, and can be undone', async () => {
    const { store, versions, clock } = setup();
    store.renameBoard('Old');
    await settled();
    store.renameBoard('New');
    await settled();
    const [v] = await versions.list();
    clock.now += 60_000;
    await restoreVersion(store, versions, v.id, () => clock.now);
    expect(store.getState().board.name).toBe('My first board');
    expect(store.getState().ui.preview).toBeNull();
    const list = await versions.list();
    expect(list).toHaveLength(2);
    expect(readBoard(await versions.get(list[0].id))?.name).toBe('New');
    // The restore itself doesn't save the same version again.
    await settled();
    expect(await versions.list()).toHaveLength(2);
    store.undo();
    expect(store.getState().board.name).toBe('New');
  });
});
