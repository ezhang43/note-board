import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WEB_API_KEY, deleteToken, saveToken } from './auth';
import { addItems } from './edits';
import { fakeFirestore } from './fakeFirestore';
import { activityLog, activityPath, boardsLoader, boardsWriter, deleteAllowed, runCheck, setDeleteAllowed, settingsPath, signInHelper } from './main';
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

describe('the activity log', () => {
  it('is %APPDATA%\\busyants-mcp\\activity.log, beside the sign-in', () => {
    expect(activityPath({ APPDATA: 'C:\\Users\\x\\AppData\\Roaming' })).toBe(join('C:\\Users\\x\\AppData\\Roaming', 'busyants-mcp', 'activity.log'));
  });

  it('gets plain lines with the time, the folder made if needed', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'busyants-')), 'busyants-mcp', 'activity.log');
    const log = activityLog(file, () => Date.UTC(2026, 9, 6, 12));
    await log('Saved: one');
    await log('Saved: two');
    expect(await readFile(file, 'utf8')).toBe('2026-10-06T12:00:00.000Z Saved: one\n2026-10-06T12:00:00.000Z Saved: two\n');
  });
});

describe('saving through the signed-in connector', () => {
  it('saves to the signed-in owner’s boards with an mcp- client name, logs it, and stops after logout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const file = await tempFile();
      await saveToken(file, { refreshToken: 'R', uid: 'me' });
      const fs = fakeFirestore('me');
      fs.setOwn(ownRaw());
      const google = (async (input: string | URL | Request, init?: RequestInit) =>
        String(input).startsWith('https://securetoken.googleapis.com/')
          ? new Response(JSON.stringify({ id_token: 'ID', refresh_token: 'R', expires_in: '3600', user_id: 'me' }), { status: 200 })
          : fs.fetch(input, init)) as typeof fetch;
      const logFile = join(dirname(file), 'activity.log');
      const write = boardsWriter(boardsLoader(file, google), logFile);
      let done = false;
      const saving = write(addItems('home', 'Groceries', [{ text: 'Apples' }], ['n1'])).finally(() => (done = true));
      // The put-back check's wait (file reads and writes happen meanwhile, so step until it ends).
      while (!done) await vi.advanceTimersByTimeAsync(1000);
      const r = await saving;
      expect(r.isError).toBeFalsy();
      expect(fs.own()).toContain('"id":"n1"');
      expect(String(fs.field('boards/me', 'client'))).toMatch(/^mcp-\w{8}$/);
      expect(await readFile(logFile, 'utf8')).toMatch(/Z Saved: Added "Apples" \(id: n1\) to Groceries\n$/);
      // A different account signed in without a restart gets its own safety version before its first change.
      fs.addVersion('recent', Date.now() - 1000, 'other');
      await saveToken(file, { refreshToken: 'R2', uid: 'me' });
      const before = fs.versions().length;
      done = false;
      const again = write(addItems('home', 'Groceries', [{ text: 'Pears' }], ['n2'])).finally(() => (done = true));
      while (!done) await vi.advanceTimersByTimeAsync(1000);
      expect((await again).isError).toBeFalsy();
      expect(fs.versions().length).toBe(before + 1);
      await deleteToken(file);
      await expect(write(addItems('home', 'Groceries', [{ text: 'Pears' }], ['n2']))).rejects.toThrow(/Not signed in/);
    } finally {
      vi.useRealTimers();
    }
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
    expect(out).toContain('Claude may delete: no (npm run mcp:delete-on to allow it)');
  });

  it('shows Claude may delete: yes once switched on', async () => {
    const file = await tempFile();
    await saveToken(file, { refreshToken: 'R', uid: 'me' });
    await setDeleteAllowed(settingsPath(file), true);
    const lines: string[] = [];
    await runCheck({ tokenFile: file, fetch: fakeGoogle(ownRaw()), log: (s) => lines.push(s) });
    expect(lines).toContain('Claude may delete: yes (npm run mcp:delete-off to stop it)');
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

describe('the "Let Claude delete" setting', () => {
  it('is settings.json beside the sign-in, and off when there is no file', async () => {
    const file = await tempFile();
    expect(settingsPath(file)).toBe(join(dirname(file), 'settings.json'));
    expect(await deleteAllowed(settingsPath(file))).toBe(false);
  });

  it('npm run mcp:delete-on / mcp:delete-off switch it, read afresh every time', async () => {
    const at = settingsPath(await tempFile());
    await setDeleteAllowed(at, true);
    expect(await deleteAllowed(at)).toBe(true);
    expect(JSON.parse(await readFile(at, 'utf8'))).toEqual({ allowDelete: true });
    await setDeleteAllowed(at, false);
    expect(await deleteAllowed(at)).toBe(false);
  });

  it('anything but exactly true counts as off (a damaged file, a string, a number)', async () => {
    const at = settingsPath(await tempFile());
    for (const bad of ['{', '{"allowDelete":"true"}', '{"allowDelete":1}', 'null', '[]']) {
      await writeFile(at, bad);
      expect(await deleteAllowed(at), bad).toBe(false);
    }
  });
});

describe('signing in from inside Claude (the sign_in and sign_out tools)', () => {
  it('sign_in opens the sign-in page in the browser and answers at once, with its address', async () => {
    const opened: string[] = [];
    const { signIn, close } = signInHelper(await tempFile(), (url) => opened.push(url), () => {});
    try {
      const answer = await signIn();
      expect(opened).toHaveLength(1);
      expect(answer).toContain(opened[0]);
      expect(new URL(opened[0]).hostname).toBe('localhost');
      expect((await fetch(opened[0])).status).toBe(200);
    } finally {
      close();
    }
  });

  it('a second sign_in stops the first page, so only the newest one works', async () => {
    const opened: string[] = [];
    const { signIn, close } = signInHelper(await tempFile(), (url) => opened.push(url), () => {});
    try {
      await signIn();
      await signIn();
      await expect(fetch(opened[0])).rejects.toThrow();
      expect((await fetch(opened[1])).status).toBe(200);
    } finally {
      close();
    }
  });

  it('two sign_in calls at the same moment still leave only one page working', async () => {
    const opened: string[] = [];
    const { signIn, close } = signInHelper(await tempFile(), (url) => opened.push(url), () => {});
    try {
      await Promise.all([signIn(), signIn()]);
      const works = await Promise.all(opened.map((url) => fetch(url).then((r) => r.status === 200, () => false)));
      expect(works.filter(Boolean)).toHaveLength(1);
    } finally {
      close();
    }
  });

  it('a damaged API key in the saved sign-in falls back to the app’s web key', async () => {
    const file = await tempFile();
    await saveToken(file, { refreshToken: 'R', uid: 'me', apiKey: 'not a key' });
    const opened: string[] = [];
    const { signIn, close } = signInHelper(file, (url) => opened.push(url), () => {});
    try {
      await signIn();
      expect(await (await fetch(opened[0])).text()).toContain(WEB_API_KEY);
    } finally {
      close();
    }
  });

  it('the sign-in handed in by the page is saved, and then used without a restart', async () => {
    const file = await tempFile();
    const opened: string[] = [];
    const lines: string[] = [];
    const { signIn, close } = signInHelper(file, (url) => opened.push(url), (l) => lines.push(l));
    try {
      await signIn();
      const u = new URL(opened[0]);
      const res = await fetch(`${u.origin}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: u.origin },
        body: JSON.stringify({ nonce: u.searchParams.get('n'), refreshToken: 'R', uid: 'me', email: 'me@example.com' }),
      });
      expect(res.status).toBe(200);
      await vi.waitFor(() => expect(lines.join('\n')).toContain('Signed in as me@example.com'));
      expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ refreshToken: 'R', uid: 'me', email: 'me@example.com' });
      expect((await boardsLoader(file, fakeGoogle(ownRaw()))()).email).toBe('me@example.com');
    } finally {
      close();
    }
  });

  it('sign_in keeps the API key the saved sign-in was made with', async () => {
    const file = await tempFile();
    await saveToken(file, { refreshToken: 'R', uid: 'me', apiKey: 'AIzaSecondKey-0123456789abcdefgh' });
    const opened: string[] = [];
    const { signIn, close } = signInHelper(file, (url) => opened.push(url), () => {});
    try {
      await signIn();
      expect(await (await fetch(opened[0])).text()).toContain('AIzaSecondKey-0123456789abcdefgh');
    } finally {
      close();
    }
  });

  it('sign_out deletes the saved sign-in, and says so when there was none', async () => {
    const file = await tempFile();
    await saveToken(file, { refreshToken: 'R', uid: 'me' });
    const { signOut } = signInHelper(file, () => {}, () => {});
    expect(await signOut()).toMatch(/Signed out/);
    await expect(boardsLoader(file, fakeGoogle(ownRaw()))()).rejects.toThrow(/Not signed in/);
    expect(await signOut()).toMatch(/Not signed in/);
  });

  it('"not signed in" tells the person to sign in from Claude', async () => {
    await expect(boardsLoader(await tempFile(), fakeGoogle(ownRaw()))()).rejects.toThrow(/sign in to BusyAnts.*sign_in/);
  });
});
