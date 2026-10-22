import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// Interface review 181 C-M3 (job 182): the offline copy used to keep every built file of every build
// it ever saw. A new build's page now clears the old build's built files; fonts, the page itself and
// a page opened offline are untouched.

const SCOPE = 'https://example.test/note-board/';
const source = readFileSync('public/sw.js', 'utf8');

/** A tiny in-memory Cache Storage and fetch, and the worker's listeners to drive by hand. */
function worker(network: { page: string | null; files: Record<string, string> }, breakSaving = { on: false }) {
  const stores = new Map<string, Map<string, string>>();
  const cacheOf = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    const key = (r: string | { url: string }) => (typeof r === 'string' ? r : r.url);
    return {
      match: async (r: string | { url: string }) => (m.has(key(r)) ? new Response(m.get(key(r))) : undefined),
      put: async (r: string | { url: string }, res: Response) => {
        if (breakSaving.on) throw new Error('quota');
        m.set(key(r), await res.text());
      },
      add: async (u: string) => void m.set(u, network.page ?? ''),
      keys: async () => [...m.keys()].map((url) => ({ url })),
      delete: async (r: { url: string } | string) => m.delete(key(r)),
    };
  };
  const listeners: Record<string, (e: unknown) => void> = {};
  const fetcher = async (r: string | { url: string }) => {
    const url = typeof r === 'string' ? r : r.url;
    const body = url === SCOPE ? network.page : network.files[url];
    if (body == null) throw new TypeError('offline');
    return new Response(body);
  };
  const caches = {
    open: async (n: string) => cacheOf(n),
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
    match: async (r: string | { url: string }) => {
      for (const m of stores.values()) if (m.has(typeof r === 'string' ? r : r.url)) return new Response(m.get(typeof r === 'string' ? r : r.url));
      return undefined;
    },
  };
  runInNewContext(source, {
    self: { registration: { scope: SCOPE }, addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f), skipWaiting() {}, clients: { claim() {} } },
    caches,
    fetch: fetcher,
    URL,
    Response,
  });
  const all = () => stores.get('busyants-v6') ?? new Map<string, string>();
  /** Fetches `url` through the worker the way the browser would; resolves once everything it started has finished. */
  async function request(url: string, navigate = false) {
    const pending: Promise<unknown>[] = [];
    let answer: Promise<Response> | undefined;
    listeners.fetch({ request: { url, method: 'GET', mode: navigate ? 'navigate' : 'no-cors' }, respondWith: (p: Promise<Response>) => (answer = p), waitUntil: (p: Promise<unknown>) => pending.push(p) });
    const res = await answer;
    await Promise.all(pending);
    await new Promise((r) => setTimeout(r, 0));
    return res;
  }
  return { all, request, setNetwork: (n: typeof network) => Object.assign(network, n), breakSaving };
}

describe('the offline copy’s built files', () => {
  it('a new build’s page clears the old build’s built files, and keeps the page and fonts', async () => {
    const net = { page: '<script src="assets/a1.js">', files: { [`${SCOPE}assets/a1.js`]: 'old', [`${SCOPE}assets/b2.js`]: 'new', 'https://fonts.gstatic.com/x.woff2': 'font' } };
    const w = worker(net);
    await w.request(SCOPE, true);
    await w.request(`${SCOPE}assets/a1.js`);
    await w.request('https://fonts.gstatic.com/x.woff2');
    expect([...w.all().keys()].sort()).toEqual([SCOPE, `${SCOPE}assets/a1.js`, 'https://fonts.gstatic.com/x.woff2'].sort());
    w.setNetwork({ page: '<script src="assets/b2.js">', files: net.files });
    await w.request(SCOPE, true);
    await w.request(`${SCOPE}assets/b2.js`);
    expect([...w.all().keys()].sort()).toEqual([SCOPE, `${SCOPE}assets/b2.js`, 'https://fonts.gstatic.com/x.woff2'].sort());
    expect(w.all().get(SCOPE)).toContain('b2.js');
  });

  it('the same build’s page leaves every built file alone (a lazily loaded one included)', async () => {
    const net = { page: '<script src="assets/a1.js">', files: { [`${SCOPE}assets/a1.js`]: 'x', [`${SCOPE}assets/lazy.js`]: 'y' } };
    const w = worker(net);
    await w.request(SCOPE, true);
    await w.request(`${SCOPE}assets/a1.js`);
    await w.request(`${SCOPE}assets/lazy.js`);
    await w.request(SCOPE, true);
    expect([...w.all().keys()]).toEqual(expect.arrayContaining([`${SCOPE}assets/a1.js`, `${SCOPE}assets/lazy.js`]));
  });

  it('a cache that fails to save still serves the new page, and deletes nothing', async () => {
    const net = { page: '<script src="assets/a1.js">', files: { [`${SCOPE}assets/a1.js`]: 'old' } };
    const w = worker(net);
    await w.request(SCOPE, true);
    await w.request(`${SCOPE}assets/a1.js`);
    w.setNetwork({ page: '<script src="assets/b2.js">', files: net.files });
    w.breakSaving.on = true;
    const res = await w.request(SCOPE, true);
    expect(await res.text()).toContain('b2.js');
    expect(w.all().has(`${SCOPE}assets/a1.js`)).toBe(true);
  });

  it('opened offline, nothing is cleared and the saved page is served', async () => {
    const net: { page: string | null; files: Record<string, string> } = { page: '<p>page</p>', files: { [`${SCOPE}assets/a1.js`]: 'x' } };
    const w = worker(net);
    await w.request(SCOPE, true);
    await w.request(`${SCOPE}assets/a1.js`);
    w.setNetwork({ page: null, files: {} });
    const res = await w.request(SCOPE, true);
    expect(await res.text()).toBe('<p>page</p>');
    expect(w.all().has(`${SCOPE}assets/a1.js`)).toBe(true);
  });
});
