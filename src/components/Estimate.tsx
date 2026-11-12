import { use, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyEvent } from 'react';
import { estimateLabel, MAX_ESTIMATE, readEstimate } from '../model/estimate';
import { findItem } from '../model/checklist';
import { appStore, useAppState, useViewOnly } from '../store/appStore';
import { TimerIcon } from './icons';
import { BoardReadOnly } from './textBox';

// Time estimates on notes and checklist items (job saved-estimate-doneon): a small chip (the estimate, or a faint clock
// on hover while there is none; on an item the clock is in its hover strip, job item-estimate-clock) opens a small box with quick choices, a Minutes box and Clear. The box is mounted once
// in the app, outside the board, like the comment thread, so presses and keys in it never reach the card or the row.

/** Quick choices, in minutes. */
const QUICK = [15, 30, 45, 60, 120];

type Target = { cardId: string; itemId: string | null };
/** Which estimate the box is open for (screen state only). */
let open: Target | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
function setOpen(next: Target | null) {
  open = next;
  listeners.forEach((l) => l());
}
const useOpen = () => useSyncExternalStore(subscribe, () => open);
const keyOf = (cardId: string, itemId: string | null) => `${cardId}:${itemId ?? ''}`;
/** The chip the box belongs to, as drawn now (a redraw can replace it; folded away, it is gone). */
const chipOf = (t: Target) => document.querySelector<HTMLElement>(`[data-estimate-for="${CSS.escape(keyOf(t.cardId, t.itemId))}"]`);

/** The chip on a note's header (`itemId` null), or on a checklist item: a faint clock in its hover strip, the estimate once set. */
export function EstimateChip({ cardId, itemId, estimate }: { cardId: string; itemId: string | null; estimate: number | undefined }) {
  const readOnly = use(BoardReadOnly);
  const label = estimate ? estimateLabel(estimate) : null;
  // A read-only board shows the estimate but offers no way to change it.
  if (readOnly) return label ? <span className="estimate-chip" title="Time estimate">{label}</span> : null;
  // No open state is read here: every item has this button, so that would be one listener per row. The box (Picker)
  // marks the button it is open for (aria-expanded) itself.
  return (
    <button
      type="button"
      className={label ? 'estimate-chip' : 'estimate-chip add'}
      aria-label={label ? `Time estimate: ${label}` : 'Add a time estimate'}
      title={label ? 'Time estimate' : 'Add a time estimate'}
      aria-haspopup="dialog"
      aria-expanded="false"
      data-estimate-for={keyOf(cardId, itemId)}
      onPointerDown={(e) => e.preventDefault()} // a press doesn't take the cursor out of a text box
      onClick={(e) => {
        if (open?.cardId === cardId && open.itemId === itemId) {
          // Pressed again to close: the keyboard stays on the button, not the page (the box had it).
          setOpen(null);
          e.currentTarget.focus({ preventScroll: true });
        } else setOpen({ cardId, itemId });
      }}
    >
      {label ?? <TimerIcon />}
    </button>
  );
}

/** The open box; mounted once in the app. */
export function EstimatePicker() {
  const which = useOpen();
  const readOnly = useViewOnly();
  const estimate = useAppState((s) => {
    if (!which) return undefined;
    const card = s.board.cards[which.cardId];
    if (which.itemId === null) return card?.kind === 'note' ? (card.estimate ?? null) : undefined;
    if (card?.kind !== 'todo') return undefined;
    const found = findItem(card.items, which.itemId);
    return found ? (found.item.estimate ?? null) : undefined;
  });
  // Gone (deleted, another board opened, now read-only): closed. A chip no longer drawn closes it too (Picker).
  const gone = Boolean(which && (estimate === undefined || readOnly));
  useEffect(() => {
    if (gone) setOpen(null);
  }, [gone]);
  if (!which || gone || estimate === undefined) return null;
  return <Picker key={`${which.cardId}:${which.itemId}`} target={which} estimate={estimate} />;
}

function Picker({ target, estimate }: { target: Target; estimate: number | null }) {
  const { cardId, itemId } = target;
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(estimate ? String(estimate) : '');
  const [bad, setBad] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  const close = (into?: HTMLElement | null) => {
    setOpen(null);
    (into ?? chipOf(target))?.focus({ preventScroll: true });
  };
  const set = (minutes: number | null) => {
    appStore.setEstimate(cardId, itemId, minutes);
    // A cleared item has no pill left (and no clock), so the keyboard goes back into the item's text.
    const text =
      minutes === null && itemId !== null
        ? document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"] [data-item-id="${CSS.escape(itemId)}"] [aria-label="Item text"]`)
        : null;
    close(text);
  };

  // The text follows an estimate changed behind the box (Ctrl+Z in it), so Enter never puts the undone one back.
  useEffect(() => {
    setText(estimate ? String(estimate) : '');
    setBad(false);
  }, [estimate]);

  // Under its chip (above it when there is no room below), kept on screen, following it as the board moves. Only while
  // open (this is mounted only then) and without redrawing the box unless the chip really moved or the box changed
  // size: a change to the board (which can draw the chip anew or fold it away, then it closes) or the view (a pan or a
  // zoom) only reads the chip's place. The box's own size is watched rather than read each time.
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    let size = { w: box.offsetWidth, h: box.offsetHeight };
    const measure = () => {
      const opener = chipOf(target);
      if (!opener) return setOpen(null);
      opener.setAttribute('aria-expanded', 'true'); // (again: a redraw can replace the button)
      const r = opener.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.right - size.w, window.innerWidth - size.w - 8));
      const below = r.bottom + 6;
      const top = below + size.h > window.innerHeight - 8 ? Math.max(8, r.top - 6 - size.h) : below;
      setPlace((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    measure();
    const resized = new ResizeObserver(() => {
      size = { w: box.offsetWidth, h: box.offsetHeight };
      measure();
    });
    resized.observe(box);
    // The store tells its subscribers before the page is redrawn, so the chip is looked for on the next frame (once, however many changes come).
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const unsubscribe = appStore.subscribe(later);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      resized.disconnect();
      window.removeEventListener('resize', measure);
      chipOf(target)?.setAttribute('aria-expanded', 'false');
    };
  }, [target]);

  // The keyboard starts in the Minutes box (not on a touch screen, where the phone's keyboard would cover the board).
  useEffect(() => {
    if (!matchMedia('(pointer: coarse)').matches) {
      input.current?.focus({ preventScroll: true });
      input.current?.select();
    }
    else ref.current?.focus({ preventScroll: true });
  }, []);

  // A press anywhere else closes it (not on its own chip, which closes it itself).
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !chipOf(target)?.contains(t)) setOpen(null);
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [target]);

  const keys = (e: ReactKeyEvent) => {
    // The board's keys never act behind it (Delete, arrows…); undo and redo always do (rule 7).
    const undo = (e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase());
    if (!undo) e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  const submit = () => {
    const minutes = readEstimate(Number(text));
    if (text.trim() === '' || minutes === undefined) return setBad(true);
    set(minutes);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Time estimate"
      tabIndex={-1}
      className="estimate-picker"
      style={place ?? { left: 0, top: 0, opacity: 0 }} // measured before it is drawn; still focusable meanwhile
      onKeyDown={keys}
      // Focus leaving the box (Tab, Shift+Tab, another window) closes it without a change.
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget)) setOpen(null);
      }}
    >
      <div className="estimate-quick">
        {QUICK.map((m) => (
          <button key={m} type="button" className={m === estimate ? 'estimate-option current' : 'estimate-option'} aria-pressed={m === estimate} onClick={() => set(m)}>
            {estimateLabel(m)}
          </button>
        ))}
      </div>
      <form
        className="estimate-own"
        noValidate // our own check and hint, not the browser's pop-up
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={input}
          type="number"
          inputMode="numeric"
          enterKeyHint="done"
          min={1}
          max={MAX_ESTIMATE}
          step={1}
          aria-label="Minutes"
          aria-invalid={bad || undefined}
          aria-describedby={bad ? 'estimate-hint' : undefined}
          placeholder="Minutes"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setBad(false);
          }}
        />
        <button type="submit" className="estimate-option">
          Set
        </button>
        {estimate !== null && (
          <button type="button" className="estimate-option estimate-clear" onClick={() => set(null)}>
            Clear
          </button>
        )}
      </form>
      {bad && (
        <p id="estimate-hint" className="estimate-hint">
          Whole minutes, from 1 to {MAX_ESTIMATE}.
        </p>
      )}
    </div>
  );
}
