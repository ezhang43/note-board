import { useSyncExternalStore } from "react";
import { AI_KEY_NAME, AI_KEY_NAMES, AI_KEY_USER_NAME } from "../model/aiKey";
import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  CANCELLED,
  NETWORK_FAILURE,
  buildRequest,
  errorFor,
  fail,
  stoppedBy,
  readReply,
  usableKey,
  type AiFailure,
  type AiResult,
  type AiSchema,
  type Effort,
} from "../model/ai";

// The person's own Anthropic API key and the AI settings (wow plan, job 12a), kept in this browser only.
//
// - The key is NOT board data. It lives here, never in the store's state, a saved board, Version history,
//   an export or the sync (so never in Firestore). Only `ask` (askClaude) reads it, right before each request,
//   and puts it only in the x-api-key header of a request to api.anthropic.com (job 13).
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

export type AskArgs = {
  /** The signed-in person's id (null when signed out): only their own key is used. */
  uid: string | null;
  system: string;
  user: string;
  schema: AiSchema;
  /** A hard cap per use; thinking shares it, so AI features use about 16000 (wow plan, revisions). */
  maxTokens: number;
  effort?: Effort;
  signal?: AbortSignal;
};

const isAbort = (e: unknown) =>
  typeof e === "object" &&
  e !== null &&
  (e as { name?: unknown }).name === "AbortError";

export function createAiStore({
  session,
  device,
  now,
  fetch: send = (...a) => globalThis.fetch(...a),
}: {
  session: Place;
  device: Place;
  now: () => Date;
  /** Handed in so tests never reach the network. */
  fetch?: typeof globalThis.fetch;
}) {
  let rev = 0;
  const listeners = new Set<() => void>();
  // Test key requests running now, each stopped as soon as the key or model it started with changes.
  const running = new Set<() => void>();
  const changed = () => {
    rev++;
    running.forEach((stopIfChanged) => stopIfChanged());
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
      if (!usableKey(k) || k.length > KEY_MAX) return false;
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
    /** For the page's storage event (another tab changed the key or a setting): tells the screen, and stops a Test key whose key or model went. */
    reload: changed,
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
    /** For the AI features to call once per request: counts one use this month. False when this device wouldn't save the count. */
    recordUse(): boolean {
      const saved = write(
        device,
        USES_NAME,
        JSON.stringify({
          month: monthOf(now()),
          count: store.usesThisMonth() + 1,
        }),
      );
      changed();
      return saved;
    },
    /** False once this month's uses reach the cap. */
    canUse: () => store.usesThisMonth() < store.getCap(),

    /**
     * askClaude (job 13): one request to Anthropic's Messages API with the person's own key, the model from
     * settings and structured output. Never throws: every failure is a plain message. Sends nothing (and counts
     * nothing) without a key or once this month's limit is reached; each request sent counts one use.
     * The key is read here, right before the request, and goes only in its x-api-key header. Nothing here logs.
     */
    async ask({
      uid,
      system,
      user,
      schema,
      maxTokens,
      effort,
      signal,
    }: AskArgs): Promise<AiResult> {
      const key = store.getKey(uid);
      if (!key)
        return fail("no-key", "Add your Anthropic key in AI settings first.");
      if (signal?.aborted) return stoppedBy(signal);
      // A key an older version saved with letters a header can't carry would make fetch throw.
      if (!usableKey(key))
        return fail(
          "invalid-key",
          "This key has letters a key can't have. Copy it again from the Anthropic Console and save it.",
        );
      if (!store.canUse()) {
        const cap = store.getCap();
        return fail(
          "cap",
          `You have used all ${cap} AI use${cap === 1 ? "" : "s"} for this month on this device. Raise the limit in AI settings, or wait for next month.`,
        );
      }
      // A use that can't be counted is not sent, so the monthly limit can't be skipped.
      if (!store.recordUse())
        return fail(
          "storage",
          "This browser won't let Note Board count AI uses, so nothing was sent. Free some space or allow site storage, then try again.",
        );
      let res: Response;
      try {
        res = await send(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "x-api-key": key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
            // Anthropic takes requests straight from a browser only with this (docs: "Browser-based applications").
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify(
            buildRequest({
              model: store.getModel(),
              system,
              user,
              schema,
              maxTokens,
              effort,
            }),
          ),
          signal,
          // Never followed elsewhere, so the key can only go to api.anthropic.com; no cookies either.
          redirect: "error",
          credentials: "omit",
        });
      } catch (e) {
        return isAbort(e) || signal?.aborted ? stoppedBy(signal) : NETWORK_FAILURE;
      }
      let body: unknown = null;
      try {
        body = await res.json();
      } catch (e) {
        if (isAbort(e) || signal?.aborted) return stoppedBy(signal);
        // A 200 whose body broke on the way (or isn't JSON) is a connection problem; an error status still says what it says.
        if (res.ok) return NETWORK_FAILURE;
      }
      return res.ok ? readReply(body, schema) : errorFor(res.status, body);
    },

    /** "Test key": one tiny request (one use). Any answer from Anthropic proves the key works. */
    async testKey(
      uid: string | null,
      signal?: AbortSignal,
    ): Promise<{ ok: true } | AiFailure> {
      // Stopped, with its answer ignored, when the key or model it started with changes: forgotten (here or in
      // another tab), replaced, signed out or another person signed in (the key is then gone), or the model picked.
      const key = store.getKey(uid);
      const model = store.getModel();
      // simple: forwards the caller's signal by hand; AbortSignal.any would do it but needs iOS Safari 17.4+. Upgrade when older iPhones no longer matter.
      const own = new AbortController();
      const outer = () => own.abort(signal?.reason);
      if (signal?.aborted) outer();
      else signal?.addEventListener("abort", outer);
      const changedUnder = () =>
        store.getKey(uid) !== key || store.getModel() !== model;
      const stopIfChanged = () => changedUnder() && own.abort();
      running.add(stopIfChanged);
      let r: AiResult;
      try {
        r = await store.ask({
          uid,
          system: "Reply with ok set to true.",
          user: "Is this working?",
          schema: { type: "object", properties: { ok: { type: "boolean" } } },
          maxTokens: 256,
          signal: own.signal,
        });
      } finally {
        running.delete(stopIfChanged);
        signal?.removeEventListener("abort", outer);
      }
      // A sign-out clears storage without telling this store, so look again now.
      if (changedUnder()) return CANCELLED;
      // These come only after Anthropic answered (200), so the key was accepted.
      return r.ok ||
        r.kind === "refusal" ||
        r.kind === "too-long" ||
        r.kind === "bad-reply"
        ? { ok: true }
        : r;
    },
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

// Another tab forgetting the key or changing the model reaches this tab as a storage event.
if (typeof window !== "undefined")
  window.addEventListener(
    "storage",
    (e) =>
      (e.key === null || (AI_STORAGE_KEYS as readonly string[]).includes(e.key)) &&
      ai.reload(),
  );

/** One request to Claude with the signed-in person's own key (see `ask` above). */
export const askClaude = (args: AskArgs) => ai.ask(args);

/** Re-renders when anything in the AI settings changes. */
export const useAiSettings = () => useSyncExternalStore(ai.subscribe, ai.rev);
