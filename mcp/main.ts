import { spawn } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WEB_API_KEY, deleteToken, idTokens, loadToken, saveToken, tokenPath, type TokenFile } from './auth';
import { collectBoards, safeToEdit, type Snapshot } from './boards';
import { firestoreReader, ownDb, readSnapshot, type OwnDb } from './firestore';
import { API_KEY_SHAPE, startLogin } from './login/login';
import { saveChange, type SaveDeps } from './save';
import { createServer, type Write } from './server';

// `node mcp/dist/server.js` runs the connector for Claude; with login / logout / check it is the
// owner's setup helper (npm run mcp:login, mcp:logout, mcp:check).

const NOT_SIGNED_IN = 'Not signed in. Run npm run mcp:login first.';

/**
 * Reads everything for the signed-in owner. The saved sign-in is read on every call, so a logout
 * stops reading at once and a new sign-in is used without restarting; the id token is kept while
 * the sign-in stays the same.
 */
export function boardsLoader(tokenFile: string, fetchFn: typeof fetch) {
  let session: { refreshToken: string; uid: string; email?: string; read: () => Promise<Snapshot>; own: OwnDb; memory: SaveDeps['memory'] } | null = null;
  const signedIn = async () => {
    const token = await loadToken(tokenFile);
    if (!token) {
      session = null;
      throw new Error(NOT_SIGNED_IN);
    }
    if (!session || session.refreshToken !== token.refreshToken || session.uid !== token.uid) {
      const save = async (t: TokenFile) => {
        // Google gave a new refresh token: this session goes on with it.
        s.refreshToken = t.refreshToken;
        await saveToken(tokenFile, t);
      };
      const tokens = idTokens(token, { fetch: fetchFn, save });
      const db = firestoreReader(tokens, fetchFn);
      const s = { refreshToken: token.refreshToken, uid: token.uid, email: token.email, read: () => readSnapshot(db, token.uid), own: ownDb(tokens, token.uid, fetchFn), memory: { lastEditAt: null } };
      session = s;
    }
    return session;
  };
  /** Runs `use` with the session; on failure the saved sign-in is read again next time (the owner may have signed in again meanwhile). */
  const withSession = async <T>(use: (s: NonNullable<typeof session>) => Promise<T>): Promise<T> => {
    const s = await signedIn();
    try {
      return await use(s);
    } catch (e) {
      session = null;
      throw e;
    }
  };
  const load = () => withSession(async (s) => ({ snapshot: await s.read(), email: s.email ?? s.uid }));
  // The save memory is per sign-in: a new one (another account, say) gets a safety version before its first change.
  return Object.assign(load, { withOwn: <T>(use: (db: OwnDb, memory: SaveDeps['memory']) => Promise<T>) => withSession((s) => use(s.own, s.memory)) });
}

/** %APPDATA%\busyants-mcp\activity.log, beside the saved sign-in: what the connector changed. */
export function activityPath(env: Record<string, string | undefined> = process.env): string {
  return join(env.APPDATA ?? join(homedir(), '.config'), 'busyants-mcp', 'activity.log');
}

/** Adds plain lines with the time to the activity log; a log that can't be written never stops a save. */
export function activityLog(file: string, now: () => number = Date.now) {
  return async (line: string) => {
    try {
      await mkdir(dirname(file), { recursive: true });
      await appendFile(file, `${new Date(now()).toISOString()} ${line}\n`);
    } catch (e) {
      console.error(`Couldn’t write the activity log (${file}): ${e instanceof Error ? e.message : String(e)}`);
    }
  };
}

/** Saves the connector's changes to the signed-in owner's own boards, logging them to `logFile`. */
export function boardsWriter(loader: ReturnType<typeof boardsLoader>, logFile: string): Write {
  const log = activityLog(logFile);
  const client = `mcp-${crypto.randomUUID().slice(0, 8)}`;
  const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
  return (edit) => loader.withOwn((db, memory) => saveChange({ db, client, now: Date.now, wait, log, memory }, edit));
}

/** npm run mcp:check: read only. Exit code 0 when the boards could be read. */
export async function runCheck(opts: { tokenFile: string; fetch: typeof fetch; log: (line: string) => void }): Promise<number> {
  try {
    if (!(await loadToken(opts.tokenFile))) {
      opts.log(NOT_SIGNED_IN);
      return 1;
    }
    const { snapshot, email } = await boardsLoader(opts.tokenFile, opts.fetch)();
    const { entries, ownUnreadable } = collectBoards(snapshot);
    const shared = entries.filter((e) => e.sharedBy).length;
    const safe = safeToEdit(snapshot.own);
    opts.log(`Signed in as ${email}`);
    opts.log(`${entries.length} board${entries.length === 1 ? '' : 's'} (${shared} shared, read-only)`);
    if (ownUnreadable) opts.log('Your own boards couldn’t be read.');
    opts.log(safe.ok ? 'Safe to edit: yes' : `Safe to edit: no (${safe.reason})`);
    return 0;
  } catch (e) {
    opts.log(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

function openInBrowser(url: string) {
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd as string, args as string[], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch {
    // The address is printed too.
  }
}

async function login(args: string[]): Promise<number> {
  const at = args.indexOf('--key');
  const apiKey = at >= 0 ? args[at + 1] ?? '' : WEB_API_KEY;
  if (!API_KEY_SHAPE.test(apiKey)) {
    console.log('That --key doesn’t look like a Google API key.');
    return 1;
  }
  const file = tokenPath();
  const { url, done } = await startLogin({ apiKey, save: (t) => saveToken(file, t) });
  console.log(`Opening the sign-in page in your browser. If it doesn't open, go to:\n${url}`);
  openInBrowser(url);
  try {
    const t = await done;
    console.log(`Signed in as ${t.email ?? t.uid}. Saved to ${file}.\nNext: npm run mcp:check`);
    return 0;
  } catch (e) {
    console.log(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

export async function main(args: string[]): Promise<number | null> {
  const file = tokenPath();
  switch (args[0]) {
    case 'login':
      return login(args.slice(1));
    case 'logout':
      console.log((await deleteToken(file)) ? 'Signed out: the saved sign-in was deleted.' : 'Not signed in (nothing to delete).');
      return 0;
    case 'check':
      return runCheck({ tokenFile: file, fetch, log: (line) => console.log(line) });
    case undefined: {
      // Claude talks to the server over stdin / stdout, so nothing else may be printed there.
      const load = boardsLoader(file, fetch);
      await createServer(async () => (await load()).snapshot, boardsWriter(load, activityPath())).connect(new StdioServerTransport());
      console.error('BusyAnts connector running.');
      return null;
    }
    default:
      console.log('Use: node mcp/dist/server.js [login [--key <api key>] | logout | check]');
      return 1;
  }
}
