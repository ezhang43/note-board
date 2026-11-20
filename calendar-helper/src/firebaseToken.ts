// Checks a Firebase ID token (a JWT) without the Admin SDK, as Firebase's "Verify ID tokens using a
// third-party JWT library" says: RS256, signed by one of Google's securetoken keys (by `kid`), `aud`
// the Firebase project id, `iss` https://securetoken.google.com/<project id>, `exp` in the future,
// `iat` and `auth_time` in the past, `sub` (the uid) a non-empty string.

/** Who the token says is signed in. */
export interface FirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /** The Google account ids (`sub`) this sign-in is linked to. */
  googleIds: string[];
}

/** The public key with this key id, or null if there is none. */
export type KeyFor = (kid: string) => Promise<CryptoKey | null>;

/** Clocks differ a little: a token issued up to this many seconds "from now" is still taken. */
const SKEW = 60;

export function b64urlBytes(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A JWT's part as JSON, or null when it is not. */
export function jwtPart(part: string | undefined): Record<string, unknown> | null {
  if (!part || !/^[A-Za-z0-9_-]+$/.test(part)) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(b64urlBytes(part)));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function verifyIdToken(token: string, projectId: string, keyFor: KeyFor, nowMs: number): Promise<FirebaseUser | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const head = jwtPart(parts[0]);
  const body = jwtPart(parts[1]);
  if (!head || !body || head.alg !== 'RS256' || typeof head.kid !== 'string') return null;
  const key = await keyFor(head.kid);
  if (!key) return null;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = b64urlBytes(parts[2]);
  } catch {
    return null;
  }
  const signed = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`)).catch(() => false);
  if (!signed) return null;

  const now = nowMs / 1000;
  const exp = num(body.exp);
  const iat = num(body.iat);
  const authTime = num(body.auth_time);
  if (body.aud !== projectId || body.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (exp === null || exp <= now || iat === null || iat > now + SKEW || authTime === null || authTime > now + SKEW) return null;
  if (typeof body.sub !== 'string' || !body.sub || body.sub.length > 128) return null;

  const firebase = body.firebase as { identities?: Record<string, unknown> } | undefined;
  const ids = firebase?.identities?.['google.com'];
  return {
    uid: body.sub,
    email: typeof body.email === 'string' ? body.email : null,
    emailVerified: body.email_verified === true,
    googleIds: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [],
  };
}

const JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/**
 * Google's securetoken public keys, fetched as JWKs and kept for as long as Google's Cache-Control
 * max-age says. Firebase's page names the X.509 address of the same keys
 * (robot/v1/metadata/x509/securetoken@...); the JWK form is read here so WebCrypto can import it
 * without a certificate parser.
 * simple: kept in the Worker's memory, so each new Worker instance fetches them once.
 */
export function googleKeys(fetchFn: typeof fetch, now: () => number): KeyFor {
  let cache: { keys: Map<string, CryptoKey>; until: number; fetched: number } | null = null;
  async function load() {
    const res = await fetchFn(JWKS);
    if (!res.ok) throw new Error(`keys ${res.status}`);
    const json = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
    const keys = new Map<string, CryptoKey>();
    for (const jwk of json.keys ?? []) {
      if (!jwk.kid || jwk.kty !== 'RSA') continue;
      keys.set(jwk.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
    }
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
    cache = { keys, until: now() + maxAge * 1000, fetched: now() };
  }
  return async (kid) => {
    // A key id not seen yet is fetched again, at most once a minute (Google adds keys before using them).
    if (!cache || cache.until <= now() || (!cache.keys.has(kid) && now() - cache.fetched > 60_000)) await load();
    return cache!.keys.get(kid) ?? null;
  };
}
