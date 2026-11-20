import { expect, it } from 'vitest';
import { googleKeys } from './firebaseToken';

// Google's securetoken keys, read as JWKs and kept for Cache-Control's max-age.

it('imports the keys by kid, keeps them for max-age, and fetches again for an unknown kid at most once a minute', async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  let fetched = 0;
  let clock = 0;
  const fetchFn = (async (url: string) => {
    fetched++;
    expect(url).toBe('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'a', alg: 'RS256', use: 'sig' }] }), { headers: { 'cache-control': 'public, max-age=600, must-revalidate' } });
  }) as unknown as typeof fetch;
  const keyFor = googleKeys(fetchFn, () => clock);
  expect(await keyFor('a')).toBeTruthy();
  expect(await keyFor('a')).toBeTruthy();
  expect(fetched).toBe(1);
  expect(await keyFor('zzz')).toBe(null);
  expect(fetched).toBe(1); // under a minute since: not fetched again
  clock = 61_000;
  expect(await keyFor('zzz')).toBe(null);
  expect(fetched).toBe(2);
  clock = 700_000; // past max-age
  await keyFor('a');
  expect(fetched).toBe(3);
});
