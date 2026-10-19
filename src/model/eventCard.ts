import { addDays, dayLabel, timeLabel, type CalEvent } from './calendar';

// The small card a calendar event opens (owner request, 2026-10-19, job #108).

/** "Thu 15 Oct · 10:00 – 11:00", "Thu 15 – Sat 17 Oct · All day", or each end with its day when it runs over midnight. */
export function whenLabel(e: CalEvent): string {
  if (!e.allDay) {
    const [startDay, endDay] = [e.start.slice(0, 10), e.end.slice(0, 10)];
    if (startDay === endDay) return `${dayLabel(startDay)} · ${timeLabel(e)}`;
    return `${dayLabel(startDay)} ${e.start.slice(11)} – ${dayLabel(endDay)} ${e.end.slice(11)}`;
  }
  // Google keeps the day after an all-day event as its end.
  const last = addDays(e.end, -1);
  if (last <= e.start) return `${dayLabel(e.start)} · All day`;
  const first = last.slice(0, 7) === e.start.slice(0, 7) ? dayLabel(e.start).replace(/ \S+$/, '') : dayLabel(e.start);
  return `${first} – ${dayLabel(last)} · All day`;
}

const GAP = 8;

/**
 * Where the card sits: just left of the panel (clear of its resize strip), its top level with the
 * event, kept on screen and never above the panel's top so it doesn't cover the toolbar. With no
 * room left of the panel it sits inside the panel, 8px from the window's right edge, and never over
 * the resize strip on the panel's edge (the card's CSS keeps it narrow enough to fit).
 */
export function cardPosition(
  event: { top: number },
  panel: { left: number; top: number },
  card: { width: number; height: number },
  screen: { width: number; height: number },
): { left: number; top: number } {
  const beside = panel.left - GAP - card.width;
  return {
    left: beside >= GAP ? beside : Math.max(panel.left + GAP, screen.width - GAP - card.width),
    top: Math.max(panel.top, Math.min(event.top, screen.height - card.height - GAP)),
  };
}
