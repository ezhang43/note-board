import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deleteToken, saveToken } from './auth';
import { boardsLoader, runCheck } from './main';
import { ownRaw } from './sample';

describe('the connector’s sign-in', () => {
  it('after npm run mcp:logout, reading stops straight away (no restart needed)', async () => {
    const file = await tempFile();
    await saveToken(file, { refreshToken: 'R', uid: 'me' });
    const load = boardsLoader(file, fakeGoogle(ownRaw()));
    expect((await load()).snapshot.own).toBe(ownRaw());
    await deleteToken(file);
    await expect(load()).rejects.toThrow(/Not signed in/);
  });

  it('a new sign-in is used without a restart, and the id token is kept between calls', async () => {
    const file = await tempFile();
    await saveToken(file, { refreshToken: 'R', uid: 'me' });
    const calls: string[] = [];
    const load = boardsLoader(file, fakeGoogle(ownRaw(), calls));
    await load();
    await load();
    expect(calls.filter((c) => c.includes('securetoken'))).toHaveLength(1);
    await saveToken(file, { refreshToken: 'R2', uid: 'me' });
    await load();
    expect(calls.filter((c) => c.includes('securetoken'))).toHaveLength(2);
  });
});

async function tempFile() {
  return join(await mkdtemp(join(tmpdir(), 'busyants-')), 'token.json');
}

/** Google's token service and Firestore, answering with fixed JSON. */
function fakeGoogle(own: string | null, calls: string[] = []) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.startsWith('https://securetoken.googleapis.com/')) return json(200, { id_token: 'ID', refresh_token: 'R', expires_in: '3600', user_id: 'me' });
    if (url.endsWith('/documents/boards/me')) return own == null ? json(404, { error: { code: 404 } }) : json(200, { fields: { data: { stringValue: own } }, updateTime: 'T' });
    if (url.includes('/documents/boards/me/shared')) return json(200, {});
    return json(404, { error: { code: 404 } });
  }) as typeof fetch;
}

async function check(own: string | null, signedIn = true) {
  const file = await tempFile();
  if (signedIn) await saveToken(file, { refreshToken: 'R', uid: 'me', email: 'me@example.com' });
  const lines: string[] = [];
  const calls: string[] = [];
  const code = await runCheck({ tokenFile: file, fetch: fakeGoogle(own, calls), log: (s) => lines.push(s) });
  return { code, out: lines.join('\n'), calls };
}

describe('npm run mcp:check', () => {
  it('not signed in: fails with a clear message', async () => {
    const { code, out, calls } = await check(null, false);
    expect(code).toBe(1);
    expect(out).toMatch(/Not signed in.*npm run mcp:login/s);
    expect(calls).toEqual([]);
  });

  it('signed in: shows the account, board count and safe to edit: yes', async () => {
    const { code, out } = await check(ownRaw());
    expect(code).toBe(0);
    expect(out).toContain('Signed in as me@example.com');
    expect(out).toContain('2 boards (0 shared, read-only)');
    expect(out).toContain('Safe to edit: yes');
  });

  it('data it can’t round-trip: safe to edit: no, with the reason', async () => {
    const data = JSON.parse(ownRaw());
    data.boards.home.newThing = 1;
    const { code, out } = await check(JSON.stringify(data));
    expect(code).toBe(0);
    expect(out).toMatch(/Safe to edit: no .*newer/);
  });

  it('only reads (GET), never writes', async () => {
    const { calls } = await check(ownRaw());
    expect(calls.filter((c) => !c.startsWith('GET ') && !c.startsWith('POST https://securetoken.googleapis.com/'))).toEqual([]);
  });

  it('a failure is shown plainly and fails', async () => {
    const file = await tempFile();
    await saveToken(file, { refreshToken: 'R', uid: 'me' });
    const lines: string[] = [];
    const code = await runCheck({ tokenFile: file, fetch: (async () => new Response('{"error":{"message":"TOKEN_EXPIRED"}}', { status: 400 })) as typeof fetch, log: (s) => lines.push(s) });
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/expired/);
  });
});
