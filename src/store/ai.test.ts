import { describe, expect, it, vi } from "vitest";
import { createStore } from "./store";
import {
  AI_MODELS,
  AI_STORAGE_KEYS,
  DEFAULT_CAP,
  DEFAULT_MODEL,
  createAiStore,
  maskKey,
} from "./ai";

// The AI settings (wow plan, job 12a): the person's own Anthropic key, kept in this browser only. By default
// it lives in sessionStorage; "Remember on this device" moves it to localStorage. It is never board data.

const KEY = "sk-ant-api03-SECRET-abcd1234";
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
function make(now = new Date(2026, 10, 12, 9)) {
  const session = memory();
  const device = memory();
  const clock = { now };
  const ai = createAiStore({ session, device, now: () => clock.now });
  return { ai, session, device, clock };
}

describe("the key", () => {
  it("is kept in sessionStorage by default, not on the device", () => {
    const { ai, session, device } = make();
    expect(ai.setKey(KEY, { remember: false, uid: "u1" })).toBe(true);
    expect(ai.getKey("u1")).toBe(KEY);
    expect(Object.values(session.data)).toContain(KEY);
    expect(Object.values(device.data)).not.toContain(KEY);
    expect(ai.isRemembered()).toBe(false);
  });

  it("goes to localStorage only when Remember is ticked, and is then gone from sessionStorage", () => {
    const { ai, session, device } = make();
    ai.setKey(KEY, { remember: false, uid: "u1" });
    ai.setKey(KEY, { remember: true, uid: "u1" });
    expect(Object.values(device.data)).toContain(KEY);
    expect(Object.values(session.data)).not.toContain(KEY);
    expect(ai.getKey("u1")).toBe(KEY);
    expect(ai.isRemembered()).toBe(true);
  });

  it("setRemember moves a saved key between the two without asking for it again", () => {
    const { ai, session, device } = make();
    ai.setKey(KEY, { remember: false, uid: "u1" });
    expect(ai.setRemember(true)).toBe(true);
    expect(Object.values(device.data)).toContain(KEY);
    expect(Object.values(session.data)).not.toContain(KEY);
    expect(ai.setRemember(false)).toBe(true);
    expect(Object.values(session.data)).toContain(KEY);
    expect(Object.values(device.data)).not.toContain(KEY);
    expect(ai.getKey("u1")).toBe(KEY);
  });

  it("is only given back to the person it was saved for", () => {
    const { ai } = make();
    ai.setKey(KEY, { remember: true, uid: "u1" });
    expect(ai.getKey("u2")).toBeNull();
    expect(ai.getKey(null)).toBeNull();
    expect(ai.hasKey("u2")).toBe(false);
    expect(ai.getKey("u1")).toBe(KEY);
  });

  it('works without an account (the demo page): saved for "none"', () => {
    const { ai } = make();
    ai.setKey(KEY, { remember: false, uid: null });
    expect(ai.getKey(null)).toBe(KEY);
    expect(ai.getKey("u1")).toBeNull();
  });

  it("forgetKey removes it from both places and tells listeners", () => {
    const { ai, session, device } = make();
    ai.setKey(KEY, { remember: true, uid: "u1" });
    ai.setKey(KEY, { remember: false, uid: "u1" });
    const seen = vi.fn();
    ai.subscribe(seen);
    ai.forgetKey();
    expect(ai.getKey("u1")).toBeNull();
    expect(
      Object.keys({ ...session.data, ...device.data }).filter((k) =>
        k.includes("ai-key"),
      ),
    ).toEqual([]);
    expect(seen).toHaveBeenCalled();
  });

  it("refuses an empty key or one with spaces in it, and trims the ends", () => {
    const { ai } = make();
    expect(ai.setKey("   ", { remember: false, uid: null })).toBe(false);
    expect(ai.setKey("sk-ant x", { remember: false, uid: null })).toBe(false);
    expect(ai.getKey(null)).toBeNull();
    expect(ai.setKey(`  ${KEY}\n`, { remember: false, uid: null })).toBe(true);
    expect(ai.getKey(null)).toBe(KEY);
  });

  it("shows only the start and the last four letters", () => {
    expect(maskKey(KEY)).toBe("sk-ant-…1234");
    expect(maskKey(KEY)).not.toContain("SECRET");
    expect(maskKey("abc")).toBe("…");
  });

  it("shows nothing of a short or odd key (review: it would be almost all of it)", () => {
    expect(maskKey("0123456789abc")).toBe("…");
    expect(maskKey("x".repeat(40))).toBe("…");
  });

  it("keeps the old key when saving a new one fails", () => {
    const { ai, session, device } = make();
    ai.setKey(KEY, { remember: false, uid: "u1" });
    device.setItem = () => {
      throw new Error("full");
    };
    expect(
      ai.setKey("sk-ant-api03-NEW-wxyz9999", { remember: true, uid: "u1" }),
    ).toBe(false);
    expect(ai.getKey("u1")).toBe(KEY);
    expect(Object.values(session.data)).toContain(KEY);
  });

  it("setRemember says no, and leaves the key where it was, when the device refuses it", () => {
    const { ai, session, device } = make();
    ai.setKey(KEY, { remember: false, uid: "u1" });
    device.setItem = () => {
      throw new Error("full");
    };
    expect(ai.setRemember(true)).toBe(false);
    expect(ai.isRemembered()).toBe(false);
    expect(Object.values(session.data)).toContain(KEY);
    expect(ai.getKey("u1")).toBe(KEY);
  });

  it("does not crash when storage is blocked: no key, and saving says no", () => {
    const ai = createAiStore({
      session: blocked(),
      device: blocked(),
      now: () => new Date(),
    });
    expect(ai.getKey("u1")).toBeNull();
    expect(ai.setKey(KEY, { remember: false, uid: "u1" })).toBe(false);
    expect(() => ai.forgetKey()).not.toThrow();
    expect(ai.getModel()).toBe(DEFAULT_MODEL);
    expect(ai.getCap()).toBe(DEFAULT_CAP);
    expect(ai.usesThisMonth()).toBe(0);
    expect(() => ai.recordUse()).not.toThrow();
  });

  it("works with no storage at all (null)", () => {
    const ai = createAiStore({
      session: null,
      device: null,
      now: () => new Date(),
    });
    expect(ai.getKey(null)).toBeNull();
    expect(ai.setKey(KEY, { remember: false, uid: null })).toBe(false);
  });

  it("every place it writes is named in AI_STORAGE_KEYS (so signing out can clear them)", () => {
    const { ai, session, device } = make();
    ai.setKey(KEY, { remember: true, uid: "u1" });
    ai.setKey(KEY, { remember: false, uid: "u1" });
    ai.setModel("claude-opus-5-5");
    ai.setCap(50);
    ai.recordUse();
    const written = Object.keys({ ...session.data, ...device.data });
    expect(written.length).toBeGreaterThan(0);
    for (const k of written) expect(AI_STORAGE_KEYS).toContain(k);
    expect(new Set(AI_STORAGE_KEYS).size).toBe(AI_STORAGE_KEYS.length);
  });
});

describe("model, monthly cap and uses", () => {
  it("starts on Haiku with a cap of 200 and no uses", () => {
    const { ai } = make();
    expect(ai.getModel()).toBe("claude-haiku-5-5");
    expect(ai.getCap()).toBe(200);
    expect(ai.usesThisMonth()).toBe(0);
    expect(ai.canUse()).toBe(true);
  });

  it("offers Haiku (fast, cheapest), Sonnet (better) and Opus (best)", () => {
    expect(AI_MODELS.map((m) => m.id)).toEqual([
      "claude-haiku-5-5",
      "claude-sonnet-5-5",
      "claude-opus-5-5",
    ]);
    expect(AI_MODELS.map((m) => m.note)).toEqual([
      "Fast, cheapest",
      "Better",
      "Best",
    ]);
  });

  it("remembers the model, ignores one it does not know, and reads a damaged value as the default", () => {
    const { ai, device } = make();
    ai.setModel("claude-sonnet-5-5");
    expect(ai.getModel()).toBe("claude-sonnet-5-5");
    expect(ai.setModel("gpt-nope")).toBe(false);
    expect(ai.getModel()).toBe("claude-sonnet-5-5");
    for (const k of Object.keys(device.data)) device.data[k] = "{{{";
    expect(ai.getModel()).toBe(DEFAULT_MODEL);
  });

  it("changes the cap, but only to a whole number from 1 to 9999", () => {
    const { ai } = make();
    expect(ai.setCap(50)).toBe(true);
    expect(ai.getCap()).toBe(50);
    for (const bad of [0, -3, 1.5, 10000, NaN])
      expect(ai.setCap(bad)).toBe(false);
    expect(ai.getCap()).toBe(50);
  });

  it("counts uses this month, starts again next month, and stops at the cap", () => {
    const { ai, clock } = make();
    ai.setCap(2);
    ai.recordUse();
    expect(ai.usesThisMonth()).toBe(1);
    expect(ai.canUse()).toBe(true);
    ai.recordUse();
    expect(ai.canUse()).toBe(false);
    clock.now = new Date(2026, 11, 1, 8);
    expect(ai.usesThisMonth()).toBe(0);
    expect(ai.canUse()).toBe(true);
    ai.recordUse();
    expect(ai.usesThisMonth()).toBe(1);
  });
});

describe("the key never reaches the board", () => {
  it("is absent from the whole store state, even after the person has saved it", () => {
    const { ai } = make();
    ai.setKey(KEY, { remember: true, uid: "u1" });
    const s = createStore(null);
    s.addCard("note");
    s.openAiSettings();
    const text = JSON.stringify(s.getState());
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("sk-ant");
  });

  it("opens and closes the dialog from the store (view state only)", () => {
    const s = createStore(null);
    expect(s.getState().ui.aiSettingsOpen).toBe(false);
    s.openAiSettings();
    expect(s.getState().ui.aiSettingsOpen).toBe(true);
    s.closeAiSettings();
    expect(s.getState().ui.aiSettingsOpen).toBe(false);
    expect(s.getState().ui.canUndo).toBe(false);
  });
});
