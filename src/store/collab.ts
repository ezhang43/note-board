// Where shared boards live online (Firestore on the published site; a pretend server in tests and
// in `npm run dev` with ?demo-user=). Each person talks to it through a CollabBackend.

/** Someone who can open a shared board. */
export interface Person {
  uid: string;
  name: string;
  photo: string | null;
}

/**
 * Someone as the people a board is shared with see them: their Google name (never their email
 * address, which a share link could show to strangers) and photo (only from a secure address).
 */
export function personFrom(user: { uid: string; displayName?: string | null; photoURL?: string | null; email?: string | null }): Person {
  const photo = user.photoURL && user.photoURL.startsWith('https://') && user.photoURL.length <= 2000 ? user.photoURL : null;
  return { uid: user.uid, name: user.displayName?.trim().slice(0, 200) || 'Someone', photo };
}

/** A shared board online: its boards' JSON (see serializeShare) and who may do what. */
export interface ShareDoc {
  /** The person who shared it. */
  owner: string;
  /** The shared board (the others are inside it). */
  root: string;
  /** The key in the current share link, or null when the link is turned off. */
  link: string | null;
  data: string;
  /** Which open page last wrote it. */
  client: string;
  /** Counts the saves, so an older version is never taken for a newer one. */
  rev: number;
}

/** A thing that was refused because the person isn't allowed to (not a member, not the owner, wrong link). */
export class NotAllowed extends Error {
  code = 'permission-denied';
}

export interface CollabBackend {
  readonly me: Person;
  /**
   * The shares this person has (shared by them or joined). `confirmed` is false for a list from
   * the device's offline copy, which may be out of date: a share missing from it isn't taken as left.
   */
  watchMyShares(onChange: (ids: string[], confirmed: boolean) => void, onError: (e: unknown) => void): () => void;
  /** A shared board as it changes; null once it is deleted. onError gets NotAllowed once access is lost. */
  watchShare(id: string, onChange: (doc: ShareDoc | null) => void, onError: (e: unknown) => void): () => void;
  /** Everyone who has a shared board (its owner first). */
  watchPeople(id: string, onChange: (people: Person[]) => void, onError: (e: unknown) => void): () => void;
  /**
   * Reads the latest boards and writes `change(latest)` in one go: if someone else wrote in between,
   * it reads again and calls `change` again (`change` returns null to write nothing). Resolves
   * with the boards online afterwards and their save count.
   */
  updateShare(id: string, change: (latest: string) => string | null, client: string): Promise<{ data: string; rev: number }>;
  createShare(id: string, root: string, link: string, data: string, client: string): Promise<void>;
  /** Joins with a share link's key (refused if the link is wrong or turned off). */
  join(id: string, key: string): Promise<void>;
  leave(id: string): Promise<void>;
  /**
   * Owner only: removes someone and, if the link is on, changes it to `newKey`, in one go, so the
   * copy of the link they have never lets them back in, not even for a moment. A link turned off
   * stays off (decided online, so a page that hasn't heard of it yet can't turn it back on).
   */
  removePerson(id: string, uid: string, newKey: string): Promise<void>;
  /** Owner only: a new link key, or null to turn the link off. */
  setLink(id: string, key: string | null): Promise<void>;
  /** Owner only. */
  deleteShare(id: string): Promise<void>;
}

/**
 * The few things a server has to do; `updateShare` is built on top of read + write-if-unchanged.
 * The pretend server (memoryServer) and the dev server bridge both offer this.
 */
export interface CollabServer {
  watchMyShares(who: Person, onChange: (ids: string[]) => void, onError: (e: unknown) => void): () => void;
  watchShare(who: Person, id: string, onChange: (doc: ShareDoc | null) => void, onError: (e: unknown) => void): () => void;
  watchPeople(who: Person, id: string, onChange: (people: Person[]) => void, onError: (e: unknown) => void): () => void;
  read(who: Person, id: string): Promise<{ data: string; rev: number }>;
  /** Writes only if the share is still at `rev`; false if someone wrote first. */
  write(who: Person, id: string, data: string, client: string, rev: number): Promise<boolean>;
  createShare(who: Person, id: string, root: string, link: string, data: string, client: string): Promise<void>;
  join(who: Person, id: string, key: string): Promise<void>;
  leave(who: Person, id: string): Promise<void>;
  removePerson(who: Person, id: string, uid: string, newKey: string): Promise<void>;
  setLink(who: Person, id: string, key: string | null): Promise<void>;
  deleteShare(who: Person, id: string): Promise<void>;
}

/** A CollabBackend for `me` on top of a CollabServer. */
export function serverBackend(server: CollabServer, me: Person): CollabBackend {
  return {
    me,
    watchMyShares: (onChange, onError) => server.watchMyShares(me, (ids) => onChange(ids, true), onError),
    watchShare: (id, onChange, onError) => server.watchShare(me, id, onChange, onError),
    watchPeople: (id, onChange, onError) => server.watchPeople(me, id, onChange, onError),
    async updateShare(id, change, client) {
      for (let tries = 0; tries < 20; tries++) {
        const { data, rev } = await server.read(me, id);
        const next = change(data);
        if (next === null || next === data) return { data, rev };
        if (await server.write(me, id, next, client, rev)) return { data: next, rev: rev + 1 };
      }
      throw new Error('Too many people saving at once');
    },
    createShare: (id, root, link, data, client) => server.createShare(me, id, root, link, data, client),
    join: (id, key) => server.join(me, id, key),
    leave: (id) => server.leave(me, id),
    removePerson: (id, uid, newKey) => server.removePerson(me, id, uid, newKey),
    setLink: (id, key) => server.setLink(me, id, key),
    deleteShare: (id) => server.deleteShare(me, id),
  };
}

interface Stored extends ShareDoc {
  people: Person[];
}

/**
 * A pretend server kept in memory, with the same rules as firestore.rules: only people a board is
 * shared with can read or change it; joining needs the current link; only the owner turns the link
 * off, removes people or deletes it. Changes reach watchers a moment later, as over a network.
 * `offline` makes every call fail, as without a connection.
 */
export function memoryServer(deliver: (fn: () => void) => void = (fn) => setTimeout(fn, 0)) {
  const shares = new Map<string, Stored>();
  const mine = new Map<string, Set<string>>();
  const watchers = new Set<() => void>();
  /** offline: every call fails, as without a connection. refuse: saves are refused, as past the size cap. writes: saves tried. */
  const control = { offline: false, refuse: false, writes: 0 };
  const notify = () => deliver(() => watchers.forEach((w) => w()));
  const myIds = (uid: string) => [...(mine.get(uid) ?? [])].sort();
  const member = (who: Person, s: Stored | undefined) => Boolean(s && s.people.some((p) => p.uid === who.uid));
  const check = (ok: boolean) => {
    if (control.offline) throw new Error('offline');
    if (!ok) throw new NotAllowed('Not allowed');
  };
  const addMine = (uid: string, id: string) => mine.set(uid, new Set([...(mine.get(uid) ?? []), id]));
  const dropMine = (uid: string, id: string) => mine.get(uid)?.delete(id);

  function watch(fn: () => void) {
    watchers.add(fn);
    deliver(fn);
    return () => {
      watchers.delete(fn);
    };
  }

  const server: CollabServer = {
    watchMyShares(who, onChange) {
      let last = '';
      return watch(() => {
        const ids = myIds(who.uid);
        if (JSON.stringify(ids) !== last) onChange(ids);
        last = JSON.stringify(ids);
      });
    },
    watchShare(who, id, onChange, onError) {
      let last = '';
      let stopped = false;
      let stop = () => {};
      stop = watch(() => {
        if (stopped) return;
        const s = shares.get(id);
        if (!s) {
          if (last !== 'gone') onChange(null);
          last = 'gone';
          return;
        }
        if (!member(who, s)) {
          stopped = true;
          stop();
          return onError(new NotAllowed('No longer shared with you'));
        }
        const doc = { owner: s.owner, root: s.root, link: s.link, data: s.data, client: s.client, rev: s.rev };
        const now = JSON.stringify([doc.rev, doc.link]);
        if (now === last) return;
        last = now;
        onChange(doc);
      });
      return () => {
        stopped = true;
        stop();
      };
    },
    watchPeople(who, id, onChange) {
      let last = '';
      return watch(() => {
        const s = shares.get(id);
        if (!s || !member(who, s)) return;
        const json = JSON.stringify(s.people);
        if (json !== last) onChange(s.people);
        last = json;
      });
    },
    async read(who, id) {
      const s = shares.get(id);
      check(member(who, s));
      return { data: s!.data, rev: s!.rev };
    },
    async write(who, id, data, client, rev) {
      const s = shares.get(id);
      control.writes++;
      check(member(who, s) && !control.refuse);
      if (s!.rev !== rev) return false;
      Object.assign(s!, { data, client, rev: rev + 1 });
      notify();
      return true;
    },
    async createShare(who, id, root, link, data, client) {
      check(!shares.has(id));
      shares.set(id, { owner: who.uid, root, link, data, client, rev: 1, people: [who] });
      addMine(who.uid, id);
      notify();
    },
    async join(who, id, key) {
      const s = shares.get(id);
      check(Boolean(s && (member(who, s) || (s.link !== null && s.link === key))));
      if (!member(who, s)) s!.people = [...s!.people, who];
      addMine(who.uid, id);
      notify();
    },
    async leave(who, id) {
      check(true);
      const s = shares.get(id);
      if (s && s.owner !== who.uid) s.people = s.people.filter((p) => p.uid !== who.uid);
      dropMine(who.uid, id);
      notify();
    },
    async removePerson(who, id, uid, newKey) {
      const s = shares.get(id);
      check(Boolean(s && s.owner === who.uid && uid !== who.uid));
      s!.people = s!.people.filter((p) => p.uid !== uid);
      if (s!.link !== null) s!.link = newKey;
      notify();
    },
    async setLink(who, id, key) {
      const s = shares.get(id);
      check(Boolean(s && s.owner === who.uid));
      s!.link = key;
      notify();
    },
    async deleteShare(who, id) {
      const s = shares.get(id);
      check(Boolean(s && s.owner === who.uid));
      shares.delete(id);
      dropMine(who.uid, id);
      notify();
    },
  };
  return { server, control, shares, backendFor: (who: Person) => serverBackend(server, who) };
}
