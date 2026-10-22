import { commentable, commentText, type Comment } from '../model/comments';

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

/** What someone may do on a shared board (job 161). */
export type Role = 'edit' | 'comment' | 'view';
export const ROLES: readonly Role[] = ['edit', 'comment', 'view'];
/** The roles above `role` (whose links someone lowered to it may have seen). */
export const above = (role: Role) => ROLES.slice(0, ROLES.indexOf(role));
/** Whether going from role `had` to `role` lowers someone. */
export const lowers = (had: Role, role: Role) => ROLES.indexOf(role) > ROLES.indexOf(had);
/** Someone on a shared board, with their role. */
export interface Member extends Person {
  role: Role;
}

/**
 * A shared board's three links (job 161): each role's secret key, or null while that link is off.
 * Only editors are given them (null for everyone else). `roles`: a comment or view link was ever
 * made, so the edit link already changed once for it (D1).
 */
export interface Links {
  edit: string | null;
  comment: string | null;
  view: string | null;
  roles: boolean;
}
export const NO_LINKS: Links = { edit: null, comment: null, view: null, roles: false };
/** A new key for each role, for whichever of them a change needs. */
export type NewKeys = Record<Role, string>;

/** A shared board online: its boards' JSON (see serializeShare) and who may do what. */
export interface ShareDoc {
  /** The person who shared it. */
  owner: string;
  /** The shared board (the others are inside it). */
  root: string;
  /** Its links; undefined while not known yet (the last ones known stay). */
  links: Links | undefined;
  data: string;
  /** Which open page last wrote it. */
  client: string;
  /** Counts the saves, so an older version is never taken for a newer one. */
  rev: number;
}

/** A new comment as the app sends it (job 161, PR 4): the server adds who wrote it and when. */
export interface NewComment {
  id: string;
  card: string;
  text: string;
  /** As on the author's member record (the rules check it). */
  name: string;
  photo: string | null;
}

/** A thing that was refused because the person isn't allowed to (not a member, not the owner, wrong link). */
class NotAllowed extends Error {
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
  /** Everyone who has a shared board (its owner first), with their roles. */
  watchPeople(id: string, onChange: (people: Member[]) => void, onError: (e: unknown) => void): () => void;
  /**
   * Reads the latest boards and writes `change(latest)` in one go: if someone else wrote in between,
   * it reads again and calls `change` again (`change` returns null to write nothing). Resolves
   * with the boards online afterwards and their save count.
   */
  updateShare(id: string, change: (latest: string) => string | null, client: string): Promise<{ data: string; rev: number }>;
  createShare(id: string, root: string, link: string, data: string, client: string): Promise<void>;
  /**
   * Joins with a share link's key (refused if the link is wrong or turned off), with the role of
   * that link; someone already on it never gets a lower role than theirs. Resolves true only if this
   * join added the person (they weren't on it already); when unsure, false.
   */
  join(id: string, key: string): Promise<boolean>;
  leave(id: string): Promise<void>;
  /**
   * Owner only: removes someone and changes every link that is on to its key in `keys`, in one go,
   * so the copy of a link they have never lets them back in, not even for a moment. A link turned
   * off stays off (decided online, so a page that hasn't heard of it yet can't turn it back on).
   */
  removePerson(id: string, uid: string, keys: NewKeys): Promise<void>;
  /**
   * Owner only: turns `role`'s link on with a new key (`keys[role]`). The first comment or view link
   * also changes an edit link that is on to `keys.edit`, in the same step (D1).
   */
  makeLink(id: string, role: Role, keys: NewKeys): Promise<void>;
  /** Owner only: turns all three links off (D4). */
  linksOff(id: string): Promise<void>;
  /**
   * Owner only: changes someone else's role. Lowering them changes, in the same step, every link
   * that is on for a role above their new one (they may have seen those links).
   */
  setRole(id: string, uid: string, role: Role, keys: NewKeys): Promise<void>;
  /** Owner only. */
  deleteShare(id: string): Promise<void>;
  /** Its comments as they change (everyone on it; job 161, PR 4). */
  watchComments(id: string, onChange: (comments: Comment[]) => void, onError: (e: unknown) => void): () => void;
  /** Editors and commenters: a comment as this person. */
  addComment(id: string, comment: NewComment): Promise<void>;
  /** Resolves or reopens the thread kept on comment `commentId` (editors; commenters on their own). */
  resolveComment(id: string, commentId: string, resolved: boolean): Promise<void>;
  /** Its author, or the person who shared the board. */
  deleteComment(id: string, commentId: string): Promise<void>;
  /** Every comment this person wrote on it (deleting their account); nothing if they aren't on it. */
  deleteMyComments(id: string): Promise<void>;
}

/**
 * The few things a server has to do; `updateShare` is built on top of read + write-if-unchanged.
 * The pretend server (memoryServer) and the dev server bridge both offer this.
 */
export interface CollabServer {
  watchMyShares(who: Person, onChange: (ids: string[]) => void, onError: (e: unknown) => void): () => void;
  watchShare(who: Person, id: string, onChange: (doc: ShareDoc | null) => void, onError: (e: unknown) => void): () => void;
  watchPeople(who: Person, id: string, onChange: (people: Member[]) => void, onError: (e: unknown) => void): () => void;
  read(who: Person, id: string): Promise<{ data: string; rev: number }>;
  /** Writes only if the share is still at `rev`; false if someone wrote first. */
  write(who: Person, id: string, data: string, client: string, rev: number): Promise<boolean>;
  createShare(who: Person, id: string, root: string, link: string, data: string, client: string): Promise<void>;
  join(who: Person, id: string, key: string): Promise<boolean>;
  leave(who: Person, id: string): Promise<void>;
  removePerson(who: Person, id: string, uid: string, keys: NewKeys): Promise<void>;
  makeLink(who: Person, id: string, role: Role, keys: NewKeys): Promise<void>;
  linksOff(who: Person, id: string): Promise<void>;
  setRole(who: Person, id: string, uid: string, role: Role, keys: NewKeys): Promise<void>;
  deleteShare(who: Person, id: string): Promise<void>;
  watchComments(who: Person, id: string, onChange: (comments: Comment[]) => void, onError: (e: unknown) => void): () => void;
  addComment(who: Person, id: string, comment: NewComment): Promise<void>;
  resolveComment(who: Person, id: string, commentId: string, resolved: boolean): Promise<void>;
  deleteComment(who: Person, id: string, commentId: string): Promise<void>;
  deleteMyComments(who: Person, id: string): Promise<void>;
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
    removePerson: (id, uid, keys) => server.removePerson(me, id, uid, keys),
    makeLink: (id, role, keys) => server.makeLink(me, id, role, keys),
    linksOff: (id) => server.linksOff(me, id),
    setRole: (id, uid, role, keys) => server.setRole(me, id, uid, role, keys),
    deleteShare: (id) => server.deleteShare(me, id),
    watchComments: (id, onChange, onError) => server.watchComments(me, id, onChange, onError),
    addComment: (id, comment) => server.addComment(me, id, comment),
    resolveComment: (id, commentId, resolved) => server.resolveComment(me, id, commentId, resolved),
    deleteComment: (id, commentId) => server.deleteComment(me, id, commentId),
    deleteMyComments: (id) => server.deleteMyComments(me, id),
  };
}

interface Stored extends Omit<ShareDoc, 'links'> {
  links: Links;
  people: Member[];
  comments: Comment[];
}

/**
 * A pretend server kept in memory, with the same rules as firestore.rules: only people a board is
 * shared with can read it, and only its editors change it; joining needs a current link, and gives
 * that link's role (never lowering someone already on it); only editors see the links; only the
 * owner changes links or roles, removes people or deletes it, and removing or lowering someone
 * changes the links they may have. Changes reach watchers a moment later, as over a network.
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
  const roleIn = (who: Person, s: Stored | undefined) => s?.people.find((p) => p.uid === who.uid)?.role ?? null;
  const member = (who: Person, s: Stored | undefined) => roleIn(who, s) !== null;
  const owns = (who: Person, s: Stored | undefined) => Boolean(s && s.owner === who.uid);
  /** Every link that is on, for `roles`, gets its new key. */
  const change = (s: Stored, roles: readonly Role[], keys: NewKeys) => roles.forEach((r) => s.links[r] !== null && (s.links[r] = keys[r]));
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
        const links = roleIn(who, s) === 'edit' ? { ...s.links } : { ...NO_LINKS };
        const doc = { owner: s.owner, root: s.root, links, data: s.data, client: s.client, rev: s.rev };
        const now = JSON.stringify([doc.rev, doc.links]);
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
      check(roleIn(who, s) === 'edit' && !control.refuse);
      if (s!.rev !== rev) return false;
      Object.assign(s!, { data, client, rev: rev + 1 });
      notify();
      return true;
    },
    async createShare(who, id, root, link, data, client) {
      check(!shares.has(id));
      shares.set(id, { owner: who.uid, root, links: { ...NO_LINKS, edit: link }, data, client, rev: 1, people: [{ ...who, role: 'edit' }], comments: [] });
      addMine(who.uid, id);
      notify();
    },
    async join(who, id, key) {
      const s = shares.get(id);
      const had = roleIn(who, s);
      const got = s ? (ROLES.find((r) => s.links[r] !== null && s.links[r] === key) ?? null) : null;
      check(Boolean(s && (had || got)));
      const role = s!.owner === who.uid ? 'edit' : !had || (got && lowers(got, had)) ? got! : had;
      const added = !had;
      s!.people = added ? [...s!.people, { ...who, role }] : s!.people.map((p) => (p.uid === who.uid ? { ...p, role } : p));
      addMine(who.uid, id);
      notify();
      return added;
    },
    async leave(who, id) {
      check(true);
      const s = shares.get(id);
      if (s && s.owner !== who.uid) s.people = s.people.filter((p) => p.uid !== who.uid);
      dropMine(who.uid, id);
      notify();
    },
    async removePerson(who, id, uid, keys) {
      const s = shares.get(id);
      check(owns(who, s) && uid !== who.uid);
      s!.people = s!.people.filter((p) => p.uid !== uid);
      change(s!, ROLES, keys);
      notify();
    },
    async makeLink(who, id, role, keys) {
      const s = shares.get(id);
      check(owns(who, s));
      // D1: the first comment or view link changes the edit link.
      if (role !== 'edit' && !s!.links.roles) change(s!, ['edit'], keys);
      s!.links = { ...s!.links, [role]: keys[role], roles: s!.links.roles || role !== 'edit' };
      notify();
    },
    async linksOff(who, id) {
      const s = shares.get(id);
      check(owns(who, s));
      s!.links = { ...NO_LINKS, roles: s!.links.roles };
      notify();
    },
    async setRole(who, id, uid, role, keys) {
      const s = shares.get(id);
      const had = s?.people.find((p) => p.uid === uid)?.role;
      check(owns(who, s) && uid !== s!.owner && Boolean(had));
      if (had === role) return;
      if (lowers(had!, role)) {
        change(s!, above(role), keys);
        s!.links = { ...s!.links, roles: true };
      }
      s!.people = s!.people.map((p) => (p.uid === uid ? { ...p, role } : p));
      notify();
    },
    async deleteShare(who, id) {
      const s = shares.get(id);
      check(Boolean(s && s.owner === who.uid));
      shares.delete(id); // its comments with it
      dropMine(who.uid, id);
      notify();
    },
    watchComments(who, id, onChange) {
      let last = '';
      return watch(() => {
        const s = shares.get(id);
        if (!s || !member(who, s)) return;
        const json = JSON.stringify(s.comments);
        if (json !== last) onChange(s.comments.map((c) => ({ ...c })));
        last = json;
      });
    },
    async addComment(who, id, c) {
      const s = shares.get(id);
      const role = roleIn(who, s);
      const me = s?.people.find((p) => p.uid === who.uid);
      // As firestore.rules: editors and commenters, as themselves (name and photo as on People), 1 to 1,000 characters, a safe card id.
      check((role === 'edit' || role === 'comment') && commentText(c.text) === c.text && commentable(c.card) && me?.name === c.name && me.photo === c.photo && !s!.comments.some((x) => x.id === c.id));
      s!.comments = [...s!.comments, { id: c.id, card: c.card, text: c.text, author: who.uid, name: c.name, photo: c.photo, at: Date.now(), resolved: false, resolvedAt: null }];
      notify();
    },
    async resolveComment(who, id, commentId, resolved) {
      const s = shares.get(id);
      const role = roleIn(who, s);
      const c = s?.comments.find((x) => x.id === commentId);
      check(Boolean(c) && (role === 'edit' || (role === 'comment' && c!.author === who.uid)));
      s!.comments = s!.comments.map((x) => (x === c ? { ...x, resolved, resolvedAt: Date.now() } : x));
      notify();
    },
    async deleteComment(who, id, commentId) {
      const s = shares.get(id);
      const c = s?.comments.find((x) => x.id === commentId);
      check(Boolean(c) && (c!.author === who.uid || s!.owner === who.uid));
      s!.comments = s!.comments.filter((x) => x !== c);
      notify();
    },
    async deleteMyComments(who, id) {
      check(true);
      const s = shares.get(id);
      if (!s || !member(who, s)) return;
      s.comments = s.comments.filter((x) => x.author !== who.uid);
      notify();
    },
  };
  return { server, control, shares, backendFor: (who: Person) => serverBackend(server, who) };
}
