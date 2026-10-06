import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TokenFile } from '../auth';
import page from './page.html?raw';

// The one-time sign-in helper behind `npm run mcp:login`: a page on this computer only
// (localhost, a random port) where the owner signs in with Google; the page hands the sign-in
// back to this helper, which saves it and stops. A one-time code in the page's address makes sure
// only that page can hand one in.

/** A Firebase web key's shape, so a key given with --key can't put anything else into the page. */
export const API_KEY_SHAPE = /^[A-Za-z0-9_-]{20,80}$/;

const MAX_BODY = 64 * 1024;

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function startLogin(opts: { apiKey: string; save: (t: TokenFile) => Promise<void>; timeoutMs?: number }) {
  if (!API_KEY_SHAPE.test(opts.apiKey)) throw new Error('That doesn’t look like a Google API key.');
  const nonce = randomBytes(24).toString('hex');
  const html = page.replace('__NONCE__', JSON.stringify(nonce)).replace('__API_KEY__', JSON.stringify(opts.apiKey));
  let used = false;
  let settle: { ok: (t: TokenFile) => void; fail: (e: Error) => void };
  const done = new Promise<TokenFile>((ok, fail) => (settle = { ok, fail }));

  const server = createServer(async (req, res) => {
    const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
    const send = (status: number, body = '', type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'referrer-policy': 'strict-origin', 'x-frame-options': 'DENY' });
      res.end(body);
    };
    const url = new URL(req.url ?? '/', origin);
    // Only this page, asked for by name (not another site pointing a name at this computer).
    if (req.headers.host !== new URL(origin).host || used) return send(403);
    if (req.method === 'GET' && url.pathname === '/') {
      return same(url.searchParams.get('n') ?? '', nonce) ? send(200, html, 'text/html; charset=utf-8') : send(404);
    }
    if (req.method === 'POST' && url.pathname === '/token') {
      if (req.headers.origin !== origin || !String(req.headers['content-type']).startsWith('application/json')) return send(403);
      const raw = await readBody(req);
      let body: Record<string, unknown> | null = null;
      try {
        body = raw == null ? null : JSON.parse(raw);
      } catch {
        // refused below
      }
      if (typeof body?.nonce !== 'string' || !same(body.nonce, nonce)) return send(403);
      const { refreshToken, uid, email } = body;
      if (typeof refreshToken !== 'string' || !refreshToken || typeof uid !== 'string' || !uid || (email !== undefined && typeof email !== 'string')) return send(400);
      used = true;
      const token: TokenFile = { refreshToken, uid, ...(email ? { email } : {}), apiKey: opts.apiKey };
      try {
        await opts.save(token);
      } catch (e) {
        send(500);
        settle.fail(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      send(200, 'ok');
      settle.ok(token);
      return;
    }
    send(404);
  });

  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  const timer = setTimeout(() => settle.fail(new Error('No sign-in within 5 minutes. Run npm run mcp:login again.')), opts.timeoutMs ?? 5 * 60_000);
  const close = () => {
    clearTimeout(timer);
    server.closeAllConnections();
    server.close();
  };
  done.then(close, close);
  return { url: `http://localhost:${port}/?n=${nonce}`, done, close };
}
