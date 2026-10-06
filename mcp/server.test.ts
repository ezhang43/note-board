import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from './boards';
import { sampleSnapshot } from './sample';
import { createServer } from './server';

async function connect(load: () => Promise<Snapshot> = async () => sampleSnapshot()) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([createServer(load).connect(a), client.connect(b)]);
  return client;
}

const text = (r: unknown) => ((r as { content: { type: string; text: string }[] }).content[0]).text;

describe('the connector’s tools', () => {
  it('offers only list_boards and read_board, both read-only', async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['list_boards', 'read_board']);
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
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
