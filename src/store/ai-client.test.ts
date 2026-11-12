import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiStore } from "./ai";
import type { AiSchema } from "../model/ai";

// askClaude (wow plan, job 13): the one place that sends a request to Anthropic, with the person's own key.
// fetch is handed in, so no test here reaches the network.

const KEY = "sk-ant-api03-SECRET-abcd1234";
const schema: AiSchema = {
  type: "object",
  properties: { title: { type: "string", maxLength: 5 } },
};
const memory = () => {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
};
const ok = (text = '{"title":"Groceries","x":1}') =>
  new Response(
    JSON.stringify({ type: "message", stop_reason: "end_turn", content: [{ type: "text", text }] }),
    { status: 200 },
  );
const apiError = (status: number, type: string, message: string) =>
  new Response(JSON.stringify({ type: "error", error: { type, message }, request_id: "req_1" }), { status });

function make(answer: () => Promise<Response> = async () => ok()) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(answer);
  const ai = createAiStore({
    session: memory(),
    device: memory(),
    now: () => new Date(2026, 10, 12, 9),
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  ai.setKey(KEY, { remember: false, uid: "u1" });
  return { ai, fetch };
}
const ask = (ai: ReturnType<typeof make>["ai"], over: Partial<Parameters<typeof ai.ask>[0]> = {}) =>
  ai.ask({ uid: "u1", system: "You name lists.", user: "milk, eggs", schema, maxTokens: 16000, ...over });

describe("askClaude", () => {
  it("posts to the Messages API with the key, the version, JSON and the browser header, and nothing else", async () => {
    const { ai, fetch } = make();
    await ask(ai);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "x-api-key": KEY,
      "anthropic-version": "2026-10-21",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    // A redirect elsewhere is refused, so the key can only ever go to api.anthropic.com.
    expect(init.redirect).toBe("error");
    expect(init.credentials).toBe("omit");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(16000);
    expect(body.output_config.format.type).toBe("json_schema");
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it("uses the model chosen in settings and passes the cancel signal on", async () => {
    const { ai, fetch } = make();
    ai.setModel("claude-opus-5-5");
    const c = new AbortController();
    await ask(ai, { signal: c.signal });
    const [, init] = fetch.mock.calls[0];
    expect(JSON.parse(init.body as string).model).toBe("claude-opus-5-5");
    expect(init.signal).toBe(c.signal);
  });

  it("gives back the checked answer: unknown fields dropped, text cut to its limit", async () => {
    const { ai } = make();
    expect(await ask(ai)).toEqual({ ok: true, value: { title: "Groc" + "e" } });
  });

  it("counts one use for each request sent", async () => {
    const { ai } = make(async () => apiError(529, "overloaded_error", "Overloaded"));
    await ask(ai);
    await ask(ai);
    expect(ai.usesThisMonth()).toBe(2);
  });

  it("sends nothing and counts nothing once this month's limit is reached", async () => {
    const { ai, fetch } = make();
    ai.setCap(1);
    expect((await ask(ai)).ok).toBe(true);
    const r = await ask(ai);
    expect(r).toMatchObject({ ok: false, kind: "cap" });
    expect(!r.ok && r.message).toMatch(/1 AI use.*this month/i);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ai.usesThisMonth()).toBe(1);
  });

  it("sends nothing without a key, and never another person's key", async () => {
    const { ai, fetch } = make();
    expect(await ask(ai, { uid: "u2" })).toMatchObject({ ok: false, kind: "no-key" });
    expect(await ask(ai, { uid: null })).toMatchObject({ ok: false, kind: "no-key" });
    ai.forgetKey();
    expect(await ask(ai)).toMatchObject({ ok: false, kind: "no-key" });
    expect(fetch).not.toHaveBeenCalled();
    expect(ai.usesThisMonth()).toBe(0);
  });

  it("a cancel signal already set sends nothing and counts nothing; a timeout or a cancel with a reason says Stopped", async () => {
    const { ai, fetch } = make();
    const c = new AbortController();
    c.abort();
    expect(await ask(ai, { signal: c.signal })).toMatchObject({ ok: false, kind: "cancelled" });
    expect(fetch).not.toHaveBeenCalled();
    expect(ai.usesThisMonth()).toBe(0);

    const late = new AbortController();
    const timed = make(async () => {
      late.abort(new Error("gave up"));
      throw new Error("gave up");
    });
    expect(await ask(timed.ai, { signal: late.signal })).toMatchObject({ ok: false, kind: "cancelled" });
  });

  it("refuses to send when this browser won't let it count the use, so the monthly limit can't be skipped", async () => {
    const device = memory();
    const fetch = vi.fn(async () => ok());
    const ai = createAiStore({
      session: memory(),
      device: {
        ...device,
        setItem: (k: string, v: string) => {
          if (k.endsWith("ai-uses")) throw new Error("full");
          device.setItem(k, v);
        },
      },
      now: () => new Date(2026, 10, 12, 9),
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    ai.setKey(KEY, { remember: false, uid: "u1" });
    const r = await ai.ask({ uid: "u1", system: "s", user: "u", schema, maxTokens: 100 });
    expect(r).toMatchObject({ ok: false, kind: "cap" });
    expect(!r.ok && r.message).toMatch(/count/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a saved key with letters a header can't carry is refused before sending, not shown as a network failure", async () => {
    const session = memory();
    const fetch = vi.fn(async () => ok());
    const ai = createAiStore({ session, device: memory(), now: () => new Date(), fetch: fetch as unknown as typeof globalThis.fetch });
    // As an older version could have saved it.
    session.setItem("note-board:ai-key", "sk-ant-api03-​abc");
    session.setItem("note-board:ai-key-user", "u1");
    expect(await ai.ask({ uid: "u1", system: "s", user: "u", schema, maxTokens: 100 })).toMatchObject({ ok: false, kind: "invalid-key" });
    expect(fetch).not.toHaveBeenCalled();
    expect(ai.usesThisMonth()).toBe(0);
  });

  it("turns API errors into plain messages", async () => {
    const cases: [Response, string][] = [
      [apiError(401, "authentication_error", "invalid x-api-key"), "invalid-key"],
      [apiError(401, "authentication_error", "CORS requests are not allowed for this Organization because of its settings."), "browser-blocked"],
      [apiError(429, "rate_limit_error", "slow down"), "limit"],
      [apiError(400, "invalid_request_error", "bad"), "update"],
      [new Response("<html>gateway</html>", { status: 502 }), "busy"],
    ];
    for (const [res, kind] of cases) {
      const { ai } = make(async () => res);
      expect(await ask(ai)).toMatchObject({ ok: false, kind });
    }
  });

  it("a request that never gets through is a network failure; a cancelled one says so", async () => {
    const net = make(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await ask(net.ai)).toMatchObject({ ok: false, kind: "network" });
    const stop = make(async () => {
      throw new DOMException("The user aborted a request.", "AbortError");
    });
    expect(await ask(stop.ai)).toMatchObject({ ok: false, kind: "cancelled" });
  });

  it("a 200 whose body is not JSON is a bad reply, not a crash", async () => {
    const { ai } = make(async () => new Response("not json", { status: 200 }));
    expect(await ask(ai)).toMatchObject({ ok: false, kind: "bad-reply" });
  });
});

describe("Test key", () => {
  it("sends one tiny request with the saved key and counts it as one use", async () => {
    const { ai, fetch } = make(async () => ok('{"ok":true}'));
    expect(await ai.testKey("u1")).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetch.mock.calls[0][1].body as string);
    expect(body.max_tokens).toBeLessThanOrEqual(1024);
    expect(ai.usesThisMonth()).toBe(1);
  });

  it("any answer from Anthropic proves the key works, even one cut short or declined", async () => {
    for (const stop of ["max_tokens", "refusal"]) {
      const { ai } = make(
        async () => new Response(JSON.stringify({ stop_reason: stop, content: [] }), { status: 200 }),
      );
      expect(await ai.testKey("u1")).toEqual({ ok: true });
    }
  });

  it("gives the plain message when it fails", async () => {
    const { ai } = make(async () => apiError(401, "authentication_error", "invalid x-api-key"));
    expect(await ai.testKey("u1")).toMatchObject({ ok: false, kind: "invalid-key" });
  });
});

describe("the key never leaks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reaches no console output and no message, on success or any failure, even when the API echoes it", async () => {
    const methods = ["log", "info", "warn", "error", "debug", "trace", "dir", "table"] as const;
    const spies = methods.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const answers: (() => Promise<Response>)[] = [
      async () => ok(),
      async () => apiError(401, "authentication_error", `invalid x-api-key ${KEY}`),
      async () => apiError(400, "invalid_request_error", `header x-api-key: ${KEY}`),
      async () => apiError(529, "overloaded_error", KEY),
      async () => new Response(KEY, { status: 500 }),
      async () => new Response(`{"stop_reason":"end_turn","content":[{"type":"text","text":"${KEY}"}]}`, { status: 200 }),
      async () => {
        throw new TypeError(`Failed to fetch with ${KEY}`);
      },
      async () => {
        throw new DOMException(KEY, "AbortError");
      },
    ];
    for (const answer of answers) {
      const { ai } = make(answer);
      const r = await ask(ai);
      expect(JSON.stringify(r)).not.toContain("SECRET");
      const t = await ai.testKey("u1");
      expect(JSON.stringify(t)).not.toContain("SECRET");
    }
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain("SECRET");
  });

  it("no source file prints anything about keys or request headers, and the AI files print nothing at all", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(join(__dirname, ".."));
    expect(files.length).toBeGreaterThan(50);
    const aiFiles = ["model/ai.ts", "store/ai.ts", "components/AiSettings.tsx"];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      if (aiFiles.some((a) => f.endsWith(a)))
        expect(text, f).not.toMatch(/\bconsole\s*\./);
      // A console call whose line mentions a key, an API key or request headers.
      const bad = text
        .split("\n")
        .filter((l) => /\bconsole\s*\./.test(l) && /key|header|x-api|anthropic|getKey/i.test(l));
      expect(bad, f).toEqual([]);
    }
  });
});
