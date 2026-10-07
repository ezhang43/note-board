import type { VersionMeta } from '../src/model/versions';
import type { Snapshot } from './boards';

// The app's Firestore over its REST API, signed in as the owner (an id token), so firestore.rules
// decide what may be read and written, exactly as in the app. Only the owner's own boards and
// their version history are ever written (ownDb); nothing is ever deleted.

const DOCS = 'https://firestore.googleapis.com/v1/projects/note-board-a672a/databases/(default)/documents/';

export interface FirestoreDoc {
  /** Plain values: strings, timestamps (as text) and numbers. */
  fields: Record<string, string | number | boolean>;
  updateTime: string;
}

export interface FirestoreReader {
  getDoc(path: string): Promise<FirestoreDoc | null>;
  listIds(collection: string): Promise<string[]>;
}

export class FirestoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function plain(value: Record<string, unknown>): string | number | boolean | undefined {
  if (typeof value.stringValue === 'string') return value.stringValue;
  if (typeof value.timestampValue === 'string') return value.timestampValue;
  if (typeof value.integerValue === 'string') return Number(value.integerValue);
  if (typeof value.doubleValue === 'number') return value.doubleValue;
  if (typeof value.booleanValue === 'boolean') return value.booleanValue;
  return undefined;
}

export function firestoreReader(idToken: () => Promise<string>, fetchFn: typeof fetch = fetch): FirestoreReader {
  async function get(pathAndQuery: string): Promise<Record<string, unknown> | null> {
    const res = await fetchFn(DOCS + pathAndQuery, { headers: { authorization: `Bearer ${await idToken()}` } });
    if (res.status === 404) return null;
    if (res.status === 403) throw new FirestoreError('Firestore refused (permission denied). Is this Google account on the invite list in firestore.rules?', 403);
    if (!res.ok) throw new FirestoreError(`Firestore didn’t answer properly (status ${res.status}). Try again in a moment.`, res.status);
    return (await res.json()) as Record<string, unknown>;
  }
  return {
    async getDoc(path) {
      const body = await get(path);
      if (!body) return null;
      const fields: FirestoreDoc['fields'] = {};
      for (const [k, v] of Object.entries((body.fields ?? {}) as Record<string, Record<string, unknown>>)) {
        const p = plain(v);
        if (p !== undefined) fields[k] = p;
      }
      return { fields, updateTime: String(body.updateTime ?? '') };
    },
    async listIds(collection) {
      const ids: string[] = [];
      let page = '';
      do {
        const body = await get(`${collection}?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
        for (const d of (body?.documents ?? []) as { name: string }[]) ids.push(d.name.slice(d.name.lastIndexOf('/') + 1));
        page = typeof body?.nextPageToken === 'string' ? body.nextPageToken : '';
      } while (page);
      return ids;
    },
  };
}

// ---------- writing own boards (job B) ----------

const ROOT = DOCS.slice(0, -1);
const NAME ='projects/note-board-a672a/databases/(default)/documents/';

/** The person's own boards as saved: the text and Firestore's time of that save. */
export interface OwnDoc {
  raw: string | null;
  updateTime: string;
}

/** What saving needs: own boards (read and write) and their version history (read newest, add). */
export interface OwnDb {
  read(): Promise<OwnDoc>;
  /** Saves `data` only if the boards are still as saved at `updateTime`; false if they changed since. */
  write(data: string, client: string, updateTime: string): Promise<boolean>;
  newestVersion(): Promise<{ savedAt: number; hash?: string } | null>;
  /** Adds a version (its board first, then its list entry, in one commit); never replaces one. */
  addVersion(meta: VersionMeta, data: string): Promise<void>;
}

const str = (v: string) => ({ stringValue: v });
const int = (n: number) => ({ integerValue: String(n) });

export function ownDb(idToken: () => Promise<string>, uid: string, fetchFn: typeof fetch = fetch): OwnDb {
  // A uid goes into document names (not escaped there): Firebase uids are letters and digits.
  if (!/^[\w-]+$/.test(uid)) throw new Error('The saved sign-in has an unexpected account id. Run npm run mcp:login again.');
  const reader = firestoreReader(idToken, fetchFn);
  const own = `boards/${uid}`;

  async function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> | unknown[] }> {
    const res = await fetchFn(ROOT + path, {
      method: 'POST',
      headers: { authorization: `Bearer ${await idToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    let got: Record<string, unknown> | unknown[] = {};
    try {
      got = await res.json();
    } catch {
      // checked by status below
    }
    return { status: res.status, body: got };
  }
  const failed = (status: number) =>
    new FirestoreError(
      status === 403 ? 'Firestore refused (permission denied). Is this Google account on the invite list in firestore.rules?' : `Firestore didn’t save it (status ${status}). Nothing was changed; try again in a moment.`,
      status,
    );

  return {
    async read() {
      const doc = await reader.getDoc(own);
      return { raw: typeof doc?.fields.data === 'string' ? doc.fields.data : null, updateTime: doc?.updateTime ?? '' };
    },
    async write(data, client, updateTime) {
      const r = await post(':commit', {
        writes: [
          {
            update: { name: NAME + own, fields: { data: str(data), client: str(client) } },
            updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
            currentDocument: { updateTime },
          },
        ],
      });
      if (r.status === 200) return true;
      const status = (r.body as { error?: { status?: string } }).error?.status;
      if (status === 'FAILED_PRECONDITION' || status === 'ABORTED') return false;
      throw failed(r.status);
    },
    async newestVersion() {
      const r = await post(`/${own}:runQuery`, {
        structuredQuery: { from: [{ collectionId: 'versions' }], orderBy: [{ field: { fieldPath: 'savedAt' }, direction: 'DESCENDING' }], limit: 1 },
      });
      if (r.status !== 200 || !Array.isArray(r.body)) throw failed(r.status);
      const doc = (r.body[0] as { document?: { fields?: Record<string, Record<string, unknown>> } } | undefined)?.document;
      if (!doc?.fields) return null;
      const savedAt = Number(plain(doc.fields.savedAt ?? {}));
      const hash = plain(doc.fields.hash ?? {});
      return { savedAt: Number.isFinite(savedAt) ? savedAt : 0, ...(typeof hash === 'string' ? { hash } : {}) };
    },
    async addVersion(meta, data) {
      const fresh = { currentDocument: { exists: false } };
      const fields = { savedAt: int(meta.savedAt), cards: int(meta.cards), columns: int(meta.columns), ...(meta.boards ? { boards: int(meta.boards) } : {}), ...(meta.hash ? { hash: str(meta.hash) } : {}) };
      const r = await post(':commit', {
        writes: [
          { update: { name: `${NAME}${own}/versionData/${meta.id}`, fields: { data: str(data) } }, ...fresh },
          { update: { name: `${NAME}${own}/versions/${meta.id}`, fields }, ...fresh },
        ],
      });
      if (r.status !== 200) throw failed(r.status);
    },
  };
}

// Ids from the token file or from Firestore never reach outside their own path segment.
const enc = encodeURIComponent;
const text = (doc: FirestoreDoc | null, key: string) => (typeof doc?.fields[key] === 'string' ? (doc.fields[key] as string) : null);

/** Everything the person `uid` has: their own boards, and each board shared with them (or by them). */
export async function readSnapshot(db: FirestoreReader, uid: string): Promise<Snapshot> {
  const own = text(await db.getDoc(`boards/${enc(uid)}`), 'data');
  const shares: Snapshot['shares'] = [];
  for (const id of await db.listIds(`boards/${enc(uid)}/shared`)) {
    // A share they were removed from, or one deleted, is still on their list: skipped.
    const doc = await db.getDoc(`shared/${enc(id)}`).catch((e) => {
      if (e instanceof FirestoreError && e.status === 403) return null;
      throw e;
    });
    const raw = text(doc, 'data');
    const owner = text(doc, 'owner');
    if (!raw || !owner) continue;
    const mine = owner === uid;
    const ownerName = mine ? 'you' : (text(await db.getDoc(`shared/${enc(id)}/members/${enc(owner)}`).catch(() => null), 'name') || 'someone');
    shares.push({ id, owner, ownerName, mine, raw });
  }
  return { own, shares };
}
