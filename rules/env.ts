// The test harness for firestore.rules: every rules test file starts with `useRulesEnv()` and then
// acts as a person with `as('alice')`, `asUnverified('alice')` or `signedOut()`. It talks only to the
// local Firestore emulator (`npm run test:rules` starts it) under a `demo-` project id, which never
// reaches the real Firebase project.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, type DocumentData, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach } from 'vitest';

let env: RulesTestEnvironment;

/** Starts the rules from firestore.rules for this file, with an empty database before every test. */
export function useRulesEnv() {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-note-board',
      firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
    });
  });
  beforeEach(() => env.clearFirestore());
  afterAll(() => env.cleanup());
}

const emailOf = (uid: string) => `${uid}@example.com`;

/** The name Google gives `uid` in these tests unless one is asked for: 'A' for alice, 'B' for bob, and so on. */
export const nameOf = (uid: string) => uid[0].toUpperCase();

/**
 * A signed-in person with a verified email (what Google sign-in gives), as the app's Firestore.
 * `profile`: the name and photo in their sign-in token (review 181-A M1), by default nameOf(uid) and no photo.
 */
export const as = (uid: string, profile: { name?: string; picture?: string } = { name: nameOf(uid) }) =>
  env.authenticatedContext(uid, { email: emailOf(uid), email_verified: true, ...profile }).firestore() as unknown as Firestore;

/** A signed-in person whose email isn't verified. */
export const asUnverified = (uid: string) =>
  env.authenticatedContext(uid, { email: emailOf(uid), email_verified: false }).firestore() as unknown as Firestore;

/** Nobody signed in. */
export const signedOut = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

export { emailOf };

/** Puts documents in place with the rules off (the "before" of a test). */
export async function seed(docs: Record<string, DocumentData>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    for (const [path, data] of Object.entries(docs)) await setDoc(doc(db, path), data);
  });
}
