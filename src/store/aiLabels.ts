import { fail, stoppedBy, CANCELLED, type AiFailure, type AiResult } from "../model/ai";
import {
  AI_BATCH,
  AI_LABELS_NAME,
  AI_MAX_CATEGORIES,
  AI_MAX_TOKENS,
  LABELS_SCHEMA,
  type AiEntry,
  buildPrompt,
  cleanLabel,
  labelKey,
  readLabels,
} from "../model/aiCategories";
import { BOARD_KEY } from "../model/persist";
import type { AskArgs } from "./ai";

// "Sort with AI" (owner request, 2026-11-13): the labels Claude gave, kept in this browser's localStorage
// only. Never board data: not in a saved board, Version history, an export or the sync. Saved under a hash
// of the item text (and, for a sub-item, its parent's text) and the model, with whose they are (a different person signed in sees none of them).
// Forget key removes them (src/store/ai.ts), and the Visualizer only uses them while a key is saved.

/** Saved for an item Claude was asked about and gave no label: never read as a name (cleanLabel gives null), but
 * the item counts as asked, so Sort automatically does not send and bill the same text again (coordinator, 2026-11-13). */
const NO_LABEL = "";

/** At most this many labels are kept; the oldest go first (a press only: Sort automatically never pushes one out, see `room`). */
export const LABELS_MAX = 2000;

/** What a sort says when a batch's labels could not be saved; it stops there, so no more are sent and billed. */
export const SAVE_FAILED = "Can't save sorted labels on this device.";

/** What a sort says when saving a batch's labels would leave the boards too little room (see BOARDS_ROOM); it stops there. */
export const NO_ROOM = "Not saved: the sorted labels would use the space this device keeps for your boards. Free some space, then try again.";

/**
 * Letters of storage always left free for the boards, which share this device's storage with the labels: this
 * many, or twice what the boards take now if that is more (job viz-ai-autosort, coordinator 2026-11-13). Twice,
 * because a board save writes the whole save again and the boards can grow; 1,000,000 is about a fifth of what a
 * browser gives a site, and far more than a typical board save.
 */
export const BOARDS_ROOM = 1_000_000;

/** Where a test write (the labels to come plus the boards' room) goes; removed at once. */
const PROBE_NAME = `${AI_LABELS_NAME}:room`;
/** Letters one saved label takes, at most: its key and the JSON around it (about 16), and the name (24 letters, up to 96 storage characters for emoji and escaped quotes). */
// simple: a fixed worst case rather than the real size, which is only known once Claude answers. If a save still
// fails, the sort stops at that batch and Sort automatically waits until a save works (`failed`).
const LETTERS_PER_LABEL = 112;

type Place = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
type Saved = { v: 1; owner: string; entries: Record<string, string> };

export function createLabelCache(device: Place) {
  /** A save failed in this page (storage full or blocked): Sort automatically waits until one works again (a press) or the labels are cleared. */
  let failed = false;
  /**
   * Whether `letters` more can be written and still leave the boards their room: a test write that size, removed
   * at once (storage does not say how much is free).
   */
  // simple: each check writes and removes a few MB (once per open and once per saved batch); fine at the sizes
  // kept here. Upgrade if it shows up as slow on phones.
  const fits = (letters: number): boolean => {
    if (!device) return false;
    try {
      const boards = device.getItem(BOARD_KEY)?.length ?? 0;
      device.setItem(PROBE_NAME, "x".repeat(Math.max(0, letters) + Math.max(BOARDS_ROOM, 2 * boards)));
      return true;
    } catch {
      return false;
    } finally {
      try {
        device.removeItem(PROBE_NAME);
      } catch {
        // Blocked: nothing was written (or, if storage was blocked between the two calls, the test stays, unread).
      }
    }
  };
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
    /** The label saved for `text` (under `parent`, for a sub-item) with `model`, cleaned again (it may have been changed on this device), or null. */
    get(text: string, model: string, owner: string | null, parent?: string): string | null {
      return cleanLabel(load(owner)[labelKey(text, model, parent)]);
    },
    /**
     * Reads the saved labels once, for many texts: `label` is like `get`; `asked` is whether `text` (under `parent`)
     * was already asked about with `model` (a label or no label came back). A saved value that is neither (damaged
     * on this device) is asked about again.
     */
    view(model: string, owner: string | null) {
      const entries = load(owner);
      const at = (text: string, parent?: string): unknown => entries[labelKey(text, model, parent)];
      return {
        label: (text: string, parent?: string) => cleanLabel(at(text, parent)),
        asked: (text: string, parent?: string) => {
          const v = at(text, parent);
          return v === NO_LABEL || cleanLabel(v) !== null;
        },
      };
    },
    reader: (model: string, owner: string | null) => store.view(model, owner).label,
    asked: (model: string, owner: string | null) => store.view(model, owner).asked,
    /**
     * Whether Sort automatically may send `count` more items for `owner` (job viz-ai-autosort, owner 2026-11-13):
     * "cant-save" when their labels could not be saved (no storage, blocked, too full to keep them and still leave
     * the boards their room (BOARDS_ROOM), or a save already failed in this page), so the same items would be sent and billed again on every
     * open; "full" when saving them would push out labels kept already (LABELS_MAX), which would then be sent
     * again. A press does not ask.
     */
    room(count: number, owner: string | null): "ok" | "full" | "cant-save" {
      if (failed || !device) return "cant-save";
      if (Object.keys(load(owner)).length + count > LABELS_MAX) return "full";
      return fits(count * LETTERS_PER_LABEL) ? "ok" : "cant-save";
    },
    /** Removes labels saved by anyone but `owner` (after a sign-out or a change of person), or damaged ones. */
    dropUnlessFor(owner: string | null) {
      // Nobody signed in (or sign-in still loading): keep them; reader() gives nothing to the wrong person anyway.
      if (!owner) return;
      let mine = false;
      try {
        const s = JSON.parse(device?.getItem(AI_LABELS_NAME) ?? "null") as Partial<Saved> | null;
        mine = !s || (s.v === 1 && s.owner === (owner ?? ""));
      } catch {
        // Damaged: of no use to anyone.
      }
      if (!mine) store.clear();
    },
    /**
     * Saves labels for texts (each with its parent, for a sub-item); anyone else's labels are replaced. "no-room"
     * (nothing written) when they would leave the boards less than their room; "cant-save" when storage said no.
     */
    putAll(pairs: [text: string, label: string, parent?: string][], model: string, owner: string | null): "saved" | "no-room" | "cant-save" {
      const entries = { ...load(owner) };
      for (const [text, label, parent] of pairs) {
        const k = labelKey(text, model, parent);
        delete entries[k]; // written again, so it counts as new
        entries[k] = label;
      }
      const keys = Object.keys(entries);
      for (const k of keys.slice(0, Math.max(0, keys.length - LABELS_MAX))) delete entries[k];
      const json = JSON.stringify({ v: 1, owner: owner ?? "", entries } satisfies Saved);
      try {
        if (!device) throw new Error("no storage");
        if (!fits(json.length - (device.getItem(AI_LABELS_NAME)?.length ?? 0))) {
          failed = true;
          return "no-room";
        }
        device.setItem(AI_LABELS_NAME, json);
        failed = false;
        return "saved";
      } catch {
        failed = true;
        return "cant-save";
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
        failed = false; // their room is free again (only once they are really gone)
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
 * Sends `entries` (already picked by toSend) to Claude in batches of AI_BATCH, one counted use each, and saves
 * each batch's labels as it comes back. Stops at the first failure with its message (batches already done
 * stay saved). `known` is the category names already on the disc, so new items reuse them. An answer that
 * comes back after Cancel, or after `stillValid` says the key or model changed, is not saved.
 */
export async function sortWithAi({
  ask,
  cache,
  uid,
  model,
  entries,
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
  entries: AiEntry[];
  known: string[];
  onProgress: (sorted: number) => void;
  signal?: AbortSignal;
  stillValid?: () => boolean;
  timeoutMs?: number;
}): Promise<{ ok: true; sorted: number } | AiFailure> {
  const names = [...known].slice(0, AI_MAX_CATEGORIES);
  let sorted = 0;
  let asked = 0;
  for (let at = 0; at < entries.length; at += AI_BATCH) {
    if (signal?.aborted) return stoppedBy(signal);
    const batch = entries.slice(at, at + AI_BATCH);
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
    const pairs: [text: string, label: string, parent?: string][] = [];
    labels.forEach((l, i) => {
      if (!l) return void pairs.push([batch[i].text, NO_LABEL, batch[i].parent]);
      // A name already chosen keeps its first spelling, so "errands" joins the "Errands" wedge.
      const same = names.find((n) => n.toLowerCase() === l.toLowerCase());
      if (!same && names.length < AI_MAX_CATEGORIES) names.push(l);
      pairs.push([batch[i].text, same ?? l, batch[i].parent]);
    });
    // Not saved (storage full or blocked, or it would use the boards' room): stop, so the rest are not sent and
    // billed for labels that would be lost.
    const saved = cache.putAll(pairs, model, uid);
    if (saved !== "saved") return fail("labels-not-saved", saved === "no-room" ? NO_ROOM : SAVE_FAILED);
    sorted += pairs.filter((p) => p[1] !== NO_LABEL).length;
    asked += batch.length;
    onProgress(asked);
  }
  return { ok: true, sorted };
}
