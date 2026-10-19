import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import type { TodoCard } from '../src/model/types';
import { readWorkspace } from '../src/model/workspace';
import type { Snapshot } from './boards';
import { fakeFirestore } from './fakeFirestore';
import { ownDb } from './firestore';
import { serializeShare } from '../src/model/sharing';
import { ownRaw, sampleSnapshot, workBoard } from './sample';
import { saveChange } from './save';
import { createServer, type Write } from './server';

const noSaving: Write = async () => {
  throw new Error('not saving in this test');
};

async function connect(load: () => Promise<Snapshot> = async () => sampleSnapshot(), write = noSaving, deleteAllowed?: () => Promise<boolean>) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([createServer(load, write, { deleteAllowed }).connect(a), client.connect(b)]);
  return client;
}

const text = (r: unknown) => ((r as { content: { type: string; text: string }[] }).content[0]).text;

describe('the connector’s tools', () => {
  it('the read tools are read-only', async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name).sort()).toEqual(['list_boards', 'preview_delete', 'read_board']);
  });

  it('list_boards lists every board', async () => {
    const r = await (await connect()).callTool({ name: 'list_boards', arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('Home (id: home) [home board]');
    expect(text(r)).toContain('Trip (id: trip) [shared by Erika, read-only]');
  });

  it('read_board by name gives the outline', async () => {
    const r = await (await connect()).callTool({ name: 'read_board', arguments: { board: 'home' } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('### Checklist: Groceries (id: listGroceries)');
  });

  it('read_board with an unknown name is an error listing the boards', async () => {
    const r = await (await connect()).callTool({ name: 'read_board', arguments: { board: 'Nope' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/No board called "Nope"/);
  });

  it('read_board without a board is refused', async () => {
    const r = await (await connect()).callTool({ name: 'read_board', arguments: {} });
    expect(r.isError).toBe(true);
  });

  it('a failure reading Firestore comes back as an error message, not a crash', async () => {
    const client = await connect(async () => {
      throw new Error('Sign-in has expired. Run npm run mcp:login again.');
    });
    const r = await client.callTool({ name: 'list_boards', arguments: {} });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/mcp:login/);
  });
});

// ---------- changing boards (job B) ----------

function connectWithWrites(deleteAllowed?: () => Promise<boolean>) {
  const fs = fakeFirestore('me');
  fs.setOwn(ownRaw());
  const deps = { db: ownDb(async () => 'ID', 'me', fs.fetch), client: 'mcp-test', now: () => Date.UTC(2026, 9, 6, 12), wait: async () => {}, log: () => {}, memory: { lastEditAt: null } };
  const load = async () => ({ ...sampleSnapshot(), own: fs.own() });
  return { fs, client: connect(load, (edit, opts) => saveChange(deps, edit, opts), deleteAllowed) };
}

const items = (fs: ReturnType<typeof fakeFirestore>) => (readWorkspace(fs.own())!.ws.boards.home.cards.listGroceries as TodoCard).items;
const saves = (fs: ReturnType<typeof fakeFirestore>) => fs.calls.filter((c) => c.path === ':commit' && JSON.stringify(c.body).includes('documents/boards/me"')).length;

describe('the connector’s write tools', () => {
  it('offers the write tools, none marked destructive or read-only, and confirm_delete marked destructive', async () => {
    const { tools } = await (await connectWithWrites().client).listTools();
    const writes = ['add_checklist', 'add_column', 'add_items', 'add_note', 'create_board', 'edit_items', 'move_items', 'set_items_done'];
    expect(tools.map((t) => t.name).sort()).toEqual([...writes, 'confirm_delete', 'list_boards', 'preview_delete', 'read_board', 'sign_in', 'sign_out'].sort());
    for (const t of tools.filter((t) => writes.includes(t.name))) {
      expect(t.annotations?.destructiveHint, t.name).toBe(false);
      expect(t.annotations?.readOnlyHint, t.name).toBe(false);
    }
    const confirm = tools.find((t) => t.name === 'confirm_delete')!;
    expect([confirm.annotations?.destructiveHint, confirm.annotations?.readOnlyHint]).toEqual([true, false]);
  });

  it('add_items adds to a list and replies with a plain list of what changed', async () => {
    const { fs, client } = connectWithWrites();
    const r = await (await client).callTool({ name: 'add_items', arguments: { board: 'Home', list: 'Groceries', items: [{ text: 'Apples', due: '2026-10-09' }, { text: 'Small', under: 'iEggs' }] } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toMatch(/^Saved:\n- Added "Apples" \(id: \S+\) to Groceries\n- Added "Small" \(id: \S+\) to Groceries$/);
    expect(items(fs).at(-1)!.text).toBe('Apples');
    expect(items(fs).some((i) => 'due' in i)).toBe(false); // due dates are gone: one given is ignored
  });

  it('edit_items, set_items_done and move_items change items by id', async () => {
    const { fs, client } = connectWithWrites();
    const c = await client;
    expect(text(await c.callTool({ name: 'edit_items', arguments: { board: 'home', changes: [{ item: 'iEggs', text: 'Eggs (6)', due: '2026-10-08' }] } }))).toContain('Changed "Eggs" to "Eggs (6)"');
    expect(text(await c.callTool({ name: 'set_items_done', arguments: { board: 'home', items: ['iMilk'], done: true } }))).toContain('Ticked "Milk"');
    expect(text(await c.callTool({ name: 'move_items', arguments: { board: 'home', items: ['iBread'], to: { list: 'Groceries', before: 'iEggs' } } }))).toContain('Moved "Bread" to Groceries');
    expect(items(fs).map((i) => [i.id, i.text, i.done, 'due' in i])).toEqual([
      ['iMilk', 'Milk', true, false],
      ['iBread', 'Bread', true, false],
      ['iEggs', 'Eggs (6)', false, false],
    ]);
  });

  it('add_note adds a note to a column', async () => {
    const { fs, client } = connectWithWrites();
    const r = await (await client).callTool({ name: 'add_note', arguments: { board: 'home', text: 'Ring Sam', column: 'Ideas' } });
    expect(text(r)).toMatch(/Added a note \(id: \S+\) to the column Ideas: "Ring Sam"/);
    expect(readWorkspace(fs.own())!.ws.boards.home.columns.colIdeas.cardIds).toHaveLength(2);
  });

  it('a shared board is read-only: refused, nothing saved', async () => {
    const { fs, client } = connectWithWrites();
    const r = await (await client).callTool({ name: 'add_items', arguments: { board: 'Trip', list: 'Bookings', items: [{ text: 'Flights' }] } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/shared.*read-only/);
    expect(fs.calls.some((c) => c.path === ':commit')).toBe(false);
  });

  it('a board that is in a share is read-only even while an old copy is still in the own boards', async () => {
    const fs = fakeFirestore('me');
    fs.setOwn(ownRaw());
    const snap = sampleSnapshot();
    // The owner just shared "Work": the share holds it, the own boards still have the old copy.
    const shared = { id: 'shareWork', owner: 'me', ownerName: 'you', mine: true, raw: serializeShare('work', { work: workBoard() }) };
    const client = await connect(async () => ({ ...snap, own: fs.own(), shares: [...snap.shares, shared] }), noSaving);
    const r = await client.callTool({ name: 'add_items', arguments: { board: 'work', list: 'Tasks', items: [{ text: 'x' }] } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/shared.*read-only/);
  });

  it('at most 50 changes in one call, and 5,000 characters per text', async () => {
    const { fs, client } = connectWithWrites();
    const c = await client;
    const many = Array.from({ length: 51 }, (_, i) => ({ text: `Item ${i}` }));
    expect((await c.callTool({ name: 'add_items', arguments: { board: 'home', list: 'Groceries', items: many } })).isError).toBe(true);
    expect((await c.callTool({ name: 'set_items_done', arguments: { board: 'home', items: Array(51).fill('iMilk'), done: true } })).isError).toBe(true);
    expect((await c.callTool({ name: 'move_items', arguments: { board: 'home', items: Array(51).fill('iMilk'), to: { list: 'Groceries' } } })).isError).toBe(true);
    expect((await c.callTool({ name: 'add_note', arguments: { board: 'home', text: 'x'.repeat(5001) } })).isError).toBe(true);
    expect((await c.callTool({ name: 'edit_items', arguments: { board: 'home', changes: [{ item: 'iMilk', text: 'x'.repeat(5001) }] } })).isError).toBe(true);
    expect(fs.calls.some((c) => c.path === ':commit')).toBe(false);
    expect((await c.callTool({ name: 'add_items', arguments: { board: 'home', list: 'Groceries', items: many.slice(0, 50) } })).isError).toBeFalsy();
    expect(saves(fs)).toBe(1);
  });

  it('an unknown board is an error listing the boards', async () => {
    const { client } = connectWithWrites();
    const r = await (await client).callTool({ name: 'add_note', arguments: { board: 'Nope', text: 'x' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/No board called "Nope"/);
  });
});

// ---------- making and deleting (job 110) ----------

const home = (fs: ReturnType<typeof fakeFirestore>) => readWorkspace(fs.own())!.ws.boards.home;
const allowed = async () => true;
const previewId = (r: unknown) => /Preview id: (\S+)\./.exec(text(r))![1];

describe('the connector’s making tools', () => {
  it('add_checklist and add_column add to the board', async () => {
    const { fs, client } = connectWithWrites();
    const c = await client;
    expect(text(await c.callTool({ name: 'add_checklist', arguments: { board: 'home', title: 'Packing', items: ['Socks'], column: 'Ideas' } }))).toMatch(/Added the checklist "Packing" \(id: \S+\) with 1 item to the column Ideas/);
    expect(text(await c.callTool({ name: 'add_column', arguments: { board: 'home', title: 'Later' } }))).toMatch(/Added the column "Later"/);
    const b = home(fs);
    expect(Object.values(b.columns).map((col) => col.title)).toContain('Later');
    expect(Object.values(b.cards).filter((k) => k.kind === "todo" && k.title === "Packing")).toHaveLength(1);
  });

  it('create_board makes a board inside another, or on its own; never inside a shared board', async () => {
    const { fs, client } = connectWithWrites();
    const c = await client;
    expect(text(await c.callTool({ name: 'create_board', arguments: { name: 'Garden', inside: 'Home' } }))).toMatch(/Made the board "Garden" \(id: \S+\) inside Home/);
    expect(text(await c.callTool({ name: 'create_board', arguments: { name: 'Side' } }))).toMatch(/Made the board "Side" \(id: \S+\), on its own/);
    const names = Object.values(readWorkspace(fs.own())!.ws.boards).map((b) => b.name);
    expect(names).toEqual(expect.arrayContaining(['Garden', 'Side']));
    const r = await c.callTool({ name: 'create_board', arguments: { name: 'X', inside: 'Trip' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/shared.*read-only/);
  });
});

describe('the connector’s safe delete', () => {
  it('off by default: preview and confirm are refused, telling Claude to ask the owner', async () => {
    const { fs, client } = connectWithWrites();
    const r = await (await client).callTool({ name: 'preview_delete', arguments: { board: 'home', things: ['noteCall'] } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Deleting is switched off.*ask the owner/s);
    expect(text(r)).not.toMatch(/delete-on/);
    expect(fs.calls.some((x) => x.path === ':commit')).toBe(false);
  });

  it('preview lists exactly what would go and changes nothing; confirm deletes it, after a backup version', async () => {
    const { fs, client } = connectWithWrites(allowed);
    const c = await client;
    const p = await c.callTool({ name: 'preview_delete', arguments: { board: 'Home', things: ['noteCall', 'iBread'] } });
    expect(p.isError).toBeFalsy();
    expect(text(p)).toMatch(/^This would delete \(nothing is deleted yet\):\n- the note "Call the bank" \(id: noteCall\) on Home\n- the item "Bread" \(id: iBread\) from Groceries on Home\n/);
    expect(fs.calls.some((x) => x.path === ':commit')).toBe(false);
    const r = await c.callTool({ name: 'confirm_delete', arguments: { preview: previewId(p) } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toMatch(/^Saved:\n- Deleted the note "Call the bank" \(id: noteCall\) on Home\n- Deleted the item "Bread"/);
    expect(text(r)).toMatch(/Version history/);
    expect(home(fs).cards.noteCall).toBeUndefined();
    expect(fs.versions()).toHaveLength(1);
    expect(fs.field(`boards/me/versionData/${fs.versions()[0]}`, 'data')).toBe(ownRaw());
  });

  it('a preview is used once; an unknown one is refused', async () => {
    const { client } = connectWithWrites(allowed);
    const c = await client;
    const p = await c.callTool({ name: 'preview_delete', arguments: { board: 'home', things: ['noteCall'] } });
    expect((await c.callTool({ name: 'confirm_delete', arguments: { preview: previewId(p) } })).isError).toBeFalsy();
    const again = await c.callTool({ name: 'confirm_delete', arguments: { preview: previewId(p) } });
    expect(again.isError).toBe(true);
    expect(text(again)).toMatch(/No preview with id/);
    expect((await c.callTool({ name: 'confirm_delete', arguments: { preview: 'made-up' } })).isError).toBe(true);
  });

  it('the board changed between preview and confirm: refused, nothing deleted', async () => {
    const { fs, client } = connectWithWrites(allowed);
    const c = await client;
    const p = await c.callTool({ name: 'preview_delete', arguments: { board: 'home', things: ['listGroceries'] } });
    await c.callTool({ name: 'add_items', arguments: { board: 'home', list: 'Groceries', items: [{ text: 'Apples' }] } });
    const r = await c.callTool({ name: 'confirm_delete', arguments: { preview: previewId(p) } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/changed since the preview/);
    expect(home(fs).cards.listGroceries).toBeDefined();
  });

  it('switched off between preview and confirm: refused, nothing deleted', async () => {
    let on = true;
    const { fs, client } = connectWithWrites(async () => on);
    const c = await client;
    const p = await c.callTool({ name: 'preview_delete', arguments: { board: 'home', things: ['noteCall'] } });
    on = false;
    const r = await c.callTool({ name: 'confirm_delete', arguments: { preview: previewId(p) } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/switched off/);
    expect(home(fs).cards.noteCall).toBeDefined();
    // Switched on again, the same preview still works: a refusal doesn't use it up.
    on = true;
    expect((await c.callTool({ name: 'confirm_delete', arguments: { preview: previewId(p) } })).isError).toBeFalsy();
    expect(home(fs).cards.noteCall).toBeUndefined();
  });

  it('a preview works for 10 minutes only', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { fs, client } = connectWithWrites(allowed);
      const c = await client;
      const p = await c.callTool({ name: 'preview_delete', arguments: { board: 'home', things: ['noteCall'] } });
      vi.setSystemTime(Date.now() + 10 * 60_000 + 1);
      const r = await c.callTool({ name: 'confirm_delete', arguments: { preview: previewId(p) } });
      expect(r.isError).toBe(true);
      expect(text(r)).toMatch(/older than 10 minutes/);
      expect(home(fs).cards.noteCall).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the app saving the deleted things back: said so, and still points to the backup in Version history', async () => {
    const { fs, client } = connectWithWrites(allowed);
    const c = await client;
    const p = await c.callTool({ name: 'preview_delete', arguments: { board: 'home', things: ['noteCall'] } });
    fs.hooks.afterCommit = (n) => {
      if (n === 2) fs.setOwn(ownRaw());
    };
    const r = await c.callTool({ name: 'confirm_delete', arguments: { preview: previewId(p) } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/not deleted again[\s\S]*Version history/);
  });

  it('never on a shared board, and at most 20 things per call', async () => {
    const { fs, client } = connectWithWrites(allowed);
    const c = await client;
    const shared = await c.callTool({ name: 'preview_delete', arguments: { board: 'Trip', things: ['listTrip'] } });
    expect(shared.isError).toBe(true);
    expect(text(shared)).toMatch(/shared.*read-only/);
    expect((await c.callTool({ name: 'preview_delete', arguments: { board: 'home', things: Array.from({ length: 21 }, (_, i) => `x${i}`) } })).isError).toBe(true);
    expect((await c.callTool({ name: 'preview_delete', arguments: { board: 'home', things: [] } })).isError).toBe(true);
    expect(fs.calls.some((x) => x.path === ':commit')).toBe(false);
  });

  it('never a top-level board (Work is opened from Home, so it is inside it; Home itself never)', async () => {
    const { client } = connectWithWrites(allowed);
    const c = await client;
    const r = await c.callTool({ name: 'preview_delete', arguments: { board: 'home', things: ['home'] } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/home board/);
  });
});

describe('sign_in and sign_out', () => {
  async function withSignIn(signIn?: () => Promise<string>, signOut?: () => Promise<string>) {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1' });
    await Promise.all([createServer(async () => sampleSnapshot(), noSaving, { signIn, signOut }).connect(a), client.connect(b)]);
    return client;
  }

  it('sign_in answers with what the sign-in helper says, and never reads the boards', async () => {
    const signIn = vi.fn(async () => 'A sign-in page opened: http://localhost:1/?n=x');
    const r = await (await withSignIn(signIn)).callTool({ name: 'sign_in', arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toBe('A sign-in page opened: http://localhost:1/?n=x');
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('sign_out answers with what the helper says', async () => {
    const r = await (await withSignIn(undefined, async () => 'Signed out.')).callTool({ name: 'sign_out', arguments: {} });
    expect(text(r)).toBe('Signed out.');
  });

  it('a failure starting the sign-in is a plain error', async () => {
    const r = await (await withSignIn(async () => { throw new Error('No free port'); })).callTool({ name: 'sign_in', arguments: {} });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('No free port');
  });

  it('neither changes boards nor is marked read-only or destructive', async () => {
    const { tools } = await (await withSignIn()).listTools();
    for (const name of ['sign_in', 'sign_out']) {
      const t = tools.find((x) => x.name === name);
      expect(t?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    }
  });
});
