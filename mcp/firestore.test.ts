import { describe, expect, it } from 'vitest';
import { firestoreReader, readSnapshot } from './firestore';
import { ownRaw } from './sample';

const BASE = 'https://firestore.googleapis.com/v1/projects/note-board-a672a/databases/(default)/documents/';

type Reply = { status: number; body: unknown };

/** A fake fetch answering from fixed Firestore REST JSON, keyed by the path after /documents/. */
function fakeFetch(replies: Record<string, Reply>) {
  const calls: { url: string; auth: string | null }[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
    const key = url.startsWith(BASE) ? url.slice(BASE.length) : url;
    const reply = replies[key] ?? { status: 404, body: { error: { code: 404, status: 'NOT_FOUND', message: 'not found' } } };
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  };
  return { fn: fn as typeof fetch, calls };
}

const doc = (path: string, fields: Record<string, unknown>) => ({ status: 200, body: { name: `projects/note-board-a672a/databases/(default)/documents/${path}`, fields, createTime: '2026-10-01T10:00:00Z', updateTime: '2026-10-06T09:30:00.123456Z' } });
const tripRaw = JSON.stringify({ version: 3, home: 'trip', boards: { trip: { name: 'Trip', snap: true, cards: {}, columns: {}, order: [] } } });

describe('Firestore REST reading', () => {
  it('reads a document’s fields and update time, sending the id token', async () => {
    const { fn, calls } = fakeFetch({ 'boards/me': doc('boards/me', { data: { stringValue: 'x' }, client: { stringValue: 'c1' }, updatedAt: { timestampValue: '2026-10-06T09:30:00Z' } }) });
    const r = firestoreReader(async () => 'ID-TOKEN', fn);
    expect(await r.getDoc('boards/me')).toEqual({ fields: { data: 'x', client: 'c1', updatedAt: '2026-10-06T09:30:00Z' }, updateTime: '2026-10-06T09:30:00.123456Z' });
    expect(calls[0]).toEqual({ url: `${BASE}boards/me`, auth: 'Bearer ID-TOKEN' });
  });

  it('a missing document is null', async () => {
    const r = firestoreReader(async () => 't', fakeFetch({}).fn);
    expect(await r.getDoc('boards/none')).toBeNull();
  });

  it('lists a collection’s document ids across pages', async () => {
    const { fn } = fakeFetch({
      'boards/me/shared?pageSize=300': { status: 200, body: { documents: [{ name: 'projects/p/databases/(default)/documents/boards/me/shared/a' }], nextPageToken: 'P2' } },
      'boards/me/shared?pageSize=300&pageToken=P2': { status: 200, body: { documents: [{ name: 'projects/p/databases/(default)/documents/boards/me/shared/b' }] } },
    });
    expect(await firestoreReader(async () => 't', fn).listIds('boards/me/shared')).toEqual(['a', 'b']);
  });

  it('an empty collection is an empty list', async () => {
    const { fn } = fakeFetch({ 'boards/me/shared?pageSize=300': { status: 200, body: {} } });
    expect(await firestoreReader(async () => 't', fn).listIds('boards/me/shared')).toEqual([]);
  });

  it('a refusal says the account may not be on the invite list', async () => {
    const { fn } = fakeFetch({ 'boards/me': { status: 403, body: { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } } } });
    await expect(firestoreReader(async () => 't', fn).getDoc('boards/me')).rejects.toThrow(/invite list/);
  });
});

describe('reading everything for one person', () => {
  it('own boards plus shared ones, with who shared them; a share they lost access to is skipped', async () => {
    const { fn } = fakeFetch({
      'boards/me': doc('boards/me', { data: { stringValue: ownRaw() } }),
      'boards/me/shared?pageSize=300': { status: 200, body: { documents: ['s1', 's2', 's3'].map((id) => ({ name: `x/documents/boards/me/shared/${id}` })) } },
      'shared/s1': doc('shared/s1', { owner: { stringValue: 'u2' }, root: { stringValue: 'trip' }, data: { stringValue: tripRaw }, rev: { integerValue: '4' } }),
      'shared/s1/members/u2': doc('shared/s1/members/u2', { name: { stringValue: 'Erika' } }),
      'shared/s2': { status: 403, body: { error: { code: 403, status: 'PERMISSION_DENIED', message: 'no' } } },
      'shared/s3': doc('shared/s3', { owner: { stringValue: 'me' }, root: { stringValue: 'trip' }, data: { stringValue: tripRaw } }),
    });
    const snap = await readSnapshot(firestoreReader(async () => 't', fn), 'me');
    expect(snap.own).toBe(ownRaw());
    expect(snap.shares).toEqual([
      { id: 's1', owner: 'u2', ownerName: 'Erika', mine: false, raw: tripRaw },
      { id: 's3', owner: 'me', ownerName: 'you', mine: true, raw: tripRaw },
    ]);
  });

  it('no online board yet and no shares', async () => {
    const { fn } = fakeFetch({ 'boards/me/shared?pageSize=300': { status: 200, body: {} } });
    expect(await readSnapshot(firestoreReader(async () => 't', fn), 'me')).toEqual({ own: null, shares: [] });
  });

  it('a sharer whose name can’t be read is "someone"', async () => {
    const { fn } = fakeFetch({
      'boards/me/shared?pageSize=300': { status: 200, body: { documents: [{ name: 'x/documents/boards/me/shared/s1' }] } },
      'shared/s1': doc('shared/s1', { owner: { stringValue: 'u2' }, data: { stringValue: tripRaw } }),
    });
    expect((await readSnapshot(firestoreReader(async () => 't', fn), 'me')).shares[0].ownerName).toBe('someone');
  });
});
