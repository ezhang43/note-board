import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../model/board';
import { createCard } from '../model/cards';
import type { StorageLike } from '../model/persist';
import type { Workspace } from '../model/workspace';
import { memoryServer, type Person, type Role } from './collab';
import { createShareComments } from './shareComments';
import { commentsSeenKey } from './shareStorage';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const person = (uid: string): Person => ({ uid, name: uid[0].toUpperCase() + uid.slice(1), photo: null });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function makeWorkspace() {
  const home = { ...createBoard(), name: 'Home' };
  const trip = { ...createBoard(), name: 'Trip' };
  const note = createCard('note', 'n1');
  trip.cards[note.id] = note;
  const ws: Workspace = { home: 'home', boards: { home, trip } };
  return { ws, noteId: note.id };
}

describe('createShareComments', () => {
  it('watches comments, notifies onChange, and cleans up on stop', async () => {
    const server = memoryServer();
    const aliceBackend = server.backendFor(person('alice'));
    await aliceBackend.createShare('s1', 'trip', 'k1', '{}', 'c1');
    const storage = memoryStorage();
    const { ws, noteId } = makeWorkspace();
    const onChange = vi.fn();

    const comments = createShareComments({
      backend: aliceBackend,
      storage,
      workspace: () => ws,
      getShare: (id) => (id === 's1' ? { people: [{ ...person('alice'), role: 'edit' }], role: 'edit', boardIds: ['trip'] } : null),
      onChange,
    });

    const stop = comments.watch('s1');
    await vi.advanceTimersByTimeAsync(100);
    expect(comments.commentsOf('s1')).toEqual([]);

    await comments.addComment('s1', noteId, '  Hello world  ');
    await vi.advanceTimersByTimeAsync(100);
    expect(comments.commentsOf('s1')).toHaveLength(1);
    expect(comments.thread('s1', noteId).comments[0].text).toBe('Hello world');
    expect(onChange).toHaveBeenCalled();

    stop();
    expect(comments.commentsOf('s1')).toEqual([]);
  });

  it('enforces share existence, role, card presence, and text length', async () => {
    const server = memoryServer();
    const bobBackend = server.backendFor(person('bob'));
    const storage = memoryStorage();
    const { ws, noteId } = makeWorkspace();
    let role: Role | null = 'view';

    const comments = createShareComments({
      backend: bobBackend,
      storage,
      workspace: () => ws,
      getShare: (id) => (id === 's1' ? { people: [], role, boardIds: ['trip'] } : null),
      onChange: () => {},
    });

    await expect(comments.addComment('missing', noteId, 'hi')).rejects.toThrow('Not a shared board');
    await expect(comments.addComment('s1', noteId, 'hi')).rejects.toThrow('You can’t comment on this board');

    role = 'comment';
    await expect(comments.addComment('s1', 'missing-card', 'hi')).rejects.toThrow('That card isn’t on this shared board');
    await expect(comments.addComment('s1', noteId, '   ')).rejects.toThrow('A comment is 1 to 1,000 characters');
    await expect(comments.resolve('s1', noteId, true)).rejects.toThrow('No comments on that card');
  });

  it('tracks seen timestamps for others’ comments only and drops them when a share is removed', async () => {
    const server = memoryServer();
    const aliceBackend = server.backendFor(person('alice'));
    const bobBackend = server.backendFor(person('bob'));
    await aliceBackend.createShare('s1', 'trip', 'k1', '{}', 'c1');
    await bobBackend.join('s1', 'k1');
    const storage = memoryStorage();
    const { ws, noteId } = makeWorkspace();
    const onChange = vi.fn();

    const comments = createShareComments({
      backend: aliceBackend,
      storage,
      workspace: () => ws,
      getShare: (id) => (id === 's1' ? { people: [{ ...person('alice'), role: 'edit' }], role: 'edit', boardIds: ['trip'] } : null),
      onChange,
    });
    const stop = comments.watch('s1');
    await bobBackend.addComment('s1', { id: 'm1', card: noteId, text: 'from bob', name: 'Bob', photo: null });
    await aliceBackend.addComment('s1', { id: 'm2', card: noteId, text: 'from alice', name: 'Alice', photo: null });
    await vi.advanceTimersByTimeAsync(100);

    const bobAt = server.shares.get('s1')!.comments[0].at;
    onChange.mockClear();
    comments.markSeen('s1', noteId);
    expect(comments.seenOf('s1')).toEqual({ [noteId]: bobAt });
    expect(JSON.parse(storage.data.get(commentsSeenKey('alice'))!)).toEqual({ [`s1/${noteId}`]: bobAt });
    expect(onChange).toHaveBeenCalledTimes(1);

    // Calling markSeen again with no newer comment is a no-op.
    comments.markSeen('s1', noteId);
    expect(onChange).toHaveBeenCalledTimes(1);

    comments.dropSeen('s1');
    expect(comments.seenOf('s1')).toEqual({});
    expect(JSON.parse(storage.data.get(commentsSeenKey('alice'))!)).toEqual({});
    stop();
  });
});
