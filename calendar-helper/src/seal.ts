import { b64urlBytes } from './firebaseToken';

// The refresh token is kept sealed (AES-GCM, WebCrypto) with TOKEN_KEY, a 32-byte random key set as a
// Worker secret, so a copy of the KV store alone can't use it. The uid is bound in as additional data:
// an entry copied to another person's key does not open.

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** TOKEN_KEY (base64 or base64url of 32 bytes) as an AES-GCM key, or null when it isn't one. */
export async function sealKey(secret: string | undefined): Promise<CryptoKey | null> {
  if (!secret) return null;
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = b64urlBytes(secret.trim().replace(/=+$/, ''));
  } catch {
    return null;
  }
  if (raw.length !== 32) return null;
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(key: CryptoKey, text: string, uid: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(uid) }, key, new TextEncoder().encode(text));
  return `${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}

/** The text sealed for `uid`, or null when it doesn't open (another key, another uid, damaged). */
export async function unseal(key: CryptoKey, sealed: string, uid: string): Promise<string | null> {
  try {
    const [iv, ct] = sealed.split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlBytes(iv), additionalData: new TextEncoder().encode(uid) }, key, b64urlBytes(ct));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
