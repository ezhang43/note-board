import { useEffect, useRef } from 'react';
import { dragDraft, type CalEvent, type DayKey } from '../../model/calendar';
import { calendar } from '../../store/calendar';
import { panelCovers } from '../textField';
import { Question } from './Question';
import { useCardPlace } from './shared';

/**
 * The guest question for a drag-and-drop move (owner request, 2026-11-11), a small card by the chip that was
 * dragged; the move itself waits for the answer. Escape, or a press anywhere else, drops it and the event stays.
 */
export function MoveAsk({ event, from, to, opener, onClose }: { event: CalEvent; from: DayKey; to: DayKey; opener: HTMLElement; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const draft = dragDraft(event, from, to)!;
  const place = useCardPlace(ref, opener, []);
  const cancel = () => {
    onClose();
    if (opener.isConnected) opener.focus();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || panelCovers()) return;
      e.stopImmediatePropagation();
      cancel();
    };
    const down = (e: PointerEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) onClose();
    };
    window.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', down, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', down, true);
    };
  });
  return (
    <div ref={ref} className="cal-card" style={place}>
      <Question
        event={event}
        draft={draft}
        ask={{ action: 'save', step: 'emails' }}
        next={(_action, _d, choice) => {
          onClose();
          void calendar.move(event.id, from, to, choice);
        }}
        onCancel={cancel}
      />
    </div>
  );
}
