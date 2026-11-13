// The Visualizer's categories (owner request, 2026-11-12): what an item is about, worked out from its
// words. Everything the Visualizer knows about categories sits behind `categoryOf(item, listTitle)`, so a
// later AI categorizer can replace it without touching the picture. Categories have a stable id (what
// would be remembered) and a display name (what is shown); the ids never change, the names may.
// Nothing here is board data: a category is worked out when the Visualizer draws, and is never saved.

export type CategoryId = string;

export interface Category {
  id: CategoryId;
  name: string;
  /** Words (or phrases) that put an item here. A plain plural ("bills", "taxes") counts as the same word. */
  words: string[];
}

export const OTHER_CATEGORY: CategoryId = 'other';

/**
 * The categories, in the order the disc shows them. This order is also the tie-break: an item that fits
 * several categories goes to the one listed first ("Call the bank" is Calls & messages, not Money & admin).
 * Other has no words: it is what is left.
 */
export const CATEGORIES: Category[] = [
  { id: 'errands', name: 'Errands & shopping', words: ['buy', 'purchase', 'pick up', 'pickup', 'drop off', 'dropoff', 'grocery', 'groceries', 'store', 'shop', 'shopping', 'order', 'return', 'errand', 'mall', 'pharmacy', 'supermarket', 'market'] },
  { id: 'work', name: 'Work', words: ['work', 'meeting', 'project', 'deadline', 'report', 'client', 'boss', 'office', 'presentation', 'proposal', 'sprint', 'ticket', 'colleague', 'coworker', 'standup'] },
  { id: 'calls', name: 'Calls & messages', words: ['call', 'phone', 'email', 'e-mail', 'text', 'reply', 'message', 'respond', 'dm', 'voicemail', 'ping', 'rsvp'] },
  { id: 'home', name: 'Home & chores', words: ['clean', 'laundry', 'dish', 'dishes', 'dishwasher', 'fix', 'tidy', 'vacuum', 'mop', 'sweep', 'trash', 'garbage', 'garden', 'lawn', 'repair', 'declutter', 'chore', 'chores'] },
  { id: 'health', name: 'Health & fitness', words: ['gym', 'run', 'running', 'jog', 'jogging', 'doctor', 'dentist', 'workout', 'med', 'meds', 'medication', 'vitamin', 'stretch', 'yoga', 'exercise', 'therapy', 'checkup', 'swim', 'walk'] },
  { id: 'money', name: 'Money & admin', words: ['pay', 'bill', 'tax', 'bank', 'renew', 'form', 'invoice', 'insurance', 'budget', 'rent', 'mortgage', 'deposit', 'refund', 'passport', 'license', 'licence'] },
  { id: 'learning', name: 'Learning', words: ['read', 'study', 'course', 'practice', 'learn', 'lesson', 'class', 'homework', 'tutorial', 'exam', 'lecture'] },
  { id: 'social', name: 'Social & family', words: ['friend', 'family', 'mom', 'dad', 'mother', 'father', 'brother', 'sister', 'kid', 'son', 'daughter', 'grandma', 'grandpa', 'party', 'birthday', 'dinner', 'visit', 'wedding', 'hang out', 'husband', 'wife', 'anniversary', 'gift'] },
  { id: OTHER_CATEGORY, name: 'Other', words: [] },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * One pattern per category: the words as whole words (letters or digits on neither side), with any run of
 * spaces inside a phrase, and an optional plural s / es. It starts with "start of text or a non-letter"
 * rather than a lookbehind, which Safari before 16.4 cannot parse (that would blank the whole app).
 */
const patterns = CATEGORIES.map((c) =>
  c.words.length ? new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${c.words.map((w) => escape(w).replace(/ /g, '\\s+')).join('|')})(?:e?s)?(?![\\p{L}\\p{N}])`, 'iu') : null,
);

/** The first category whose words appear in `text`, or Other. */
function byWords(text: string): CategoryId {
  for (let i = 0; i < patterns.length; i++) if (patterns[i]?.test(text)) return CATEGORIES[i].id;
  return OTHER_CATEGORY;
}

/**
 * Works out which category an item is in: from its own text, else from the title of the list it came from.
 * It gives a built-in category's id, or a category of its own by name (Sort with AI, see aiCategories.ts).
 */
export type Categorizer = (item: { text: string; /** The words of the items a sub-item sits under, nearest first. */ context?: string[]; /** The board it is on, where known (the Visualizer's items). */ boardId?: string }, listTitle: string) => CategoryId | { name: string };

/** Time words and phrases (owner 2026-11-13): an item that is only one of these is never a Visualizer item, and as a parent it gives its sub-items no category. */
const TIME_WORDS = new Set([
  'today', 'tonight', 'now', 'right now', 'daily', 'tomorrow', 'this morning', 'morning', 'this afternoon', 'afternoon', 'this evening', 'evening',
  'this week', 'weekly', 'this weekend', 'weekend', 'later', 'soon', 'asap', 'todo', 'to do', 'to-do', 'next week',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

/** True when the whole text (case, extra spaces and trailing punctuation or emoji ignored) is just a time word or phrase. "Daily stretch" is not. */
export const isTimeWord = (text: string): boolean =>
  text.length <= 40 && // no phrase on the list is longer; also keeps the patterns below from backtracking on a very long run of spaces or marks
  TIME_WORDS.has(text.toLowerCase().replace(/[\s\p{P}\p{S}\p{Extended_Pictographic}‍️]+$/u, '').replace(/^\s+/, '').replace(/\s+/g, ' '));

/** The category a sub-item takes from the items it sits under: the nearest one (`context` is nearest first) whose words give a real category, else null. A parent like "Today" or "Now" gives none. */
export const parentCategory = (item: { context?: string[] }): CategoryId | null => {
  for (const text of item.context ?? []) {
    if (isTimeWord(text)) continue;
    const c = byWords(text);
    if (c !== OTHER_CATEGORY) return c;
  }
  return null;
};

/**
 * The built-in rules (owner 2026-11-13): for a sub-item, a parent whose words give a category decides for all its
 * sub-items; otherwise (and for any other item) the item's own text; then the list title as a fallback (a list titled
 * "Groceries" makes its items Errands & shopping); then Other.
 */
export const categoryOf = (item: { text: string; context?: string[] }, listTitle: string): CategoryId => {
  const parent = parentCategory(item);
  if (parent) return parent;
  const own = byWords(item.text);
  return own !== OTHER_CATEGORY ? own : byWords(listTitle);
};

/** `inner` (Sort with AI) with a descriptive parent's built-in category in front: it wins over the sub-item's AI label. Items with no such parent go to `inner` unchanged. */
export const parentFirst = (inner: Categorizer): Categorizer => (item, listTitle) => parentCategory(item) ?? inner(item, listTitle);

/** Where a category sits in CATEGORIES (an id nobody knows is Other, the last). */
export function categoryIndex(id: CategoryId): number {
  const i = CATEGORIES.findIndex((c) => c.id === id);
  return i < 0 ? CATEGORIES.length - 1 : i;
}

export const categoryName = (id: CategoryId): string => CATEGORIES[categoryIndex(id)].name;
