import { moveDraftStartTime, type Draft } from './calendar';

// A time typed in an event's title ("Dinner 8pm", "at 8:30pm", "8-9pm") sets its start, and its end
// for a range, when the form is saved, and the time words leave the title (owner request, 2026-11-22).
// A time needs am / pm ("8pm", "8 p.m.", "8p"); a bare number ("8", "Room 101") stays as words.

/** One time: hour, optional minutes, optional am / pm (groups: hour, minutes, am / pm). "8p" needs no space; "8 p" (as in "2 a day") isn't a time. */
const TIME = String.raw`(\d{1,2})(?::([0-5]\d))?(\s*[ap]\.?m\.?|[ap]\.?)?`;
/** An optional "at ", a time, and an optional "- time" after it; not inside a word or a longer number. */
const FIND = new RegExp(String.raw`(?<![\w:.])(?:at\s+)?${TIME}(?:\s*[-–—]\s*${TIME})?(?!\w|:\d)`, 'gi');

const pad = (n: number) => String(n).padStart(2, '0');

/** 'HH:MM' from a 1–12 hour, minutes and am / pm as typed, or null when the hour can't be on a clock. */
function clock(hour: string, minutes: string | undefined, half: string): string | null {
  const h = Number(hour);
  if (h < 1 || h > 12) return null;
  return `${pad((h % 12) + (/p/i.test(half) ? 12 : 0))}:${minutes ?? '00'}`;
}

/**
 * The draft with the first time in its title as its start (keeping the length, or a range's end),
 * and that time, with an "at" before it, taken out of the title. An all-day event, or a title with
 * no time in it, comes back as it was.
 */
export function titleTime(d: Draft): Draft {
  if (d.allDay) return d;
  for (const m of d.title.matchAll(FIND)) {
    const [text, h1, m1, half1, h2, m2, half2] = m;
    // A range takes its am / pm from its end when the start has none ("8-9pm"), or am when that would end before it ("11-1pm").
    const end = h2 && half2 ? clock(h2, m2, half2) : null;
    let start = half1 ? clock(h1, m1, half1) : null;
    if (!half1 && end) {
      start = clock(h1, m1, half2);
      if (start && start >= end) start = clock(h1, m1, 'a');
    }
    if (!start) continue;
    // "8pm-9" or "8pm-13pm": the end isn't a time, so only the start counts and the rest stays as words.
    const taken = h2 && !end ? text.slice(0, text.search(/\s*[-–—]/)) : text;
    // Brackets left empty and separators left at an end go too ("Dinner (8pm)", "Dinner - 8pm", "8pm: Dinner").
    const title = (d.title.slice(0, m.index) + ' ' + d.title.slice(m.index! + taken.length))
      .replace(/[([]\s*[)\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[,;:@\-–—]\s*|\s*[,;:@\-–—]$/g, '');
    const moved = moveDraftStartTime({ ...d, title }, start);
    // A range ending at or before its start is ignored: the length is kept instead.
    return end && end > start ? { ...moved, endTime: end, endDate: d.startDate } : moved;
  }
  return d;
}
