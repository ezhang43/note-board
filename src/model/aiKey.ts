// The person's own Anthropic key: its storage names, and clearing it for the sign-in watcher (job 12b).
// Kept apart from src/store/ai.ts (React, the AI settings store) so the sign-in code that is always
// loaded (src/sync/firebase.ts) stays small.

export const AI_KEY_NAME = "note-board:ai-key";
export const AI_KEY_USER_NAME = "note-board:ai-key-user";
/** The secret names: the key and whose it is (cleared on sign-out, a change of person and account delete). */
export const AI_KEY_NAMES: readonly string[] = [AI_KEY_NAME, AI_KEY_USER_NAME];

/**
 * Removes the key and whose it is from each of `places` unless it is `uid`'s. Signed out (`uid`
 * null) it always goes, even one saved with no one signed in. Blocked storage is skipped.
 */
export function dropAiKeyUnlessFor(places: (() => Storage)[], uid: string | null) {
  for (const get of places) {
    try {
      const place = get();
      if (uid === null || place.getItem(AI_KEY_USER_NAME) !== uid)
        AI_KEY_NAMES.forEach((n) => place.removeItem(n));
    } catch {
      // Blocked storage: nothing kept there to clear.
    }
  }
}
