import { describe, expect, it, vi } from "vitest";
import { CANCELLED, type AiResult } from "../model/ai";
import { AI_BATCH, AI_LABELS_NAME, LABELS_SCHEMA } from "../model/aiCategories";
import { AI_STORAGE_KEYS, createAiStore } from "./ai";
import type { AskArgs } from "./ai";
import { LABELS_MAX, createLabelCache, sortWithAi } from "./aiLabels";

// "Sort with AI" (owner request, 2026-11-13): the labels Claude gave are kept on this device only, keyed by a
// hash of the item text and the model, so the same items are not asked about again.

const memory = () => {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
};
const blocked = () => {
  const fail = () => {
    throw new Error("blocked");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
};
const M = "claude-haiku-5-5";

describe("the label cache", () => {
  it("gives back a label for the same text and model, and nothing for another model", () => {
    const device = memory();
    const cache = createLabelCache(device);
    expect(cache.putAll([["Buy milk", "Errands"]], M, "u1")).toBe(true);
    expect(cache.get("Buy milk", M, "u1")).toBe("Errands");
    expect(cache.get("  Buy  milk ", M, "u1")).toBe("Errands");
    expect(cache.get("Buy milk", "claude-opus-5-5", "u1")).toBeNull();
    // Only in localStorage, under its one name, and without the item's text.
    expect(Object.keys(device.data)).toEqual([AI_LABELS_NAME]);
    expect(device.data[AI_LABELS_NAME]).not.toContain("milk");
  });

  it("a reload (a new cache on the same storage) reuses it", () => {
    const device = memory();
    createLabelCache(device).putAll([["Buy milk", "Errands"]], M, "u1");
    expect(createLabelCache(device).get("Buy milk", M, "u1")).toBe("Errands");
  });

  it("is someone else's when another person signed in: not used, and replaced on the next save", () => {
    const device = memory();
    const cache = createLabelCache(device);
    cache.putAll([["Buy milk", "Errands"]], M, "u1");
    expect(cache.get("Buy milk", M, "u2")).toBeNull();
    cache.putAll([["Call mom", "Family"]], M, "u2");
    expect(cache.get("Buy milk", M, "u1")).toBeNull();
    expect(cache.get("Call mom", M, "u2")).toBe("Family");
  });

  it("reads many at once, and drops someone else's labels on request", () => {
    const device = memory();
    const cache = createLabelCache(device);
    cache.putAll([["Buy milk", "Errands"], ["Call mom", "Family"]], M, "u1");
    const read = cache.reader(M, "u1");
    expect([read("Buy milk"), read("Call mom"), read("Other")]).toEqual(["Errands", "Family", null]);
    expect(cache.reader(M, "u2")("Buy milk")).toBeNull();
    cache.dropUnlessFor("u1");
    expect(cache.get("Buy milk", M, "u1")).toBe("Errands");
    // Nobody signed in (or sign-in still loading): nothing is dropped, and nothing is used either.
    cache.dropUnlessFor(null);
    expect(cache.get("Buy milk", M, "u1")).toBe("Errands");
    expect(cache.get("Buy milk", M, null)).toBeNull();
    cache.dropUnlessFor("u2");
    expect(device.data[AI_LABELS_NAME]).toBeUndefined();
    device.data[AI_LABELS_NAME] = "{";
    cache.dropUnlessFor("u1");
    expect(device.data[AI_LABELS_NAME]).toBeUndefined();
  });

  it("keeps at most LABELS_MAX, dropping the oldest", () => {
    const cache = createLabelCache(memory());
    const pairs = Array.from({ length: LABELS_MAX + 10 }, (_, i): [string, string] => [`item ${i}`, "L"]);
    cache.putAll(pairs, M, null);
    expect(cache.get("item 0", M, null)).toBeNull();
    expect(cache.get("item 9", M, null)).toBeNull();
    expect(cache.get("item 10", M, null)).toBe("L");
    expect(cache.size()).toBe(LABELS_MAX);
  });

  it("treats damaged or odd saved data as empty, and cleans labels again when reading", () => {
    const device = memory();
    const cache = createLabelCache(device);
    for (const bad of ["{", "null", "[]", '{"v":2,"entries":{}}', '{"v":1,"owner":"","entries":[]}'])  {
      device.data[AI_LABELS_NAME] = bad;
      expect(cache.get("Buy milk", M, null)).toBeNull();
    }
    cache.putAll([["Buy milk", "Errands"]], M, null);
    const saved = JSON.parse(device.data[AI_LABELS_NAME]);
    const k = Object.keys(saved.entries)[0];
    saved.entries[k] = "Evil‮" + "x".repeat(100);
    device.data[AI_LABELS_NAME] = JSON.stringify(saved);
    expect(cache.get("Buy milk", M, null)).toBe("Evil" + "x".repeat(20));
    saved.entries[k] = 7;
    device.data[AI_LABELS_NAME] = JSON.stringify(saved);
    expect(cache.get("Buy milk", M, null)).toBeNull();
  });

  it("never crashes on blocked storage", () => {
    const cache = createLabelCache(blocked());
    expect(cache.putAll([["a", "b"]], M, null)).toBe(false);
    expect(cache.get("a", M, null)).toBeNull();
    expect(() => cache.clear()).not.toThrow();
  });

  it("is cleared with the key: Forget key removes it (it is not an AI setting, so another tab's labels don't reload them)", () => {
    const session = memory();
    const device = memory();
    const ai = createAiStore({ session, device, now: () => new Date() });
    createLabelCache(device).putAll([["Buy milk", "Errands"]], M, null);
    expect(AI_STORAGE_KEYS).not.toContain(AI_LABELS_NAME);
    ai.forgetKey();
    expect(device.data[AI_LABELS_NAME]).toBeUndefined();
  });
});

describe("sortWithAi", () => {
  const reply = (args: AskArgs, name = "Stuff"): AiResult => {
    const texts = JSON.parse(args.user.slice(args.user.lastIndexOf("["))) as string[];
    return { ok: true, value: { categories: [name], labels: texts.map((_, i) => ({ i, c: 0 })) } };
  };

  it("asks in batches, with a small answer size, saving each batch's labels and saying how far it got", async () => {
    const device = memory();
    const cache = createLabelCache(device);
    const asked: AskArgs[] = [];
    const ask = vi.fn(async (a: AskArgs) => (asked.push(a), reply(a)));
    const progress: number[] = [];
    const texts = Array.from({ length: AI_BATCH * 2 + 3 }, (_, i) => `item ${i}`);
    const r = await sortWithAi({ ask, cache, uid: "u1", model: M, entries: texts.map((text) => ({ text })), known: ["Errands"], onProgress: (n) => progress.push(n) });
    expect(r).toEqual({ ok: true, sorted: texts.length });
    expect(asked.map((a) => JSON.parse(a.user.slice(a.user.lastIndexOf("["))).length)).toEqual([AI_BATCH, AI_BATCH, 3]);
    expect(progress).toEqual([AI_BATCH, AI_BATCH * 2, texts.length]);
    for (const a of asked) {
      expect(a.uid).toBe("u1");
      expect(a.schema).toBe(LABELS_SCHEMA);
      expect(a.maxTokens).toBeLessThanOrEqual(4000);
    }
    // Later batches are told the names chosen so far, so the same kind of item lands in the same wedge.
    expect(asked[0].user).toContain('["Errands"]');
    expect(asked[1].user).toContain('["Errands","Stuff"]');
    expect(cache.get("item 0", M, "u1")).toBe("Stuff");
    expect(cache.get(`item ${texts.length - 1}`, M, "u1")).toBe("Stuff");
  });

  it("counts only the items that got a label, and keeps the spelling of a name already chosen", async () => {
    const cache = createLabelCache(memory());
    const ask = async (): Promise<AiResult> => ({ ok: true, value: { categories: ["errands"], labels: [{ i: 0, c: 0 }] } });
    const progress: number[] = [];
    const r = await sortWithAi({ ask, cache, uid: null, model: M, entries: ["Buy milk", "Mystery"].map((text) => ({ text })), known: ["Errands"], onProgress: (n) => progress.push(n) });
    expect(r).toEqual({ ok: true, sorted: 1 });
    expect(progress).toEqual([2]);
    expect(cache.get("Buy milk", M, null)).toBe("Errands");
    expect(cache.get("Mystery", M, null)).toBeNull();
  });

  it("remembers an item Claude gave no label (per model, hashed), so it is not sent and billed again", async () => {
    const device = memory();
    const cache = createLabelCache(device);
    const ask = async (): Promise<AiResult> => ({ ok: true, value: { categories: ["Errands"], labels: [{ i: 0, c: 0 }, { i: 2, c: 7 }] } });
    const entries = [{ text: "Buy milk" }, { text: "Mystery" }, { text: "Odd one", parent: "Elden Ring" }];
    const r = await sortWithAi({ ask, cache, uid: "u1", model: M, entries, known: [], onProgress: () => {} });
    expect(r).toEqual({ ok: true, sorted: 1 });
    const asked = cache.asked(M, "u1");
    expect(asked("Buy milk")).toBe(true);
    expect(asked("Mystery")).toBe(true);
    // A number out of range is no label either.
    expect(asked("Odd one", "Elden Ring")).toBe(true);
    // No label still shows the built-in category: nothing is read back as a name.
    expect(cache.get("Mystery", M, "u1")).toBeNull();
    expect(cache.reader(M, "u1")("Odd one", "Elden Ring")).toBeNull();
    // Another model, another person or another parent was never asked.
    expect(cache.asked("claude-opus-5-5", "u1")("Mystery")).toBe(false);
    expect(cache.asked(M, "u2")("Mystery")).toBe(false);
    expect(asked("Odd one")).toBe(false);
    expect(asked("Never sent")).toBe(false);
    expect(device.data[AI_LABELS_NAME]).not.toMatch(/Mystery|Odd/);
  });

  it("a failed or cancelled batch is not remembered as no label", async () => {
    const cache = createLabelCache(memory());
    await sortWithAi({ ask: async () => ({ ok: false, kind: "network", message: "x" }) as AiResult, cache, uid: null, model: M, entries: [{ text: "Mystery" }], known: [], onProgress: () => {} });
    expect(cache.asked(M, null)("Mystery")).toBe(false);
  });

  it("saves a sub-item's label under its text and its parent, so the same text under another parent has none", async () => {
    const device = memory();
    const cache = createLabelCache(device);
    const asked: AskArgs[] = [];
    const r = await sortWithAi({ ask: async (a) => (asked.push(a), reply(a, "Gaming")), cache, uid: null, model: M, entries: [{ text: "Beat the boss", parent: "Elden Ring" }], known: [], onProgress: () => {} });
    expect(r).toEqual({ ok: true, sorted: 1 });
    expect(asked[0].user).toContain('[{"item":"Beat the boss","under":"Elden Ring"}]');
    expect(cache.get("Beat the boss", M, null, "Elden Ring")).toBe("Gaming");
    expect(cache.reader(M, null)("Beat the boss", "Elden Ring")).toBe("Gaming");
    expect(cache.get("Beat the boss", M, null, "Hollow Knight")).toBeNull();
    expect(cache.get("Beat the boss", M, null)).toBeNull();
    // Only hashes are kept: neither text is in what the device stores.
    expect(device.data[AI_LABELS_NAME]).not.toMatch(/Elden|boss/);
  });

  it("stops at the first failure with its message, keeping the batches already done", async () => {
    const cache = createLabelCache(memory());
    let n = 0;
    const ask = async (a: AskArgs): Promise<AiResult> =>
      ++n === 2 ? { ok: false, kind: "rate-limit", message: "Too many" } : reply(a);
    const texts = Array.from({ length: AI_BATCH * 3 }, (_, i) => `item ${i}`);
    const r = await sortWithAi({ ask, cache, uid: null, model: M, entries: texts.map((text) => ({ text })), known: [], onProgress: () => {} });
    expect(r).toEqual({ ok: false, kind: "rate-limit", message: "Too many" });
    expect(n).toBe(2);
    expect(cache.get("item 0", M, null)).toBe("Stuff");
    expect(cache.get(`item ${AI_BATCH}`, M, null)).toBeNull();
  });

  it("Cancel stops it and saves nothing from the batch that was running", async () => {
    const cache = createLabelCache(memory());
    const stop = new AbortController();
    const ask = async (a: AskArgs): Promise<AiResult> => {
      stop.abort();
      expect(a.signal?.aborted).toBe(true);
      return reply(a);
    };
    const r = await sortWithAi({ ask, cache, uid: null, model: M, entries: ["a"].map((text) => ({ text })), known: [], onProgress: () => {}, signal: stop.signal });
    expect(r).toEqual(CANCELLED);
    expect(cache.get("a", M, null)).toBeNull();
  });

  it("an answer that comes after the key or model changed is not saved", async () => {
    const cache = createLabelCache(memory());
    const r = await sortWithAi({ ask: async (a) => reply(a), cache, uid: null, model: M, entries: ["a"].map((text) => ({ text })), known: [], onProgress: () => {}, stillValid: () => false });
    expect(r).toEqual(CANCELLED);
    expect(cache.get("a", M, null)).toBeNull();
  });

  it("a batch that takes too long stops with the time-out message", async () => {
    vi.useFakeTimers();
    try {
      const cache = createLabelCache(memory());
      const ask = (a: AskArgs) =>
        new Promise<AiResult>((resolve) =>
          a.signal?.addEventListener("abort", () =>
            resolve((a.signal?.reason as { name?: string })?.name === "TimeoutError" ? { ok: false, kind: "timeout", message: "slow" } : CANCELLED),
          ),
        );
      const done = sortWithAi({ ask, cache, uid: null, model: M, entries: ["a"].map((text) => ({ text })), known: [], onProgress: () => {}, timeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(1001);
      expect(await done).toEqual({ ok: false, kind: "timeout", message: "slow" });
    } finally {
      vi.useRealTimers();
    }
  });
});
