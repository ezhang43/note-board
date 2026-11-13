import { stoppedBy, CANCELLED, type AiFailure, type AiResult } from "../model/ai";
import {
  AI_BATCH,
  AI_LABELS_NAME,
  AI_MAX_CATEGORIES,
  AI_MAX_TOKENS,
  LABELS_SCHEMA,
  buildPrompt,
  cleanLabel,
  labelKey,
  readLabels,
} from "../model/aiCategories";
import type { AskArgs } from "./ai";

// "Sort with AI" (owner request, 2026-11-13): the labels Claude gave, kept in this browser's localStorage
// only. Never board data: not in a saved board, Version history, an export or the sync. Saved under a hash
// of the item text and the model, with whose they are (a different person signed in sees none of them).
// Forget key removes them (src/store/ai.ts), and the Visualizer only uses them while a key is saved.

/** At most this many labels are kept; the oldest go first. */
export const LABELS_MAX = 2000;

type Place = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
type Saved = { v: 1; owner: string; entries: Record<string, string> };

export function createLabelCache(device: Place) {
  const load = (owner: string | null): Record<string, string> => {
    try {
      const s = JSON.parse(device?.getItem(AI_LABELS_NAME) ?? "null") as Partial<Saved> | null;
      if (s?.v !== 1 || s.owner !== (owner ?? "") || typeof s.entries !== "object" || !s.entries || Array.isArray(s.entries)) return {};
      return s.entries;
    } catch {
      return {};
    }
  };
  const store = {
    /** The label saved for `text` with `model`, cleaned again (it may have been changed on this device), or null. */
    get(text: string, model: string, owner: string | null): string | null {
      return cleanLabel(load(owner)[labelKey(text, model)]);
    },
    /** Like `get`, for many texts: reads the saved labels once. */
    reader(model: string, owner: string | null): (text: string) => string | null {
      const entries = load(owner);
      return (text) => cleanLabel(entries[labelKey(text, model)]);
    },
    /** Removes labels saved by anyone but `owner` (after a sign-out or a change of person), or damaged ones. */
    dropUnlessFor(owner: string | null) {
      let mine = false;
      try {
        const s = JSON.parse(device?.getItem(AI_LABELS_NAME) ?? "null") as Partial<Saved> | null;
        mine = !s || (s.v === 1 && s.owner === (owner ?? ""));
      } catch {
        // Damaged: of no use to anyone.
      }
      if (!mine) store.clear();
    },
    /** Saves labels for texts; anyone else's labels are replaced. False when storage said no. */
    putAll(pairs: [string, string][], model: string, owner: string | null): boolean {
      const entries = { ...load(owner) };
      for (const [text, label] of pairs) {
        const k = labelKey(text, model);
        delete entries[k]; // written again, so it counts as new
        entries[k] = label;
      }
      const keys = Object.keys(entries);
      for (const k of keys.slice(0, Math.max(0, keys.length - LABELS_MAX))) delete entries[k];
      try {
        if (!device) return false;
        device.setItem(AI_LABELS_NAME, JSON.stringify({ v: 1, owner: owner ?? "", entries } satisfies Saved));
        return true;
      } catch {
        return false;
      }
    },
    size: () => {
      try {
        const s = JSON.parse(device?.getItem(AI_LABELS_NAME) ?? "null") as Partial<Saved> | null;
        return s?.entries ? Object.keys(s.entries).length : 0;
      } catch {
        return 0;
      }
    },
    clear() {
      try {
        device?.removeItem(AI_LABELS_NAME);
      } catch {
        // Blocked storage: nothing kept.
      }
    },
  };
  return store;
}
export type LabelCache = ReturnType<typeof createLabelCache>;

/** The one this page uses (this device's localStorage). */
export const aiLabels = createLabelCache(
  (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })(),
);

/** How long one request may take before it stops with the time-out message. */
const BATCH_TIMEOUT_MS = 90_000;

/**
 * Sends `texts` (already picked by toSend) to Claude in batches of AI_BATCH, one counted use each, and saves
 * each batch's labels as it comes back. Stops at the first failure with its message (batches already done
 * stay saved). `known` is the category names already on the disc, so new items reuse them. An answer that
 * comes back after Cancel, or after `stillValid` says the key or model changed, is not saved.
 */
export async function sortWithAi({
  ask,
  cache,
  uid,
  model,
  texts,
  known,
  onProgress,
  signal,
  stillValid = () => true,
  timeoutMs = BATCH_TIMEOUT_MS,
}: {
  ask: (args: AskArgs) => Promise<AiResult>;
  cache: LabelCache;
  uid: string | null;
  model: string;
  texts: string[];
  known: string[];
  onProgress: (sorted: number) => void;
  signal?: AbortSignal;
  stillValid?: () => boolean;
  timeoutMs?: number;
}): Promise<{ ok: true; sorted: number } | AiFailure> {
  const names = [...known].slice(0, AI_MAX_CATEGORIES);
  let sorted = 0;
  for (let at = 0; at < texts.length; at += AI_BATCH) {
    if (signal?.aborted) return stoppedBy(signal);
    const batch = texts.slice(at, at + AI_BATCH);
    // simple: forwards Cancel by hand with a timer for the time-out; AbortSignal.any / .timeout need iOS Safari 17.4+ / 16. Upgrade when older iPhones no longer matter.
    const own = new AbortController();
    const cancel = () => own.abort(signal?.reason);
    signal?.addEventListener("abort", cancel);
    const timer = setTimeout(() => own.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
    let r: AiResult;
    try {
      r = await ask({ uid, ...buildPrompt(batch, names), schema: LABELS_SCHEMA, maxTokens: AI_MAX_TOKENS, signal: own.signal });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
    if (signal?.aborted || !stillValid()) return CANCELLED;
    if (!r.ok) return r;
    const labels = readLabels(r.value, batch.length);
    const pairs: [string, string][] = [];
    labels.forEach((l, i) => {
      if (!l) return;
      pairs.push([batch[i], l]);
      if (names.length < AI_MAX_CATEGORIES && !names.some((n) => n.toLowerCase() === l.toLowerCase())) names.push(l);
    });
    cache.putAll(pairs, model, uid);
    sorted += batch.length;
    onProgress(sorted);
  }
  return { ok: true, sorted };
}
