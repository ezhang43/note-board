import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  buildRequest,
  errorFor,
  readReply,
  toApiSchema,
  usableKey,
  validate,
  type AiSchema,
} from "./ai";

// The pure part of the AI client (wow plan, job 13): the request body sent to Anthropic's Messages API,
// checking the reply against a small schema, and turning every failure into a plain message.

const card: AiSchema = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 10 },
    minutes: { type: "integer" },
    done: { type: "boolean" },
    tags: { type: "array", items: { type: "string", maxLength: 3 }, maxItems: 2 },
    color: { type: "string", enum: ["red", "blue"] },
  },
  required: ["title"],
};

describe("the request", () => {
  it("goes to the Messages API on the current API version", () => {
    expect(ANTHROPIC_URL).toBe("https://api.anthropic.com/v1/messages");
    expect(ANTHROPIC_VERSION).toBe("2026-10-21");
  });

  it("asks for structured output with the model, a token cap, the system text and one user turn", () => {
    const body = buildRequest({
      model: "claude-haiku-5-5",
      system: "You sort cards.",
      user: "Sort these.",
      schema: card,
      maxTokens: 16000,
    });
    expect(body).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 16000,
      system: "You sort cards.",
      messages: [{ role: "user", content: "Sort these." }],
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: toApiSchema(card) },
      },
    });
  });

  it("sends no sampling settings, no prefill and no forced tool (each is a 400 on current models)", () => {
    const body = buildRequest({
      model: "claude-opus-5-5",
      system: "s",
      user: "u",
      schema: card,
      maxTokens: 100,
      effort: "medium",
    }) as unknown as Record<string, unknown>;
    for (const k of ["temperature", "top_p", "top_k", "tool_choice", "tools"])
      expect(body).not.toHaveProperty(k);
    const messages = body.messages as { role: string }[];
    expect(messages.map((m) => m.role)).toEqual(["user"]);
    expect((body.output_config as { effort: string }).effort).toBe("medium");
  });

  it("sends a schema the API takes: closed objects, and no length limits (those are checked here instead)", () => {
    const api = toApiSchema(card);
    expect(api).toEqual({
      type: "object",
      properties: {
        title: { type: "string" },
        minutes: { type: "integer" },
        done: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
        color: { type: "string", enum: ["red", "blue"] },
      },
      required: ["title"],
      additionalProperties: false,
    });
    expect(JSON.stringify(api)).not.toMatch(/maxLength|maxItems|minLength|minimum|maximum/);
  });

  it("makes every field required when the schema names none", () => {
    const api = toApiSchema({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
    });
    expect(api.required).toEqual(["a", "b"]);
  });
});

describe("checking a reply against the schema", () => {
  it("keeps what fits, drops fields it does not know, and cuts strings and lists to their limits", () => {
    expect(
      validate(card, {
        title: "A very long title",
        minutes: 30,
        done: false,
        tags: ["abcd", "ef", "gh"],
        color: "red",
        sneaky: "<script>",
      }),
    ).toEqual({
      ok: true,
      value: { title: "A very lon", minutes: 30, done: false, tags: ["abc", "ef"], color: "red" },
    });
  });

  it("leaves out a missing optional field, but refuses a missing required one", () => {
    expect(validate(card, { title: "Hi" })).toEqual({ ok: true, value: { title: "Hi" } });
    expect(validate(card, { minutes: 3 }).ok).toBe(false);
  });

  it("refuses the wrong kinds of value", () => {
    expect(validate(card, { title: 5 }).ok).toBe(false);
    expect(validate(card, { title: "a", minutes: 1.5 }).ok).toBe(false);
    expect(validate(card, { title: "a", minutes: Number.NaN }).ok).toBe(false);
    expect(validate(card, { title: "a", done: "yes" }).ok).toBe(false);
    expect(validate(card, { title: "a", tags: "x" }).ok).toBe(false);
    expect(validate(card, { title: "a", color: "green" }).ok).toBe(false);
    expect(validate(card, null).ok).toBe(false);
    expect(validate(card, ["title"]).ok).toBe(false);
    expect(validate({ type: "number" }, Infinity).ok).toBe(false);
    expect(validate({ type: "number" }, 2.5)).toEqual({ ok: true, value: 2.5 });
  });

  it("does not let a reply set a prototype", () => {
    const r = validate(card, JSON.parse('{"title":"a","__proto__":{"polluted":true}}'));
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(r.ok && r.value)).toBe(Object.prototype);
  });
});

describe("reading the reply", () => {
  const reply = (over: Record<string, unknown> = {}) => ({
    type: "message",
    stop_reason: "end_turn",
    content: [
      { type: "thinking", thinking: "…" },
      { type: "text", text: '{"title":"Shop","extra":1}' },
    ],
    ...over,
  });

  it("finds the text part, parses it and checks it", () => {
    expect(readReply(reply(), card)).toEqual({ ok: true, value: { title: "Shop" } });
  });

  it("says plainly when Claude declined", () => {
    const r = readReply(reply({ stop_reason: "refusal", stop_details: { type: "refusal" } }), card);
    expect(r).toMatchObject({ ok: false, kind: "refusal" });
    expect(!r.ok && r.message).toMatch(/declined/i);
  });

  it("says plainly when the answer ran out of room", () => {
    const r = readReply(reply({ stop_reason: "max_tokens" }), card);
    expect(r).toMatchObject({ ok: false, kind: "too-long" });
    expect(!r.ok && r.message).toMatch(/too long|ran out/i);
  });

  it("treats a reply that is not the expected JSON as a bad reply, never a crash", () => {
    for (const bad of [
      reply({ content: [{ type: "text", text: "not json" }] }),
      reply({ content: [{ type: "text", text: '{"minutes":1}' }] }),
      reply({ content: [] }),
      reply({ content: "x" }),
      null,
      "x",
      {},
    ])
      expect(readReply(bad, card)).toMatchObject({ ok: false, kind: "bad-reply" });
  });
});

describe("plain messages for every failure", () => {
  const err = (type: string, message: string) => ({
    type: "error",
    error: { type, message },
    request_id: "req_1",
  });

  it("401 is an invalid key", () => {
    const r = errorFor(401, err("authentication_error", "invalid x-api-key"));
    expect(r.kind).toBe("invalid-key");
    expect(r.message).toMatch(/key.*(not valid|wrong|isn.t)/i);
  });

  it("a 401 for an organization that blocks browser use (Zero Data Retention or the Compliance API) says so", () => {
    for (const m of [
      "CORS requests are not allowed for this Organization because of custom retention settings.",
      "CORS requests are not allowed for this Organization because of its settings.",
    ]) {
      const r = errorFor(401, err("authentication_error", m));
      expect(r.kind).toBe("browser-blocked");
      expect(r.message).toContain("Zero Data Retention or Compliance API");
      expect(r.message).toMatch(/different organization/i);
    }
  });

  it("402, 403 and 429 are a spend, billing or rate limit, and so is a 400 about a spend limit", () => {
    for (const [s, t, m] of [
      [402, "billing_error", "Your credit balance is too low."],
      [403, "permission_error", "Your API key does not have permission."],
      [429, "rate_limit_error", "Number of request tokens has exceeded your per-minute rate limit"],
      [400, "invalid_request_error", "You have reached your specified workspace API usage limits."],
      [400, "invalid_request_error", "This request would exceed your organization's spend limit."],
    ] as const) {
      const r = errorFor(s, err(t, m));
      expect(r.kind, `${s} ${m}`).toBe("limit");
      expect(r.message).toMatch(/limit/i);
    }
  });

  it("a 400 for an account out of credit is a billing limit, not 'needs an update'", () => {
    const r = errorFor(
      400,
      err("invalid_request_error", "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."),
    );
    expect(r.kind).toBe("limit");
    expect(r.message).toMatch(/credit/i);
  });

  it("a 400 for a prompt that is too long says there is too much text", () => {
    const r = errorFor(400, err("invalid_request_error", "prompt is too long: 250000 tokens > 200000 maximum"));
    expect(r.kind).toBe("too-big");
  });

  it("a 403 also says the key may not be allowed to do this", () => {
    const r = errorFor(403, err("permission_error", "Your API key does not have permission to use the specified resource."));
    expect(r.kind).toBe("limit");
    expect(r.message).toMatch(/allowed/i);
  });

  it("only a key of plain printable letters can go in a request header", () => {
    expect(usableKey("sk-ant-api03-abc_DEF-123")).toBe(true);
    for (const bad of ["", "sk-ant-…1234", "sk-ant-​abc", "sk-ant-“abc”", "sk ant", "sk-ant-\tx", "sk-ant-é"])
      expect(usableKey(bad), JSON.stringify(bad)).toBe(false);
  });

  it("529, overloaded, 500 and 504 mean Anthropic is busy: try again", () => {
    for (const [s, t] of [
      [529, "overloaded_error"],
      [500, "api_error"],
      [504, "timeout_error"],
      [503, "overloaded_error"],
    ] as const) {
      const r = errorFor(s, err(t, "Overloaded"));
      expect(r.kind, String(s)).toBe("busy");
      expect(r.message).toMatch(/busy.*try again/i);
    }
  });

  it("a 400 for a key with no workspace says to use a workspace key", () => {
    const r = errorFor(
      400,
      err(
        "invalid_request_error",
        "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use.",
      ),
    );
    expect(r.kind).toBe("workspace");
    expect(r.message).toMatch(/workspace/i);
  });

  it("any other 400 means Note Board needs an update", () => {
    const r = errorFor(400, err("invalid_request_error", "temperature: Extra inputs are not permitted"));
    expect(r.kind).toBe("update");
    expect(r.message).toMatch(/Note Board needs an update/);
  });

  it("404 is a model this key can't use, 413 is too much text", () => {
    expect(errorFor(404, err("not_found_error", "model: x")).kind).toBe("model");
    expect(errorFor(413, err("request_too_large", "too big")).kind).toBe("too-big");
  });

  it("anything else, or a body that is not the error shape, still gives a plain message", () => {
    for (const [s, b] of [
      [418, null],
      [400, "<html>"],
      [401, { error: "x" }],
      [599, {}],
    ] as const) {
      const r = errorFor(s, b);
      expect(r.ok).toBe(false);
      expect(r.message.length).toBeGreaterThan(10);
    }
    expect(errorFor(418, null).message).toContain("418");
  });

  it("never repeats what the API said, so a key echoed back in an error never reaches the screen", () => {
    const key = "sk-ant-api03-SECRET-abcd1234";
    for (const s of [400, 401, 403, 404, 413, 418, 429, 500, 529]) {
      const r = errorFor(s, err("invalid_request_error", `bad key ${key} sent`));
      expect(r.message).not.toContain(key);
      expect(r.message).not.toContain("SECRET");
      expect(JSON.stringify(r)).not.toContain("SECRET");
    }
  });
});
