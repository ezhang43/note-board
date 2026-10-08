// A pretend Firestore for the connector's tests (not part of the built server): answers the REST
// calls the connector makes (get, list, commit with preconditions, the newest-version query) from
// memory, as Firestore would.

const ROOT = 'https://firestore.googleapis.com/v1/projects/note-board-a672a/databases/(default)/documents';
const NAME = 'projects/note-board-a672a/databases/(default)/documents/';

type Value = Record<string, unknown>;
interface Stored {
  fields: Record<string, Value>;
  updateTime: string;
}

export function fakeFirestore(uid = 'me') {
  const docs = new Map<string, Stored>();
  let tick = 0;
  const stamp = () => `2026-10-06T10:00:00.${String(++tick).padStart(6, '0')}Z`;
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const hooks: { beforeCommit?: (n: number) => void; afterCommit?: (n: number) => void } = {};
  let commits = 0;

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const failure = (code: number, status: string) => json(code, { error: { code, status, message: status } });

  const fs = {
    docs,
    calls,
    hooks,
    /** Saves own boards as the app does (another client). */
    setOwn(raw: string, client = 'app-1') {
      docs.set(`boards/${uid}`, { fields: { data: { stringValue: raw }, client: { stringValue: client } }, updateTime: stamp() });
    },
    own(): string | null {
      const d = docs.get(`boards/${uid}`);
      return d ? String(d.fields.data.stringValue) : null;
    },
    field(path: string, key: string): unknown {
      const v = docs.get(path)?.fields[key];
      return v ? Object.values(v)[0] : undefined;
    },
    /** Version ids, in the order they were saved. */
    versions(): string[] {
      return [...docs.keys()].filter((p) => p.startsWith(`boards/${uid}/versions/`)).map((p) => p.slice(p.lastIndexOf('/') + 1));
    },
    addVersion(id: string, savedAt: number, hash?: string, data = '') {
      docs.set(`boards/${uid}/versionData/${id}`, { fields: { data: { stringValue: data } }, updateTime: stamp() });
      docs.set(`boards/${uid}/versions/${id}`, { fields: { savedAt: { integerValue: String(savedAt) }, cards: { integerValue: '0' }, columns: { integerValue: '0' }, ...(hash ? { hash: { stringValue: hash } } : {}) }, updateTime: stamp() });
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (!url.startsWith(ROOT)) return failure(404, 'NOT_FOUND');
      const rest = url.slice(ROOT.length);
      calls.push({ method, path: rest, body });
      if (method === 'POST' && rest === ':commit') return commit(body);
      if (method === 'POST' && rest === `/boards/${uid}:runQuery`) return newestVersion(body);
      if (method !== 'GET' || !rest.startsWith('/')) return failure(400, 'INVALID_ARGUMENT');
      const [path, query] = rest.slice(1).split('?');
      if (query) {
        const documents = [...docs.keys()].filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/')).map((p) => ({ name: NAME + p }));
        return json(200, documents.length ? { documents } : {});
      }
      const d = docs.get(path);
      return d ? json(200, { name: NAME + path, fields: d.fields, updateTime: d.updateTime }) : failure(404, 'NOT_FOUND');
    }) as typeof fetch,
  };

  function commit(body: { writes: { update: { name: string; fields: Record<string, Value> }; updateTransforms?: { fieldPath: string; setToServerValue: string }[]; currentDocument?: { updateTime?: string; exists?: boolean } }[] }) {
    const n = ++commits;
    hooks.beforeCommit?.(n);
    for (const w of body.writes) {
      const path = w.update.name.slice(NAME.length);
      const cur = docs.get(path);
      const pre = w.currentDocument;
      if (pre?.updateTime !== undefined && cur?.updateTime !== pre.updateTime) return failure(400, 'FAILED_PRECONDITION');
      if (pre?.exists === false && cur) return failure(409, 'ALREADY_EXISTS');
    }
    const time = stamp();
    for (const w of body.writes) {
      const fields = { ...w.update.fields };
      for (const t of w.updateTransforms ?? []) if (t.setToServerValue === 'REQUEST_TIME') fields[t.fieldPath] = { timestampValue: time };
      docs.set(w.update.name.slice(NAME.length), { fields, updateTime: time });
    }
    hooks.afterCommit?.(n);
    return json(200, { writeResults: body.writes.map(() => ({ updateTime: time })), commitTime: time });
  }

  function newestVersion(body: { structuredQuery: { from: { collectionId: string }[]; limit?: number } }) {
    const from = `boards/${uid}/${body.structuredQuery.from[0].collectionId}/`;
    const found = [...docs.entries()]
      .filter(([p]) => p.startsWith(from))
      .sort((a, b) => Number(b[1].fields.savedAt.integerValue) - Number(a[1].fields.savedAt.integerValue))
      .slice(0, body.structuredQuery.limit ?? Infinity);
    const readTime = stamp();
    return json(200, found.length ? found.map(([p, d]) => ({ document: { name: NAME + p, fields: d.fields, updateTime: d.updateTime }, readTime })) : [{ readTime }]);
  }

  return fs;
}
