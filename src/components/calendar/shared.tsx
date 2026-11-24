import { useLayoutEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { greenLook, type CalEvent } from '../../model/calendar';
import { cardPosition } from '../../model/eventCard';
import { useCalendar } from '../../store/calendar';
import { usePhone } from '../usePhone';

/** Starts a drag from an event's chip (see `eventDrag.ts`); given only for the person's own events. */
export type OnDrag = (down: ReactPointerEvent<HTMLElement>, event: CalEvent) => void;

/** Meetings not declined are green, and one still to answer also dashed; the person's own reminders stay blue (owner requests, 2026-11-21 and 2026-11-22; see greenLook). */
export const answerLook = (e: CalEvent) => {
  const look = greenLook(e);
  return look === 'green' ? ' green' : look === 'unsure' ? ' green unsure' : '';
};

/** What a screen reader hears of the same: the dashed edge's "not yet accepted", and "declined". */
export const answerSaid = (e: CalEvent) => (greenLook(e) === 'unsure' ? ', not yet accepted' : e.answer === 'declined' ? ', declined' : '');

/** Why Google couldn't be reached, and the button to try again (or to Connect); straight from the click, so Google's window isn't blocked. */
export function Note({ note, needsAccess, retry }: { note: string; needsAccess: boolean; retry: () => void }) {
  return (
    <div className="cal-note" role="status">
      <p className="history-note">{note}</p>
      <button type="button" className={`tb-button${needsAccess ? ' cal-connect' : ''}`} onClick={retry}>
        {needsAccess ? 'Connect Google Calendar' : 'Try again'}
      </button>
    </div>
  );
}

/**
 * Where a card or overlay sits (job #108, and the form's overlay, job 211): just left of the panel,
 * level with the button it opened from, as `cardPosition` works out; `undefined` on a phone, where
 * its CSS makes it a sheet from the bottom. Measured again when something in `changes` makes it
 * taller, so it stays on screen, and when the panel or the window is resized, so it keeps to the panel's edge.
 */
export function useCardPlace(ref: RefObject<HTMLElement | null>, opener: HTMLElement, changes: unknown[]) {
  const phone = usePhone();
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const s = useCalendar();
  const panelWidth = s.widths[s.view];
  const expanded = s.expanded;
  // simple: level with where the opener was when it opened; it doesn't follow the list if the panel scrolls.
  const at = useMemo(() => opener.getBoundingClientRect().top, [opener]);
  useLayoutEffect(() => {
    const measure = () => {
      const card = ref.current;
      const panel = opener.closest('.side-panel');
      if (phone || !card || !panel || !opener.isConnected) return;
      const size = { width: card.offsetWidth, height: card.offsetHeight };
      setPlace(cardPosition({ top: at }, panel.getBoundingClientRect(), size, { width: window.innerWidth, height: window.innerHeight }));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ref, phone, opener, at, panelWidth, expanded, ...changes]);
  return phone || !place ? undefined : place;
}
