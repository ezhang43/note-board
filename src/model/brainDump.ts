import { createCard, type MakeId } from './cards';
import { IMPORT_MAX_CARDS } from './importFile';
import type { Card } from './types';
import { NOTE_NAME_MAX } from './journal';

// Brain dump (wow plan, job 1): messy pasted text → a list of card drafts. Model only. One line
// is one draft. A leading bullet ("-", "*", "•", "+", "–"), number ("1.", "2)") and checkbox
// ("[ ]", "[x]") is removed, and a time estimate ("30m", "1h30", "90 min", "(45m)") is read out of
// the line and out of the title. A checkbox makes a to-do draft; everything else is a note.

export type Draft = {
  title: string;
  /** Whole minutes, 1–1440; left out when the line gives no estimate. */
  minutes?: number;
  kind: 'note' | 'todo';
};

/** The longest estimate read (a whole day): anything bigger is left in the title as text. */
const MAX_MINUTES = 24 * 60;

// Hours ("1h", "2 hours", "1.5h", "1h30", "1h30m", "1h 30 min") or minutes ("30m", "45 min"),
// standing alone: not glued into a word or number ("3mm", "a1h", "2.5.1h"), and "30 m" with a
// space is not an estimate (it could be metres).
const ESTIMATE =
  /(?<![\p{L}\p{N}.])(?:(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)(?:\s*(\d{1,2})\s*(?:m|mins?|minutes?)|([0-5]\d))?|(\d+)(?:m|\s*(?:mins?|minutes?)))(?![\p{L}\p{N}]|\.\d)/giu;

const MARKER = /^(?:[-*+•–]|\d{1,3}[.)])(?:\s+|$)/;
const CHECKBOX = /^\[[ xX]\](?:\s+|$)/;

/** Minutes for one ESTIMATE match, or null when it is not a usable estimate. */
function minutesOf(m: RegExpMatchArray): number | null {
  const [, hours, hourMins, bareMins, mins] = m;
  let total: number;
  if (hours !== undefined) {
    if (hours.includes('.') && (hourMins !== undefined || bareMins !== undefined)) return null; // "1.5h30"
    total = Math.round(Number(hours) * 60) + Number(hourMins ?? bareMins ?? 0);
  } else {
    total = Number(mins);
  }
  return total >= 1 && total <= MAX_MINUTES ? total : null;
}

const cut = (title: string) => Array.from(title).slice(0, NOTE_NAME_MAX).join('').trim();

function draftFor(line: string): Draft | null {
  let text = line.replace(/\s+/g, ' ').trim();
  text = text.replace(MARKER, '');
  let kind: Draft['kind'] = 'note';
  if (CHECKBOX.test(text)) {
    kind = 'todo';
    text = text.replace(CHECKBOX, '');
  }
  if (!text) return null;

  // The last usable estimate on the line.
  let found: { at: number; end: number; minutes: number } | null = null;
  for (const m of text.matchAll(ESTIMATE)) {
    const minutes = minutesOf(m);
    if (minutes !== null) found = { at: m.index, end: m.index + m[0].length, minutes };
  }
  if (found) {
    let { at, end } = found;
    // "(45m)" and "[45m]": take the brackets too.
    if ((text[at - 1] === '(' && text[end] === ')') || (text[at - 1] === '[' && text[end] === ']')) (at -= 1), (end += 1);
    const sep = /[\s\-–—:,;]+/;
    const before = text.slice(0, at).replace(new RegExp(`${sep.source}$`), '');
    const after = text.slice(end).replace(new RegExp(`^${sep.source}`), '');
    const title = cut(`${before} ${after}`.replace(/\s+/g, ' '));
    if (title) return { title, minutes: found.minutes, kind };
  }
  return { title: cut(text), kind }; // a line that is only an estimate keeps its text
}

/** One draft per non-empty line, in order, at most IMPORT_MAX_CARDS of them. */
export function parseBrainDump(text: string): Draft[] {
  const drafts: Draft[] = [];
  for (const line of text.split(/\r\n|[\n\r\u2028\u2029]/)) {
    const draft = draftFor(line);
    if (!draft) continue;
    drafts.push(draft);
    if (drafts.length === IMPORT_MAX_CARDS) break;
  }
  return drafts;
}

/**
 * The cards a list of drafts makes, in order: a note holding the line, or a checklist titled with it.
 * simple: a draft's estimate (`minutes`) is shown in the dialog's preview only and is NOT put on the card,
 * because the saved board has no estimate field yet. It gets saved here once that field lands.
 */
export function draftCards(drafts: Draft[], makeId?: MakeId): Card[] {
  return drafts.map((d) => {
    const card = createCard(d.kind === 'todo' ? 'todo' : 'note', makeId?.('k'));
    if (card.kind === 'note') card.text = d.title;
    else if (card.kind === 'todo') card.title = d.title;
    return card;
  });
}

/** An estimate as words for the preview: "30 min", "1 h", "1 h 30 min". */
export function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
