import type { StorageLike } from '../model/persist';
import { serverBackend, type CollabServer, type Person } from '../store/collab';

// Demo people for trying editing together locally (`npm run dev`, then ?demo-user=Alice in one
// window and ?demo-user=Bob in another). Each demo person keeps their own boards on this device,
// and shared boards go through the pretend server in the dev server (src/sync/devServer.ts).

/** The demo person this page is for, if any (only when running locally). */
export function demoUser(): Person | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const name = new URLSearchParams(location.search).get('demo-user')?.trim();
  if (!name || !/^[\p{L}\p{N} _-]{1,40}$/u.test(name)) return null;
  return { uid: `demo-${name.toLowerCase()}`, name, photo: null };
}

/** The device's storage, kept apart for each demo person. */
export function demoStorage(storage: Storage, person: Person): StorageLike & { removeItem(key: string): void } {
  const key = (k: string) => `${person.uid}:${k}`;
  return { getItem: (k) => storage.getItem(key(k)), setItem: (k, v) => storage.setItem(key(k), v), removeItem: (k: string) => storage.removeItem(key(k)) };
}

class CallError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Talks to the pretend server in the dev server. */
export function demoBackend(person: Person) {
  const base = `${import.meta.env.BASE_URL}__collab`;
  async function call(method: string, ...args: unknown[]) {
    const res = await fetch(`${base}/call`, { method: 'POST', body: JSON.stringify({ who: person, method, args }) });
    const body = (await res.json()) as { ok?: unknown; error?: { code: string; message: string } };
    if (body.error) throw new CallError(body.error.code, body.error.message);
    return body.ok;
  }
  function watch(what: string, id: string, onChange: (value: never) => void, onError: (e: unknown) => void) {
    const q = new URLSearchParams({ who: JSON.stringify(person), what, id });
    const events = new EventSource(`${base}/watch?${q}`);
    events.onmessage = (e) => {
      const msg = JSON.parse(e.data) as { value?: never; error?: { code: string } };
      if (msg.error) onError(new CallError(msg.error.code, 'refused'));
      else onChange(msg.value as never);
    };
    return () => events.close();
  }
  const server: CollabServer = {
    watchMyShares: (_who, onChange, onError) => watch('shares', '', onChange, onError),
    watchShare: (_who, id, onChange, onError) => watch('share', id, onChange, onError),
    watchPeople: (_who, id, onChange, onError) => watch('people', id, onChange, onError),
    read: (_who, id) => call('read', id) as Promise<{ data: string; rev: number }>,
    write: (_who, id, data, client, rev) => call('write', id, data, client, rev) as Promise<boolean>,
    createShare: async (_who, ...args) => void (await call('createShare', ...args)),
    join: async (_who, ...args) => (await call('join', ...args)) === true,
    leave: async (_who, ...args) => void (await call('leave', ...args)),
    removePerson: async (_who, ...args) => void (await call('removePerson', ...args)),
    setLink: async (_who, ...args) => void (await call('setLink', ...args)),
    deleteShare: async (_who, ...args) => void (await call('deleteShare', ...args)),
  };
  return serverBackend(server, person);
}

/** Starts editing together for a demo person (local runs only). */
export async function startDemo(person: Person) {
  const [{ appStore }, { startSharing }, { collab, joinFromAddress }, { flushWhenHidden }, { activeVersionStore }, { deleteAccountData }, { account, finishDeletion }, { feedback }] = await Promise.all([
    import('../store/appStore'),
    import('../store/sharing'),
    import('./collabSession'),
    import('./pageHide'),
    import('../store/versions'),
    import('../store/account'),
    import('./account'),
    import('./feedback'),
  ]);
  // Send feedback, as on the published site (job #69): the dev server takes the note and drops it.
  feedback.setSender(async (text) => {
    const res = await fetch(`${import.meta.env.BASE_URL}__collab/feedback`, { method: 'POST', body: JSON.stringify({ text, uid: person.uid }) });
    if (!res.ok) throw new Error('Not sent');
  });
  const backend = demoBackend(person);
  const start = () => {
    const next = startSharing(appStore, backend, {
      client: crypto.randomUUID(),
      storage: demoStorage(localStorage, person),
      onNotice: collab.setNotice,
      onReady: () => joinFromAddress(appStore, next),
      versions: activeVersionStore,
    });
    collab.set(next, person);
    return next;
  };
  let sharing = start();
  flushWhenHidden(document, window, () => sharing.flush());
  window.addEventListener('online', () => sharing.retry());
  // Delete account, as on the published site (job #63): a demo person's own boards are only on
  // this device, so online there are just their shares.
  account.setRemover(async () => {
    const shares = appStore.getState().ui.shares.map((s) => ({ id: s.id, owner: s.ownerUid }));
    sharing.flush();
    sharing.stop();
    let done: { shareIds: string[] };
    try {
      done = await deleteAccountData(person.uid, { myShares: async () => shares, deleteShare: backend.deleteShare, leave: backend.leave, markDeleting: async () => {}, unmarkDeleting: () => {}, deleteOwnData: async () => {}, markDeleted: async () => {}, deleteUser: async () => {} });
    } catch (e) {
      sharing = start();
      throw e;
    }
    finishDeletion(appStore, localStorage, person.uid, done.shareIds, `${person.uid}:`);
  });
}
