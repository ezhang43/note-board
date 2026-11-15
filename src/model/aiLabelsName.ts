// Where Sort with AI keeps its labels on this device, and clearing them for the sign-in watcher (code review,
// 2026-11-15). Kept apart from aiCategories.ts (which brings the word rules) so the sign-in code that is always
// loaded (src/sync/firebase.ts) stays small, like src/model/aiKey.ts.

/** Where this device keeps the labels (localStorage), with the id of the person they are for. */
export const AI_LABELS_NAME = 'note-board:ai-categories';

/**
 * Removes the labels from `place` unless they are `uid`'s (the same as the AI key, dropAiKeyUnlessFor): on
 * sign-out (`uid` null) they always go; for a signed-in person, anyone else's or damaged ones go. Only the
 * labels' own entry is touched. Blocked storage is skipped.
 */
export function dropAiLabelsUnlessFor(place: () => Storage, uid: string | null) {
  try {
    const storage = place();
    const saved = storage.getItem(AI_LABELS_NAME);
    if (saved === null) return;
    let owner: unknown = null;
    try {
      owner = (JSON.parse(saved) as { owner?: unknown } | null)?.owner;
    } catch {
      // Damaged: of no use to anyone.
    }
    if (uid === null || owner !== uid) storage.removeItem(AI_LABELS_NAME);
  } catch {
    // Blocked storage: nothing kept there to clear.
  }
}
