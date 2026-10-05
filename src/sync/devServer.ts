import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { memoryServer, type CollabServer, type Person } from '../store/collab';

// A pretend sharing server inside `npm run dev` (never in the published site), so editing together
// can be tried and tested without Firebase: open the app with ?demo-user=Alice in one window and
// ?demo-user=Bob in another. Everything is kept in memory until the dev server stops.
//   POST /__collab/call   { who, method, args } → { ok } or { error: { code, message } }
//   GET  /__collab/watch?who=…&what=shares|share|people&id=…   (server-sent events)

export function devCollabPlugin(): Plugin {
  return {
    name: 'note-board-dev-collab',
    apply: 'serve',
    configureServer(vite) {
      const { server } = memoryServer();
      vite.middlewares.use('/__collab', (req, res) => {
        if (req.method === 'POST' && req.url?.startsWith('/call')) return void call(server, req, res);
        if (req.method === 'GET' && req.url?.startsWith('/watch')) return watch(server, req, res);
        res.statusCode = 404;
        res.end();
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => done(body));
    req.on('error', fail);
  });
}

async function call(server: CollabServer, req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { who, method, args } = JSON.parse(await readBody(req)) as { who: Person; method: string; args: unknown[] };
    const allowed = ['read', 'write', 'createShare', 'join', 'leave', 'removePerson', 'setLink', 'deleteShare'];
    if (!allowed.includes(method)) throw new Error('Unknown call');
    const fn = (server as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method];
    const ok = await fn(who, ...args);
    res.end(JSON.stringify({ ok: ok ?? null }));
  } catch (e) {
    const err = e as { code?: string; message?: string };
    res.end(JSON.stringify({ error: { code: err.code ?? 'unknown', message: err.message ?? '' } }));
  }
}

function watch(server: CollabServer, req: IncomingMessage, res: ServerResponse) {
  const q = new URL(req.url ?? '', 'http://dev').searchParams;
  const who = JSON.parse(q.get('who') ?? 'null') as Person;
  const id = q.get('id') ?? '';
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (msg: unknown) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
  const onChange = (value: unknown) => send({ value });
  const onError = (e: unknown) => send({ error: { code: (e as { code?: string }).code ?? 'unknown' } });
  const what = q.get('what');
  const stop =
    what === 'shares'
      ? server.watchMyShares(who, onChange, onError)
      : what === 'share'
        ? server.watchShare(who, id, onChange, onError)
        : server.watchPeople(who, id, onChange, onError);
  req.on('close', stop);
}
