import { spawn } from 'node:child_process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WEB_API_KEY, deleteToken, idTokens, loadToken, saveToken, tokenPath } from './auth';
import { collectBoards, safeToEdit, type Snapshot } from './boards';
import { firestoreReader, readSnapshot } from './firestore';
import { API_KEY_SHAPE, startLogin } from './login/login';
import { createServer } from './server';

// `node mcp/dist/server.js` runs the connector for Claude; with login / logout / check it is the
// owner's setup helper (npm run mcp:login, mcp:logout, mcp:check).

const NOT_SIGNED_IN = 'Not signed in. Run npm run mcp:login first.';

/** Reads everything for the signed-in owner, signing in from the saved token the first time. */
function boardsLoader(tokenFile: string, fetchFn: typeof fetch) {
  let session: { uid: string; email?: string; read: () => Promise<Snapshot> } | null = null;
  return async () => {
    if (!session) {
      const token = await loadToken(tokenFile);
      if (!token) throw new Error(NOT_SIGNED_IN);
      const db = firestoreReader(idTokens(token, { fetch: fetchFn, save: (t) => saveToken(tokenFile, t) }), fetchFn);
      session = { uid: token.uid, email: token.email, read: () => readSnapshot(db, token.uid) };
    }
    const s = session;
    try {
      return { snapshot: await s.read(), email: s.email ?? s.uid };
    } catch (e) {
      // Read the saved sign-in again next time (the owner may have signed in again meanwhile).
      session = null;
      throw e;
    }
  };
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
      await createServer(async () => (await load()).snapshot).connect(new StdioServerTransport());
      console.error('BusyAnts connector running (read only).');
      return null;
    }
    default:
      console.log('Use: node mcp/dist/server.js [login [--key <api key>] | logout | check]');
      return 1;
  }
}
