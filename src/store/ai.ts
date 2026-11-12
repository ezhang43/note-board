import { useSyncExternalStore } from "react";
import { AI_KEY_NAME, AI_KEY_NAMES, AI_KEY_USER_NAME } from "../model/aiKey";

// The person's own Anthropic API key and the AI settings (wow plan, job 12a), kept in this browser only.
//
// - The key is NOT board data. It lives here, never in the store's state, a saved board, Version history,
//   an export or the sync (so never in Firestore). Nothing in the app uses it yet.
// - By default it is in sessionStorage (gone when the tab or browser is closed). With "Remember on this
//   device" it is in localStorage instead. It is saved with the id of the person it belongs to, and
//   getKey only gives it back to that person, so a second account on this browser never sees it.
// - Every storage name is in AI_STORAGE_KEYS. Signing out, a change of person (dropAiKeyUnlessFor in src/model/aiKey.ts)
//   and deleting an account (AI_KEY_NAMES in accountKeys) clear the key and whose it is; the model, limit and count are device settings and stay (job 12b).
// - Every read and write is wrapped: blocked or full storage means "no key", never a crash.

const KEY_NAME = AI_KEY_NAME;
const KEY_USER_NAME = AI_KEY_USER_NAME;
const MODEL_NAME = "note-board:ai-model";
const CAP_NAME = "note-board:ai-cap";
const USES_NAME = "note-board:ai-uses";

/** Every storage name this file uses, in either storage. The first two are the secret (the key and whose it is). */
export const AI_STORAGE_KEYS = [
  KEY_NAME,
  KEY_USER_NAME,
  MODEL_NAME,
  CAP_NAME,
  USES_NAME,
] as const;
export const AI_MODELS = [
  { id: "claude-haiku-5-5", name: "Haiku 5.5", note: "Fast, cheapest" },
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5", note: "Better" },
  { id: "claude-opus-5-5", name: "Opus 5.5", note: "Best" },
] as const;
export const DEFAULT_MODEL: string = AI_MODELS[0].id;
export const DEFAULT_CAP = 200;
export const CAP_MAX = 9999;
const KEY_MAX = 400;

type Place = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

/** What the key looks like on screen after saving: `sk-ant-…` and its last four letters, never more. Anything that is not a long key of that kind shows nothing of it. */
export function maskKey(key: string): string {
  return key.startsWith("sk-ant-") && key.length >= 24
    ? `sk-ant-…${key.slice(-4)}`
    : "…";
}

const monthOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function createAiStore({
  session,
  device,
  now,
}: {
  session: Place;
  device: Place;
  now: () => Date;
}) {
  let rev = 0;
  const listeners = new Set<() => void>();
  const changed = () => {
    rev++;
    listeners.forEach((l) => l());
  };
  const read = (place: Place, name: string): string | null => {
    try {
      return place?.getItem(name) ?? null;
    } catch {
      return null;
    }
  };
  /** Says whether it was saved. */
  const write = (place: Place, name: string, value: string): boolean => {
    try {
      if (!place) return false;
      place.setItem(name, value);
      return true;
    } catch {
      return false;
    }
  };
  const remove = (place: Place, name: string) => {
    try {
      place?.removeItem(name);
    } catch {
      // Blocked storage: nothing to remove.
    }
  };
  const wipeKey = () =>
    [session, device].forEach((p) =>
      AI_KEY_NAMES.forEach((n) => remove(p, n)),
    );
  /** The place the key is in: this browser session's first, then the device's. */
  const holder = (): Place =>
    read(session, KEY_NAME) ? session : read(device, KEY_NAME) ? device : null;
  const hasKeyHere = () => holder() !== null;

  const store = {
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    /** Changes whenever anything here changes (for useSyncExternalStore). */
    rev: () => rev,

    /** The key, but only for the person it was saved for (`uid`; null when not signed in). */
    getKey(uid: string | null): string | null {
      const place = holder();
      if (!place) return null;
      return (read(place, KEY_USER_NAME) ?? "") === (uid ?? "")
        ? read(place, KEY_NAME)
        : null;
    },
    hasKey: (uid: string | null) => store.getKey(uid) !== null,
    /** Whether the key is kept on this device (ticked "Remember") rather than for this browser session. */
    isRemembered: () => !!read(device, KEY_NAME),
    /** Saves the key for `uid`, in sessionStorage unless `remember`. False when it is not a usable key or storage said no (a key saved before is then kept). */
    setKey(
      key: string,
      { remember, uid }: { remember: boolean; uid: string | null },
    ): boolean {
      const k = key.trim();
      if (!k || /\s/.test(k) || k.length > KEY_MAX) return false;
      const [keep, other] = remember ? [device, session] : [session, device];
      // Each name with what it held, so putting back never relies on the order of any other list.
      const before = AI_KEY_NAMES.map((n) => [n, read(keep, n)] as const);
      if (!write(keep, KEY_NAME, k) || !write(keep, KEY_USER_NAME, uid ?? "")) {
        // Put back what was there: never half a key, never a key with no owner, never a lost old key.
        before.forEach(([n, v]) =>
          v === null ? remove(keep, n) : write(keep, n, v),
        );
        return false;
      }
      remove(other, KEY_NAME);
      remove(other, KEY_USER_NAME);
      changed();
      return true;
    },
    /** Moves a saved key to or from the device without asking for it again. False when the place refuses it (the key stays where it was). */
    setRemember(remember: boolean): boolean {
      const from = holder();
      const key = from && read(from, KEY_NAME);
      if (!from || !key || (from === device) === remember) return true;
      const to = remember ? device : session;
      if (
        !write(to, KEY_NAME, key) ||
        !write(to, KEY_USER_NAME, read(from, KEY_USER_NAME) ?? "")
      ) {
        remove(to, KEY_NAME);
        remove(to, KEY_USER_NAME);
        return false;
      }
      remove(from, KEY_NAME);
      remove(from, KEY_USER_NAME);
      changed();
      return true;
    },
    /** Removes the key from this browser (both places). (Signing out and deleting an account clear the same names directly, job 12b.) */
    forgetKey() {
      wipeKey();
      changed();
    },
    /** Whether any key is saved at all, whoever's it is. */
    hasAnyKey: hasKeyHere,
    /** The saved key's masked look, whoever's it is (the dialog shows this only to the person it belongs to). */
    maskedKey(uid: string | null): string | null {
      const key = store.getKey(uid);
      return key && maskKey(key);
    },

    getModel(): string {
      const saved = read(device, MODEL_NAME);
      return AI_MODELS.some((m) => m.id === saved) ? saved! : DEFAULT_MODEL;
    },
    setModel(id: string): boolean {
      if (!AI_MODELS.some((m) => m.id === id)) return false;
      const ok = write(device, MODEL_NAME, id);
      changed();
      return ok;
    },

    getCap(): number {
      const n = Number(read(device, CAP_NAME));
      return Number.isInteger(n) && n >= 1 && n <= CAP_MAX ? n : DEFAULT_CAP;
    },
    /** The most uses a month. False for anything but a whole number from 1 to 9999. */
    setCap(n: number): boolean {
      if (!Number.isInteger(n) || n < 1 || n > CAP_MAX) return false;
      write(device, CAP_NAME, String(n));
      changed();
      return true;
    },
    usesThisMonth(): number {
      try {
        const u = JSON.parse(read(device, USES_NAME) ?? "null") as {
          month?: unknown;
          count?: unknown;
        } | null;
        return u?.month === monthOf(now()) &&
          typeof u.count === "number" &&
          Number.isInteger(u.count) &&
          u.count > 0
          ? u.count
          : 0;
      } catch {
        return 0;
      }
    },
    // simple: two tabs can both read the same count and add one, so the cap can be passed by a use or two. It is a safety stop beside the spend limit, not a meter; callers check canUse() before each request.
    /** For the AI features to call once per request: counts one use this month. */
    recordUse() {
      write(
        device,
        USES_NAME,
        JSON.stringify({
          month: monthOf(now()),
          count: store.usesThisMonth() + 1,
        }),
      );
      changed();
    },
    /** False once this month's uses reach the cap. */
    canUse: () => store.usesThisMonth() < store.getCap(),
  };
  return store;
}

const place = (get: () => Storage): Place => {
  try {
    return get();
  } catch {
    return null;
  }
};
/** The one this page uses. */
export const ai = createAiStore({
  session: place(() => window.sessionStorage),
  device: place(() => window.localStorage),
  now: () => new Date(),
});

/** Re-renders when anything in the AI settings changes. */
export const useAiSettings = () => useSyncExternalStore(ai.subscribe, ai.rev);
