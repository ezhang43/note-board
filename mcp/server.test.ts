import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import type { TodoCard } from '../src/model/types';
import { readWorkspace } from '../src/model/workspace';
import type { Snapshot } from './boards';
import { fakeFirestore } from './fakeFirestore';
import { ownDb } from './firestore';
import { ownRaw, sampleSnapshot } from './sample';
import { saveChange } from './save';
import { createServer, type Write } from './server';

const noSaving: Write = async () => {
  throw new Error('not saving in this test');
};

async function connect(load: () => Promise<Snapshot> = async () => sampleSnapshot(), write = noSaving) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([createServer(load, write).connect(a), client.connect(b)]);
  return client;
}

const text = (r: unknown) => ((r as { content: { type: string; text: string }[] }).content[0]).text;

describe('the connector’s tools', () => {
  it('the read tools are read-only', async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name).sort()).toEqual(['list_boards', 'read_board']);
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

function connectWithWrites() {
  const fs = fakeFirestore('me');
  fs.setOwn(ownRaw());
  const deps = { db: ownDb(async () => 'ID', 'me', fs.fetch), client: 'mcp-test', now: () => Date.UTC(2026, 9, 6, 12), wait: async () => {}, log: () => {}, memory: { lastEditAt: null } };
  const load = async () => ({ ...sampleSnapshot(), own: fs.own() });
  return { fs, client: connect(load, (edit) => saveChange(deps, edit)) };
}

const items = (fs: ReturnType<typeof fakeFirestore>) => (readWorkspace(fs.own())!.ws.boards.home.cards.listGroceries as TodoCard).items;
const saves = (fs: ReturnType<typeof fakeFirestore>) => fs.calls.filter((c) => c.path === ':commit' && JSON.stringify(c.body).includes('documents/boards/me"')).length;

describe('the connector’s write tools', () => {
  it('offers the five write tools, none marked destructive or read-only', async () => {
    const { tools } = await (await connectWithWrites().client).listTools();
    const writes = ['add_items', 'add_note', 'edit_items', 'move_items', 'set_items_done'];
    expect(tools.map((t) => t.name).sort()).toEqual(['add_items', 'add_note', 'edit_items', 'list_boards', 'move_items', 'read_board', 'set_items_done']);
    for (const t of tools.filter((t) => writes.includes(t.name))) {
      expect(t.annotations?.destructiveHint, t.name).toBe(false);
      expect(t.annotations?.readOnlyHint, t.name).toBe(false);
    }
  });

  it('add_items adds to a list and replies with a plain list of what changed', async () => {
    const { fs, client } = connectWithWrites();
    const r = await (await client).callTool({ name: 'add_items', arguments: { board: 'Home', list: 'Groceries', items: [{ text: 'Apples', due: '2026-10-09' }, { text: 'Small', under: 'iEggs' }] } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toMatch(/^Saved:\n- Added "Apples" \(id: \S+, due 2026-10-09\) to Groceries\n- Added "Small" \(id: \S+\) to Groceries$/);
    expect(items(fs).at(-1)!.text).toBe('Apples');
  });

  it('edit_items, set_items_done and move_items change items by id', async () => {
    const { fs, client } = connectWithWrites();
    const c = await client;
    expect(text(await c.callTool({ name: 'edit_items', arguments: { board: 'home', changes: [{ item: 'iEggs', text: 'Eggs (6)', due: '2026-10-08' }] } }))).toContain('Changed "Eggs" to "Eggs (6)"');
    expect(text(await c.callTool({ name: 'set_items_done', arguments: { board: 'home', items: ['iMilk'], done: true } }))).toContain('Ticked "Milk"');
    expect(text(await c.callTool({ name: 'move_items', arguments: { board: 'home', items: ['iBread'], to: { list: 'Groceries', before: 'iEggs' } } }))).toContain('Moved "Bread" to Groceries');
    expect(items(fs).map((i) => [i.id, i.text, i.done, i.due])).toEqual([
      ['iMilk', 'Milk', true, '2026-10-07'],
      ['iBread', 'Bread', true, undefined],
      ['iEggs', 'Eggs (6)', false, '2026-10-08'],
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
