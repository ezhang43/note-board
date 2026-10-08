import { describe, expect, it } from 'vitest';
import { addCard } from '../src/model/board';
import { createCard } from '../src/model/cards';
import { findItem } from '../src/model/checklist';
import { serializeBoard } from '../src/model/persist';
import type { NoteCard, TodoCard } from '../src/model/types';
import { contentHash, VERSION_GAP_MS } from '../src/model/versions';
import { readWorkspace, serializeWorkspace } from '../src/model/workspace';
import { addItems, type Edit } from './edits';
import { fakeFirestore } from './fakeFirestore';
import { ownDb } from './firestore';
import { homeBoard, ownRaw } from './sample';
import { MAX_SAVE, PUT_BACK_MS, saveChange } from './save';

// Saving the connector's changes: never over changes it hasn't seen, a safety version first,
// and checking a moment later that the app didn't save over it.

function setup(raw: string | null = ownRaw()) {
  const fs = fakeFirestore('me');
  if (raw != null) fs.setOwn(raw);
  let clock = Date.UTC(2026, 9, 6, 12);
  const log: string[] = [];
  const waited: number[] = [];
  const memory = { lastEditAt: null as number | null };
  const deps = {
    db: ownDb(async () => 'ID', 'me', fs.fetch),
    client: 'mcp-test',
    now: () => clock,
    wait: async (ms: number) => {
      waited.push(ms);
    },
    log: (line: string) => {
      log.push(line);
    },
    memory,
  };
  return { fs, deps, log, waited, memory, advance: (ms: number) => (clock += ms) };
}

const addApples = (id = 'n1') => addItems('home', 'Groceries', [{ text: 'Apples' }], [id]);
const groceries = (raw: string | null) => (readWorkspace(raw)!.ws.boards.home.cards.listGroceries as TodoCard).items;
const count = (raw: string | null, id: string) => (raw?.match(new RegExp(`"id":"${id}"`, 'g')) ?? []).length;
const boardCommits = (fs: ReturnType<typeof fakeFirestore>) => fs.calls.filter((c) => c.path === ':commit' && JSON.stringify(c.body).includes('documents/boards/me"'));

describe('saving a change', () => {
  it('saves the boards with the connector’s client name and the server’s time, and lists what changed', async () => {
    const { fs, deps } = setup();
    const r = await saveChange(deps, addApples());
    expect(r.isError).toBeFalsy();
    expect(r.text).toBe('Saved:\n- Added "Apples" (id: n1) to Groceries');
    expect(groceries(fs.own()).at(-1)!.text).toBe('Apples');
    expect(fs.field('boards/me', 'client')).toBe('mcp-test');
    expect(fs.field('boards/me', 'updatedAt')).toMatch(/^2026-10-06T/);
    // Only data, client and updatedAt, as firestore.rules allow.
    expect(Object.keys(fs.docs.get('boards/me')!.fields).sort()).toEqual(['client', 'data', 'updatedAt']);
  });

  it('saves under the condition that nothing changed since it read (updateTime precondition)', async () => {
    const { fs, deps } = setup();
    const before = fs.docs.get('boards/me')!.updateTime;
    await saveChange(deps, addApples());
    const write = (boardCommits(fs)[0].body as { writes: { currentDocument: unknown }[] }).writes[0];
    expect(write.currentDocument).toEqual({ updateTime: before });
  });

  it('when the app saved in between, reads again and makes the change on top (nothing of the app’s is lost)', async () => {
    const { fs, deps } = setup();
    fs.hooks.beforeCommit = (n) => {
      if (n === 2) fs.setOwn(serializeWorkspace({ home: 'home', boards: { home: { ...homeBoard(), name: 'Home (renamed in the app)' }, work: readWorkspace(ownRaw())!.ws.boards.work } }));
    };
    const r = await saveChange(deps, addApples());
    expect(r.isError).toBeFalsy();
    const ws = readWorkspace(fs.own())!.ws;
    expect(ws.boards.home.name).toBe('Home (renamed in the app)');
    expect(count(fs.own(), 'n1')).toBe(1);
    expect(boardCommits(fs)).toHaveLength(2);
  });

  it('gives up after 3 retries, saving nothing', async () => {
    const { fs, deps } = setup();
    let n = 0;
    fs.hooks.beforeCommit = () => fs.setOwn(ownRaw().replace('"Home"', `"Home ${++n}"`));
    const r = await saveChange(deps, addApples());
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/kept changing/);
    expect(boardCommits(fs)).toHaveLength(4);
    expect(count(fs.own(), 'n1')).toBe(0);
  });

  it('nothing to change: nothing is saved, no version', async () => {
    const { fs, deps } = setup();
    const same: Edit = (ws) => ({ ws, changed: [] });
    const r = await saveChange(deps, same);
    expect(r.text).toMatch(/Nothing changed/);
    expect(fs.calls.filter((c) => c.method === 'POST' && c.path === ':commit')).toHaveLength(0);
  });

  it('an edit’s error is returned and nothing is saved', async () => {
    const { fs, deps } = setup();
    const r = await saveChange(deps, addItems('home', 'Nope', [{ text: 'x' }], ['n']));
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/No checklist called "Nope"/);
    expect(fs.calls.some((c) => c.path === ':commit')).toBe(false);
  });

  it('never deletes anything in Firestore', async () => {
    const { fs, deps } = setup();
    await saveChange(deps, addApples());
    expect(fs.calls.some((c) => c.method === 'DELETE' || JSON.stringify(c.body ?? '').includes('"delete"'))).toBe(false);
  });

  it('writes plain lines to the activity log', async () => {
    const { deps, log } = setup();
    await saveChange(deps, addApples());
    expect(log).toEqual(['Saved: Added "Apples" (id: n1) to Groceries']);
  });
});

describe('refusing to save', () => {
  it('nothing saved online yet', async () => {
    const { fs, deps } = setup(null);
    const r = await saveChange(deps, addApples());
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/nothing is saved online yet/);
    expect(fs.calls.some((c) => c.path === ':commit')).toBe(false);
  });

  it('boards saved by an older version of the app (a single board)', async () => {
    const { fs, deps } = setup(serializeBoard(homeBoard()));
    const r = await saveChange(deps, addApples());
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/older version/);
    expect(fs.calls.some((c) => c.path === ':commit')).toBe(false);
  });

  it('boards from a newer app (data this connector doesn’t know)', async () => {
    const newer = JSON.parse(ownRaw());
    newer.boards.home.someNewThing = { x: 1 };
    const { fs, deps } = setup(JSON.stringify(newer));
    const r = await saveChange(deps, addApples());
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/newer version/);
    expect(fs.calls.some((c) => c.path === ':commit')).toBe(false);
  });

  it('a save over 900,000 characters', async () => {
    const { fs, deps } = setup();
    const huge: Edit = (ws) => {
      const note = { ...(createCard('note', 'big') as NoteCard), text: 'x'.repeat(MAX_SAVE) };
      return { ws: { ...ws, boards: { ...ws.boards, home: addCard(ws.boards.home, note, { type: 'loose', x: 0, y: 2000 }) } }, changed: ['big'] };
    };
    const r = await saveChange(deps, huge);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/too big/);
    expect(fs.calls.some((c) => c.path === ':commit')).toBe(false);
  });

  it('a change that would break a board’s "every card in one place" rule', async () => {
    const { fs, deps } = setup();
    const broken: Edit = (ws) => ({ ws: { ...ws, boards: { ...ws.boards, home: { ...ws.boards.home, order: [...ws.boards.home.order, 'ghost'] } } }, changed: ['x'] });
    const r = await saveChange(deps, broken);
    expect(r.isError).toBe(true);
    expect(fs.calls.some((c) => c.path === ':commit')).toBe(false);
  });
});

describe('the safety version', () => {
  it('is saved before the first change: the boards as they were, board text written before the list entry', async () => {
    const { fs, deps } = setup();
    await saveChange(deps, addApples());
    const [id] = fs.versions();
    expect(fs.field(`boards/me/versionData/${id}`, 'data')).toBe(ownRaw());
    expect(fs.field(`boards/me/versions/${id}`, 'hash')).toBe(contentHash(ownRaw()));
    expect(fs.field(`boards/me/versions/${id}`, 'savedAt')).toBe(String(deps.now()));
    expect(fs.field(`boards/me/versions/${id}`, 'cards')).toBe(String(Object.keys(homeBoard().cards).length + 1));
    expect(fs.field(`boards/me/versions/${id}`, 'boards')).toBe('2');
    const commits = fs.calls.filter((c) => c.path === ':commit');
    const names = (commits[0].body as { writes: { update: { name: string }; currentDocument: unknown }[] }).writes.map((w) => w.update.name.split('/').slice(-2, -1)[0]);
    expect(names).toEqual(['versionData', 'versions']);
    // Never over an existing version.
    expect((commits[0].body as { writes: { currentDocument: unknown }[] }).writes.every((w) => JSON.stringify(w.currentDocument) === '{"exists":false}')).toBe(true);
    expect(commits.indexOf(boardCommits(fs)[0])).toBe(1);
  });

  it('once: further changes within 10 quiet minutes save none; after 10 quiet minutes, one more', async () => {
    const { fs, deps, advance } = setup();
    await saveChange(deps, addApples('n1'));
    advance(60_000);
    await saveChange(deps, addApples('n2'));
    expect(fs.versions()).toHaveLength(1);
    advance(VERSION_GAP_MS);
    await saveChange(deps, addApples('n3'));
    expect(fs.versions()).toHaveLength(2);
  });

  it('is not saved again when the newest version already holds these boards (contentHash)', async () => {
    const { fs, deps } = setup();
    fs.addVersion('old', deps.now() - 1000, contentHash(ownRaw()));
    await saveChange(deps, addApples());
    expect(fs.versions()).toEqual(['old']);
    expect(count(fs.own(), 'n1')).toBe(1);
  });

  it('a version the app saved recently still doesn’t stop the first one (the boards may have changed since)', async () => {
    const { fs, deps } = setup();
    fs.addVersion('old', deps.now() - 1000, 'other-hash');
    await saveChange(deps, addApples());
    expect(fs.versions()).toHaveLength(2);
  });

  it('if it can’t be saved, the change isn’t made', async () => {
    const { fs, deps } = setup();
    const real = fs.fetch;
    fs.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
      String(init?.body ?? '').includes('versionData') ? new Response('{"error":{"code":403,"status":"PERMISSION_DENIED"}}', { status: 403 }) : real(input, init)) as typeof fetch;
    deps.db = ownDb(async () => 'ID', 'me', fs.fetch);
    const r = await saveChange(deps, addApples());
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/safety version/);
    expect(count(fs.own(), 'n1')).toBe(0);
  });
});

describe('the put-back check', () => {
  it('reads again a few seconds after saving; a change still there is left alone', async () => {
    const { fs, deps, waited } = setup();
    const r = await saveChange(deps, addApples());
    expect(waited).toEqual([PUT_BACK_MS]);
    expect(boardCommits(fs)).toHaveLength(1);
    expect(r.text).not.toMatch(/put back/);
  });

  it('the app saving over the change: it is put back once, with the same ids, never twice', async () => {
    const { fs, deps, log } = setup();
    fs.hooks.afterCommit = (n) => {
      // The app, which hadn't seen the change, saves its own copy over it.
      if (n === 2) fs.setOwn(ownRaw().replace('"Home"', '"Home!"'));
    };
    const r = await saveChange(deps, addApples());
    expect(r.isError).toBeFalsy();
    expect(r.text).toMatch(/put it back/);
    expect(count(fs.own(), 'n1')).toBe(1);
    expect(readWorkspace(fs.own())!.ws.boards.home.name).toBe('Home!');
    expect(boardCommits(fs)).toHaveLength(2);
    expect(log.at(-1)).toMatch(/put back/i);
  });

  it('the owner changing the board so the change no longer applies (list deleted): said plainly, not put back', async () => {
    const { fs, deps } = setup();
    fs.hooks.afterCommit = (n) => {
      if (n === 2) {
        const ws = readWorkspace(fs.own())!.ws;
        const home = ws.boards.home;
        const { listGroceries: _gone, ...cards } = home.cards;
        const columns = { ...home.columns, colTodo: { ...home.columns.colTodo, cardIds: home.columns.colTodo.cardIds.filter((id) => id !== 'listGroceries') } };
        fs.setOwn(serializeWorkspace({ ...ws, boards: { ...ws.boards, home: { ...home, cards, columns } } }));
      }
    };
    const r = await saveChange(deps, addApples());
    expect(r.isError).toBeFalsy();
    expect(r.text).toMatch(/^Saved:[\s\S]*changed in BusyAnts since[\s\S]*No checklist called "Groceries"/);
    expect(r.text).not.toMatch(/saved over/);
    expect(boardCommits(fs)).toHaveLength(1);
  });

  it('reading back failing (offline) still says it was saved', async () => {
    const { fs, deps } = setup();
    const real = fs.fetch;
    let saved = false;
    fs.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (saved && (init?.method ?? 'GET') === 'GET') return new Response('{}', { status: 503 });
      const r = await real(input, init);
      if (String(init?.body ?? '').includes('documents/boards/me"')) saved = true;
      return r;
    }) as typeof fetch;
    deps.db = ownDb(async () => 'ID', 'me', fs.fetch);
    const r = await saveChange(deps, addApples());
    expect(r.isError).toBeFalsy();
    expect(r.text).toMatch(/^Saved:\n- Added "Apples"[\s\S]*couldn’t be checked/);
  });

  it('saved over again after putting it back: reported, not tried a third time', async () => {
    const { fs, deps } = setup();
    fs.hooks.afterCommit = (n) => {
      if (n >= 2) fs.setOwn(ownRaw());
    };
    const r = await saveChange(deps, addApples());
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/isn’t on the board now/);
    expect(boardCommits(fs)).toHaveLength(2);
    expect(findItem(groceries(fs.own()), 'n1')).toBeNull();
  });
});
