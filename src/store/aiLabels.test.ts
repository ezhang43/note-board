import { describe, expect, it, vi } from "vitest";
import { CANCELLED, type AiResult } from "../model/ai";
import { AI_BATCH, AI_LABELS_NAME, LABELS_SCHEMA, labelKey, toSend } from "../model/aiCategories";
import { AI_STORAGE_KEYS, createAiStore } from "./ai";
import type { AskArgs } from "./ai";
import { BOARD_KEY } from "../model/persist";
import { BOARDS_ROOM, LABELS_MAX, NO_ROOM, SAVE_FAILED, createLabelCache, sortWithAi } from "./aiLabels";

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
    expect(cache.putAll([["Buy milk", "Errands"]], M, "u1")).toBe("saved");
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
    expect(cache.putAll([["a", "b"]], M, null)).toBe("cant-save");
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

/** Storage that takes small writes but is full for anything longer than `room` letters. */
const nearlyFull = (room: number) => {
  const m = memory();
  return {
    ...m,
    setItem: (k: string, v: string) => {
      if (v.length > room) throw new DOMException("full", "QuotaExceededError");
      m.setItem(k, v);
    },
  };
};
const texts = (a: AskArgs) => JSON.parse(a.user.slice(a.user.lastIndexOf("["))) as string[];

describe("whether Sort automatically may send (job viz-ai-autosort, owner 2026-11-13)", () => {
  it("only when the labels it would bring back can be saved", () => {
    expect(createLabelCache(memory()).room(50, "u1")).toBe("ok");
    expect(createLabelCache(null).room(50, "u1")).toBe("cant-save");
    expect(createLabelCache(blocked()).room(50, "u1")).toBe("cant-save");
    // Full: what is there already can be written again, but there is no room for 50 more labels.
    expect(createLabelCache(nearlyFull(200)).room(50, "u1")).toBe("cant-save");
    // The test write is gone afterwards.
    const device = memory();
    createLabelCache(device).room(50, "u1");
    expect(Object.keys(device.data)).toEqual([]);
  });

  it("not once a save has failed in this page, until one works again", () => {
    let full = true;
    const m = memory();
    const device = {
      ...m,
      setItem: (k: string, v: string) => {
        if (k === AI_LABELS_NAME && full) throw new DOMException("full", "QuotaExceededError");
        m.setItem(k, v);
      },
    };
    const cache = createLabelCache(device);
    expect(cache.putAll([["a", "A"]], M, "u1")).toBe("cant-save");
    expect(cache.room(1, "u1")).toBe("cant-save");
    full = false;
    expect(cache.putAll([["a", "A"]], M, "u1")).toBe("saved");
    expect(cache.room(1, "u1")).toBe("ok");
    // Clearing the labels (a change of person) frees their room too.
    full = true;
    cache.putAll([["b", "B"]], M, "u1");
    full = false;
    cache.clear();
    expect(cache.room(1, "u1")).toBe("ok");
  });

  it("a clear that storage refused does not free the room", () => {
    const m = memory();
    const device = { ...m, setItem: (k: string, v: string) => { if (k === AI_LABELS_NAME) throw new DOMException("full", "QuotaExceededError"); m.setItem(k, v); }, removeItem: () => { throw new Error("blocked"); } };
    const cache = createLabelCache(device);
    cache.putAll([["a", "A"]], M, "u1");
    cache.clear();
    expect(cache.room(1, "u1")).toBe("cant-save");
  });

  it("never uses the room the boards need: it keeps BOARDS_ROOM free, or twice the boards' saved size if that is more", () => {
    // Storage that holds `cap` letters in all, as a browser's does.
    const limited = (cap: number) => {
      const m = memory();
      const used = () => Object.values(m.data).reduce((n, v) => n + v.length, 0);
      return { ...m, setItem: (k: string, v: string) => { if (used() - (m.data[k]?.length ?? 0) + v.length > cap) throw new DOMException("full", "QuotaExceededError"); m.setItem(k, v); } };
    };
    const small = limited(10_000 + BOARDS_ROOM + 500);
    small.data[BOARD_KEY] = "b".repeat(10_000);
    // Ten labels would fit, but would leave less than BOARDS_ROOM free.
    expect(createLabelCache(small).room(10, "u1")).toBe("cant-save");
    expect(createLabelCache(small).room(1, "u1")).toBe("ok");
    // Big boards: twice their size is kept, which is more than BOARDS_ROOM.
    const big = limited(600_000 + BOARDS_ROOM + 100_000);
    big.data[BOARD_KEY] = "b".repeat(600_000);
    expect(createLabelCache(big).room(1, "u1")).toBe("cant-save");
    // A press does not write them either, and says so; the boards are as they were.
    const cache = createLabelCache(big);
    expect(cache.putAll([["a", "A"]], M, "u1")).toBe("no-room");
    expect(big.data[AI_LABELS_NAME]).toBeUndefined();
    expect(big.data[BOARD_KEY]).toHaveLength(600_000);
    expect(Object.keys(big.data)).toEqual([BOARD_KEY]);
  });

  it("a press that would leave the boards too little room stops with a plain message, sending no more", async () => {
    const m = memory();
    const device = { ...m, setItem: (k: string, v: string) => { if (v.length >= BOARDS_ROOM) throw new DOMException("full", "QuotaExceededError"); m.setItem(k, v); } };
    let n = 0;
    const many = Array.from({ length: AI_BATCH * 3 }, (_, i) => ({ text: `item ${i}` }));
    const ask = async (a: AskArgs): Promise<AiResult> => (n++, { ok: true, value: { categories: ["Stuff"], labels: texts(a).map((_, i) => ({ i, c: 0 })) } });
    const r = await sortWithAi({ ask, cache: createLabelCache(device), uid: null, model: M, entries: many, known: [], onProgress: () => {} });
    expect(r).toEqual({ ok: false, kind: "labels-not-saved", message: NO_ROOM });
    expect(NO_ROOM).toBe("Not saved: the sorted labels would use the space this device keeps for your boards. Free some space, then try again.");
    expect(n).toBe(1);
  });

  it("not when saving would push out labels kept already (LABELS_MAX)", () => {
    const cache = createLabelCache(memory());
    cache.putAll(Array.from({ length: LABELS_MAX - 10 }, (_, i): [string, string] => [`item ${i}`, "L"]), M, "u1");
    expect(cache.room(10, "u1")).toBe("ok");
    expect(cache.room(11, "u1")).toBe("full");
    // Someone else's labels are replaced on their next save, so for them there is room.
    expect(cache.room(11, "u2")).toBe("ok");
  });

  it("2,500 finished items are never sent twice across many opens: it stops once the labels kept are full", async () => {
    const cache = createLabelCache(memory());
    const items = Array.from({ length: 2500 }, (_, i) => ({ text: `item ${i}`, boardId: "home" }));
    const sent = new Map<string, number>();
    const ask = async (a: AskArgs): Promise<AiResult> => {
      for (const t of texts(a)) sent.set(t, (sent.get(t) ?? 0) + 1);
      return { ok: true, value: { categories: ["Stuff"], labels: texts(a).map((_, i) => ({ i, c: 0 })) } };
    };
    // Each open runs Sort automatically once, as the Visualizer does: what toSend picks, if there is room.
    for (let open = 0; open < 40; open++) {
      const asked = cache.asked(M, "u1");
      const { entries } = toSend(items, (e) => asked(e.text, e.parent), () => true);
      if (!entries.length || cache.room(entries.length, "u1") !== "ok") continue;
      await sortWithAi({ ask, cache, uid: "u1", model: M, entries, known: [], onProgress: () => {} });
    }
    expect(Math.max(...sent.values())).toBe(1);
    expect(sent.size).toBe(LABELS_MAX);
    expect(cache.room(1, "u1")).toBe("full");
  });

  it("a saved value that cleans to nothing counts as not asked (asked again); no label still counts as asked", () => {
    const device = memory();
    const cache = createLabelCache(device);
    cache.putAll([["Mystery", ""]], M, "u1");
    const saved = JSON.parse(device.data[AI_LABELS_NAME]);
    saved.entries[labelKey("Damaged", M)] = "​ ";
    saved.entries[labelKey("Not text", M)] = 7;
    device.setItem(AI_LABELS_NAME, JSON.stringify(saved));
    const asked = cache.asked(M, "u1");
    expect(asked("Mystery")).toBe(true);
    expect(asked("Damaged")).toBe(false);
    expect(asked("Not text")).toBe(false);
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

  it("stops after the first batch it cannot save, with a plain message, so no more are sent and billed", async () => {
    // The room test passes, but the labels themselves are refused.
    const m = memory();
    const device = { ...m, setItem: (k: string, v: string) => { if (k === AI_LABELS_NAME) throw new DOMException("full", "QuotaExceededError"); m.setItem(k, v); } };
    let n = 0;
    const many = Array.from({ length: AI_BATCH * 3 }, (_, i) => ({ text: `item ${i}` }));
    const r = await sortWithAi({ ask: async (a) => (n++, reply(a)), cache: createLabelCache(device), uid: null, model: M, entries: many, known: [], onProgress: () => {} });
    expect(r).toEqual({ ok: false, kind: "labels-not-saved", message: SAVE_FAILED });
    expect(SAVE_FAILED).toBe("Can't save sorted labels on this device.");
    expect(n).toBe(1);
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
