// The pure part of the AI client (wow plan, job 13): the request body for Anthropic's Messages API, checking
// Claude's reply against a small schema, and a plain message for every way a request can fail.
// No React, no DOM, no network: src/store/ai.ts sends the request with the person's own key.
//
// API details checked on 2026-11-12 against Anthropic's docs (recorded in changes/ai-client.decisions.md):
// version 2026-10-21; structured output is output_config.format {type: "json_schema", schema}, where every
// object needs additionalProperties: false and length limits (maxLength and the like) are not supported, so
// they are applied here instead; the JSON comes back in the reply's "text" part.
//
// Claude's answer is untrusted input: only fields the schema names are kept, strings and lists are cut to
// their limits, and a reply that does not fit is refused. Error messages are built from the status and the
// error's type only, never from what the API said, so nothing sent (the key included) is ever repeated.

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2026-10-21";

/** A small JSON schema. maxLength and maxItems are checked here and never sent (the API does not take them). */
export type AiSchema =
  | { type: "string"; maxLength?: number; enum?: readonly string[] }
  | { type: "number" | "integer" | "boolean" }
  | { type: "array"; items: AiSchema; maxItems?: number }
  | { type: "object"; properties: Record<string, AiSchema>; required?: readonly string[] };

export type Effort = "low" | "medium" | "high";

export type AiFailureKind =
  | "no-key"
  | "cap"
  | "storage"
  | "labels-not-saved"
  | "invalid-key"
  | "browser-blocked"
  | "limit"
  | "rate-limit"
  | "permission"
  | "workspace"
  | "update"
  | "model"
  | "too-big"
  | "busy"
  | "network"
  | "timeout"
  | "cancelled"
  | "refusal"
  | "too-long"
  | "bad-reply"
  | "other";
export type AiFailure = { ok: false; kind: AiFailureKind; message: string };
export type AiResult<T = unknown> = { ok: true; value: T } | AiFailure;

export const fail = (kind: AiFailureKind, message: string): AiFailure => ({ ok: false, kind, message });

/** The schema as the API takes it: closed objects, every field required unless the schema says, no length limits. */
export function toApiSchema(s: AiSchema): Record<string, unknown> {
  switch (s.type) {
    case "string":
      return s.enum ? { type: "string", enum: [...s.enum] } : { type: "string" };
    case "array":
      return { type: "array", items: toApiSchema(s.items) };
    case "object":
      return {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(s.properties).map(([k, v]) => [k, toApiSchema(v)]),
        ),
        required: [...(s.required ?? Object.keys(s.properties))],
        additionalProperties: false,
      };
    default:
      return { type: s.type };
  }
}

export type AiRequest = {
  model: string;
  system: string;
  user: string;
  schema: AiSchema;
  maxTokens: number;
  effort?: Effort;
};

/** The Messages API body. No temperature, top_p, top_k, prefill or forced tool: each is refused (400) on current models. */
export function buildRequest({ model, system, user, schema, maxTokens, effort = "low" }: AiRequest) {
  return {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user" as const, content: user }],
    output_config: {
      effort,
      format: { type: "json_schema" as const, schema: toApiSchema(schema) },
    },
  };
}

type Checked = { ok: true; value: unknown } | { ok: false };
const NO: Checked = { ok: false };

/** Keeps only what the schema names, cuts strings and lists to their limits, refuses anything that does not fit. */
export function validate(s: AiSchema, v: unknown): Checked {
  switch (s.type) {
    case "string": {
      if (typeof v !== "string") return NO;
      if (s.enum && !s.enum.includes(v)) return NO;
      return { ok: true, value: s.maxLength === undefined ? v : v.slice(0, s.maxLength) };
    }
    case "number":
      return typeof v === "number" && Number.isFinite(v) ? { ok: true, value: v } : NO;
    case "integer":
      return Number.isInteger(v) ? { ok: true, value: v } : NO;
    case "boolean":
      return typeof v === "boolean" ? { ok: true, value: v } : NO;
    case "array": {
      if (!Array.isArray(v)) return NO;
      const out: unknown[] = [];
      for (const item of v.slice(0, s.maxItems)) {
        const r = validate(s.items, item);
        if (!r.ok) return NO;
        out.push(r.value);
      }
      return { ok: true, value: out };
    }
    case "object": {
      if (typeof v !== "object" || v === null || Array.isArray(v)) return NO;
      const required = s.required ?? Object.keys(s.properties);
      const out: Record<string, unknown> = {};
      for (const [k, sub] of Object.entries(s.properties)) {
        if (!Object.hasOwn(v, k)) {
          if (required.includes(k)) return NO;
          continue;
        }
        const r = validate(sub, (v as Record<string, unknown>)[k]);
        if (!r.ok) return NO;
        out[k] = r.value;
      }
      return { ok: true, value: out };
    }
  }
}

const BAD_REPLY = "Claude's answer didn't come back in the expected shape. Try again.";

/** Reads a successful (200) Messages API reply: the stop reason first, then the JSON in its text part. */
export function readReply(reply: unknown, schema: AiSchema): AiResult {
  if (typeof reply !== "object" || reply === null) return fail("bad-reply", BAD_REPLY);
  const r = reply as { stop_reason?: unknown; content?: unknown };
  if (r.stop_reason === "refusal")
    return fail("refusal", "Claude declined to answer this one. Try different text.");
  if (r.stop_reason === "max_tokens")
    return fail("too-long", "Claude's answer was too long and ran out of room. Try with less text.");
  const text = Array.isArray(r.content)
    ? (r.content as { type?: unknown; text?: unknown }[]).find(
        (b) => b && b.type === "text" && typeof b.text === "string",
      )?.text
    : undefined;
  if (typeof text !== "string") return fail("bad-reply", BAD_REPLY);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("bad-reply", BAD_REPLY);
  }
  const checked = validate(schema, parsed);
  return checked.ok ? { ok: true, value: checked.value } : fail("bad-reply", BAD_REPLY);
}

const LIMIT =
  "Your Anthropic account hit a spend or billing limit. Check the limits and credit in the Anthropic Console.";
const RATE_LIMIT = "Anthropic says too many requests came from your account. Wait a minute, then try again.";
const NOT_ALLOWED =
  "This key isn't allowed to do this. Check the key's permissions in the Anthropic Console.";
const TOO_BIG = "That is too much text to send at once. Try with less.";

/** True when the key is only plain printable letters (no spaces, smart quotes or hidden marks), so a request header can carry it. */
export const usableKey = (key: string) => /^[\x21-\x7e]+$/.test(key);
const BUSY = "Anthropic is busy right now. Try again in a minute.";

/**
 * A plain message for a failed request, from its status and the error's type. The API's own message is only
 * compared against a few known starts and never shown, so a key it echoed back can't reach the screen.
 */
export function errorFor(status: number, body: unknown): AiFailure {
  const e = (body as { error?: unknown } | null)?.error;
  const type = typeof (e as { type?: unknown })?.type === "string" ? (e as { type: string }).type : "";
  const said = typeof (e as { message?: unknown })?.message === "string" ? (e as { message: string }).message : "";

  if (status === 401 && said.startsWith("CORS requests are not allowed for this Organization"))
    return fail(
      "browser-blocked",
      "Your Anthropic organization blocks browser use (Zero Data Retention or Compliance API). Use a key from a different organization.",
    );
  if (status === 401)
    return fail("invalid-key", "This key isn't valid. Check it in the Anthropic Console, then save it again.");
  if (status === 403) return fail("permission", NOT_ALLOWED);
  if (status === 429 || type === "rate_limit_error") return fail("rate-limit", RATE_LIMIT);
  if (status === 402 || type === "billing_error") return fail("limit", LIMIT);
  if (status === 400 && /spend limit|usage limit|credit balance/i.test(said)) return fail("limit", LIMIT);
  if (status === 400 && /prompt is too long/i.test(said)) return fail("too-big", TOO_BIG);
  if (status === 400 && said.startsWith("This API key is not scoped to a workspace"))
    return fail(
      "workspace",
      "This key isn't tied to one workspace. In the Anthropic Console, make a key inside a workspace and use that one.",
    );
  if (status === 400)
    return fail(
      "update",
      "Note Board needs an update to work with Anthropic. Reload the page; if it keeps happening, tell us with Feedback.",
    );
  if (status === 404)
    return fail("model", "This key can't use the chosen model. Pick another model in AI settings.");
  if (status === 413) return fail("too-big", TOO_BIG);
  if (type === "overloaded_error" || status >= 500) return fail("busy", BUSY);
  return fail("other", `Anthropic couldn't answer (error ${status}). Try again later.`);
}

export const NETWORK_FAILURE: AiFailure = fail(
  "network",
  "Couldn't reach Anthropic. Check your internet connection; some networks and browser add-ons block it.",
);
export const TIMEOUT: AiFailure = fail(
  "timeout",
  "Anthropic took too long to answer. Try again in a minute.",
);
export const CANCELLED: AiFailure = fail("cancelled", "Stopped.");

/** What an aborted request means: a timeout (the signal's reason is a TimeoutError, like AbortSignal.timeout) says so; any other stop is a cancel. */
export const stoppedBy = (signal?: AbortSignal): AiFailure =>
  (signal?.reason as { name?: unknown } | undefined)?.name === "TimeoutError" ? TIMEOUT : CANCELLED;
