import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { sampleSnapshot } from './sample';
import { createServer } from './server';

// The one-file install for Claude Desktop (an MCP Bundle, .mcpb; spec: MANIFEST.md 0.3 in
// github.com/modelcontextprotocol/mcpb). npm run mcp:pack puts manifest.json, the built server and
// the icon in one file; these tests keep the manifest true to the server.

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');

async function server() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([createServer(async () => sampleSnapshot(), async () => ({ text: '' })).connect(a), client.connect(b)]);
  return client;
}

describe('the Claude Desktop bundle’s manifest', () => {
  it('has the required fields, for a Node server run from the bundle’s own folder', () => {
    expect(manifest.manifest_version).toBe('0.3');
    expect(manifest.name).toBe('busyants');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description).toBeTruthy();
    expect(manifest.author.name).toBeTruthy();
    expect(manifest.server).toEqual({
      type: 'node',
      entry_point: 'server/server.js',
      mcp_config: { command: 'node', args: ['${__dirname}/server/server.js'] },
    });
  });

  it('runs on Mac and Windows, with the Node the bundled server needs', () => {
    expect(manifest.compatibility.platforms).toEqual(['darwin', 'win32']);
    expect(manifest.compatibility.runtimes).toEqual({ node: '>=20.0.0' });
  });

  it('has the same version as the server, and lists exactly the server’s tools', async () => {
    const client = await server();
    expect(client.getServerVersion()?.version).toBe(manifest.version);
    const { tools } = await client.listTools();
    expect(manifest.tools.map((t: { name: string }) => t.name).sort()).toEqual(tools.map((t) => t.name).sort());
  });

  it('asks for nothing at install: sign-in happens in the browser, deleting stays off', () => {
    expect(manifest.user_config).toBeUndefined();
    expect(manifest.server.mcp_config.env).toBeUndefined();
  });

  it('the README has a table row for every tool', () => {
    for (const t of manifest.tools as { name: string }[]) expect(readme, t.name).toContain(`| \`${t.name}\` |`);
  });

  it('names the privacy policy, as the spec asks of a connector to an online service', () => {
    expect(manifest.privacy_policies).toEqual(['https://ezhang43.github.io/note-board/privacy/']);
  });

  it('neither the manifest nor the README holds anyone’s own folders or email', () => {
    for (const text of [JSON.stringify(manifest), readme]) {
      expect(text).not.toMatch(/[A-Za-z]:\\\\?Users\\\\?[A-Za-z]/);
      expect(text).not.toMatch(/\/Users\/[A-Za-z]/);
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    }
  });
});

// The owner's standing rules about what the connector may do, checked in the code itself.
const mcpDir = fileURLToPath(new URL('.', import.meta.url));
const sources = readdirSync(mcpDir, { recursive: true, encoding: 'utf8' })
  .filter((f) => !f.split(/[\\/]/).includes('dist') && /\.(ts|mjs|json|html)$/.test(f) && !/\.test\.ts$/.test(f))
  .map((f) => ({ file: f.replaceAll('\\', '/'), code: readFileSync(join(mcpDir, f), 'utf8') }));

describe('what the connector’s code may never do (guards, job 156)', () => {
  it('finds the connector’s files', () => {
    expect(sources.map((s) => s.file)).toEqual(expect.arrayContaining(['main.ts', 'server.ts', 'save.ts', 'firestore.ts', 'login/page.html']));
  });

  it('never uses the Admin SDK or a service account, and never deletes a document', () => {
    for (const { file, code } of sources) {
      expect(code, file).not.toMatch(/firebase-admin|google-auth-library|serviceAccount|private_key/);
      expect(code, file).not.toMatch(/method:\s*['"]DELETE['"]/);
      expect(code, file).not.toMatch(/["']delete["']\s*:/);
    }
    const pkg = JSON.parse(readFileSync(join(mcpDir, '../package.json'), 'utf8'));
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty('firebase-admin');
  });

  it('only the owner’s command line (delete-on / delete-off in main.ts) can switch deleting on', () => {
    const callers = sources.filter((s) => /setDeleteAllowed\(/.test(s.code.replace(/function setDeleteAllowed\(/g, '')));
    expect(callers.map((s) => s.file)).toEqual(['main.ts']);
    const main = sources.find((s) => s.file === 'main.ts')!.code;
    const from = main.indexOf("case 'delete-on':");
    const to = main.indexOf('return 0;', from);
    const call = main.indexOf('await setDeleteAllowed(');
    expect(from).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(from);
    expect(call).toBeLessThan(to);
    const server = sources.find((s) => s.file === 'server.ts')!.code;
    expect(server).not.toMatch(/writeFile|appendFile|settings|setDeleteAllowed/);
  });
});
