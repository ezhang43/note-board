import type { Snapshot } from './boards';

// Reading the app's Firestore over its REST API, signed in as the owner (an id token), so
// firestore.rules decide what may be read, exactly as in the app. Read only: nothing here writes.

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
