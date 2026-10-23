// What a screen reader is told about changes that are otherwise only seen: a delete, an undo, an item
// several items ticked at once. The store says it with `announce`; the page's one polite live region
// (components/LiveRegion.tsx) shows it. Pure: no DOM here.

let text = '';
let flip = false;
const listeners = new Set<() => void>();

export const announcer = {
  /** The live region's text. */
  get: () => text,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};

export function announce(message: string) {
  // The same words twice in a row would leave the region unchanged, so the second time wouldn't be spoken:
  // every other message ends in a no-break space (not spoken, not seen).
  flip = !flip;
  text = flip ? message : `${message} `;
  listeners.forEach((l) => l());
}

/** What was last announced, without the no-break space (for tests). */
export const spoken = () => text.replace(/ $/, '');

/** "1 card", "2 cards". */
export const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
