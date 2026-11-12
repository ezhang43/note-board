import { describe, expect, it, vi } from "vitest";

// Putting the old AI key back after a failed save must not depend on the order of AI_KEY_NAMES
// (review of the AI-key clearing job). Here the list is in the opposite order to the code's own.
vi.mock("../model/aiKey", () => ({
  AI_KEY_NAME: "note-board:ai-key",
  AI_KEY_USER_NAME: "note-board:ai-key-user",
  AI_KEY_NAMES: ["note-board:ai-key-user", "note-board:ai-key"],
  dropAiKeyUnlessFor: () => {},
}));
const { createAiStore } = await import("./ai");

describe("restoring the old key after a failed save", () => {
  it("puts the key and its owner back where they were, whatever order the name list is in", () => {
    const data: Record<string, string> = {};
    const session = {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        // The key goes in; saving whose it is fails (storage full).
        if (k === "note-board:ai-key-user" && v === "u2")
          throw new Error("full");
        data[k] = v;
      },
      removeItem: (k: string) => void delete data[k],
    };
    const ai = createAiStore({ session, device: null, now: () => new Date() });
    expect(
      ai.setKey("sk-ant-api03-OLD-abcd1234", { remember: false, uid: "u1" }),
    ).toBe(true);
    expect(
      ai.setKey("sk-ant-api03-NEW-wxyz9999", { remember: false, uid: "u2" }),
    ).toBe(false);
    expect(data["note-board:ai-key"]).toBe("sk-ant-api03-OLD-abcd1234");
    expect(data["note-board:ai-key-user"]).toBe("u1");
    expect(ai.getKey("u1")).toBe("sk-ant-api03-OLD-abcd1234");
  });
});
