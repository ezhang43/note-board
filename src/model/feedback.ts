// Send feedback (owner request, job #69). The online rules (firestore.rules) hold notes to the same limit.

/** The longest note, in characters. */
export const FEEDBACK_MAX = 1000;

/** The note to send (trimmed), or null when there is nothing to send or it is too long. */
export function feedbackText(raw: string): string | null {
  const text = raw.trim();
  return text.length >= 1 && text.length <= FEEDBACK_MAX ? text : null;
}
