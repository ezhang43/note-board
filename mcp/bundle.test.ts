import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, expect, it } from 'vitest';

// Smoke test of npm run mcp:build: the built connector starts and answers. This catches bundling
// breaks (the sign-in page, the SDK's imports) that nothing else builds. About 10 seconds.

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
let out = '';
let home = '';
let client: Client | null = null;

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), 'busyants-build-'));
  // A temp folder as the sign-in folder, so the real one is never touched.
  home = await mkdtemp(join(tmpdir(), 'busyants-home-'));
  execFileSync('npx', ['vite', 'build', '--config', 'mcp/vite.config.ts', '--outDir', out, '--emptyOutDir', '--logLevel', 'warn'], { stdio: 'pipe', env: { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' } });
}, 120_000);

afterAll(async () => {
  await client?.close();
  await rm(out, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

it('the built server starts, lists the manifest’s tools and says "Not signed in" with no sign-in', async () => {
  client = new Client({ name: 'test', version: '1' });
  await client.connect(new StdioClientTransport({ command: 'node', args: [join(out, 'server.js')], env: { PATH: process.env.PATH ?? '', APPDATA: home }, stderr: 'pipe' }));
  const { tools } = await client.listTools();
  expect(tools).toHaveLength(14);
  expect(tools.map((t) => t.name).sort()).toEqual(manifest.tools.map((t: { name: string }) => t.name).sort());
  expect(client.getServerVersion()).toMatchObject({ name: 'busyants', version: manifest.version });
  const r = await client.callTool({ name: 'list_boards', arguments: {} });
  expect(r.isError).toBe(true);
  expect((r.content as { text: string }[])[0].text).toMatch(/^Not signed in\./);
}, 120_000);
