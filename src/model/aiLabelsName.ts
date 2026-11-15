// Where Sort with AI keeps its labels on this device, how that save is read, and clearing it for the sign-in
// watcher (code review, 2026-11-15). Kept apart from aiCategories.ts (which brings the word rules) so the
// sign-in code that is always loaded (src/sync/firebase.ts) stays small, like src/model/aiKey.ts. The label
// cache (src/store/aiLabels.ts), the sign-in watcher and Delete account (accountKeys) all read it here, so they
// agree on whose the labels are and on what counts as damaged.

/** Where this device keeps the labels (localStorage), with the id of the person they are for. */
export const AI_LABELS_NAME = 'note-board:ai-categories';

/** The saved labels: whose they are ("" for nobody signed in) and the labels by key. */
export interface SavedAiLabels {
  owner: string;
  entries: Record<string, string>;
}

/** The saved labels in `raw` (what is stored under AI_LABELS_NAME), or null when there are none or they are damaged. */
export function readAiLabels(raw: string | null): SavedAiLabels | null {
  try {
    const s = JSON.parse(raw ?? 'null') as { v?: unknown; owner?: unknown; entries?: unknown } | null;
    if (s?.v !== 1 || typeof s.owner !== 'string' || typeof s.entries !== 'object' || !s.entries || Array.isArray(s.entries)) return null;
    return { owner: s.owner, entries: s.entries as Record<string, string> };
  } catch {
    return null;
  }
}

/** Whose the labels in `raw` are, or null when there are none or they are damaged. */
export const aiLabelsOwner = (raw: string | null) => readAiLabels(raw)?.owner ?? null;

/**
 * Removes the labels from `place` unless they are `uid`'s (the same as the AI key, dropAiKeyUnlessFor): on
 * sign-out (`uid` null) they always go; for a signed-in person, anyone else's or damaged ones go. Only the
 * labels' own entry is touched. Blocked storage is skipped.
 */
// simple: parses the whole save (up to LABELS_MAX labels, a few hundred KB) on each sign-in change to read its
// owner; a few milliseconds. Upgrade to a separate owner entry if it shows on slow phones.
export function dropAiLabelsUnlessFor(place: () => Storage, uid: string | null) {
  try {
    const storage = place();
    const raw = storage.getItem(AI_LABELS_NAME);
    if (raw !== null && (uid === null || aiLabelsOwner(raw) !== uid)) storage.removeItem(AI_LABELS_NAME);
  } catch {
    // Blocked storage: nothing kept there to clear.
  }
}
