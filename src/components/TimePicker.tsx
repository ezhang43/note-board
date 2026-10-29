import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { nearestTimeOption, parseTypedTime, timeText, type TimeOption } from '../model/calendar';

// A time box like Google Calendar's (job 219, owner request 2026-10-29): a text box showing "2:00 PM"
// that opens a list of times (every 15 minutes) when clicked or focused, and also takes a typed time.
// A combobox with a listbox, so the keyboard and screen readers work: ↑ / ↓ move, Enter picks, Escape
// closes the list. The list is drawn on the page itself, not inside the card, so the card's edge never
// cuts it off.

const LIST_HEIGHT = 240;
const LIST_WIDTH = 220;
const EDGE = 8;

// The one open list, so the form's Escape (which closes the whole form) can close just this first.
let closeOpenList: (() => void) | null = null;

/** Closes the open time list, if there is one; true when it did, so that Escape is used up. */
export function closeTimeList(): boolean {
  if (!closeOpenList) return false;
  closeOpenList();
  return true;
}

type Props = { label: string; value: string; options: TimeOption[]; onChange: (hhmm: string) => void };

export function TimePicker({ label, value, options, onChange }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const centre = useRef(false);
  // Whether ↑ / ↓ chose a time since the list opened: only then does Enter pick the marked one.
  const moved = useRef(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<CSSProperties>({});

  // Where the list goes: under the box, or above it when there is more room above.
  const measure = (): CSSProperties => {
    const box = input.current!.getBoundingClientRect();
    const view = window.visualViewport;
    const height = view?.height ?? window.innerHeight;
    const below = height - box.bottom - EDGE;
    const above = box.top - EDGE;
    const under = below >= Math.min(LIST_HEIGHT, above);
    const width = Math.max(box.width, LIST_WIDTH);
    return {
      left: Math.max(EDGE, Math.min(box.left, window.innerWidth - EDGE - width)),
      width,
      maxHeight: Math.min(LIST_HEIGHT, under ? below : above),
      ...(under ? { top: box.bottom + 4 } : { bottom: window.innerHeight - box.top + 4, transformOrigin: 'bottom left' }),
    };
  };
  const show = () => {
    setPlace(measure());
    centre.current = true;
    moved.current = false;
    setActive(nearestTimeOption(options, value));
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
    setTyped(null);
  };
  // Takes the time typed in, if it can be read; a time that can't goes back to the previous value.
  const take = () => {
    if (typed === null) return;
    const hhmm = parseTypedTime(typed);
    if (hhmm && hhmm !== value) onChange(hhmm);
    setTyped(null);
  };
  const pick = (o: TimeOption) => {
    if (o.value !== value) onChange(o.value);
    hide();
  };

  useEffect(() => {
    if (!open) return;
    closeOpenList = hide;
    return () => {
      if (closeOpenList === hide) closeOpenList = null;
    };
  });
  // The list follows its box when the window changes size, as when a phone's keyboard comes up, or the card scrolls.
  useEffect(() => {
    if (!open) return;
    const follow = () => setPlace(measure());
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    window.visualViewport?.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
      window.visualViewport?.removeEventListener('resize', follow);
    };
  }, [open]);
  // The marked time in view: in the middle when the list opens, then only as far as the keys need.
  useLayoutEffect(() => {
    const row = list.current?.children[active];
    if (!(row instanceof HTMLElement) || !list.current) return;
    const box = list.current;
    if (centre.current) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2;
    else if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
    centre.current = false;
  }, [open, active]);

  const move = (step: number) => {
    moved.current = true;
    setTyped(null);
    setActive((i) => Math.min(Math.max(i + step, 0), options.length - 1));
  };

  return (
    <>
      <input
        ref={input}
        type="text"
        role="combobox"
        className="time-box"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={typed ?? timeText(value)}
        onChange={(e) => {
          const text = e.currentTarget.value;
          setTyped(text);
          if (!open) show();
          const hhmm = parseTypedTime(text);
          if (hhmm) setActive(nearestTimeOption(options, hhmm));
        }}
        onFocus={(e) => {
          e.currentTarget.select();
          show();
        }}
        onClick={() => !open && show()}
        onBlur={() => {
          take();
          hide();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (open) move(e.key === 'ArrowDown' ? 1 : -1);
            else show();
          } else if (e.key === 'Enter' && (typed !== null || (open && moved.current))) {
            // Enter takes the time typed, or the one chosen with the keys, and closes the list; it doesn't also save the form.
            // With nothing typed or chosen it saves, as in any text box, and never rounds an odd time to the list.
            e.preventDefault();
            if (typed !== null) take();
            else if (options[active]) pick(options[active]);
            setOpen(false);
          }
        }}
      />
      {open &&
        options.length > 0 &&
        createPortal(
          // The box keeps the keyboard while the list is used with the mouse or a finger.
          <div ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="time-list" style={place} onMouseDown={(e) => e.preventDefault()}>
            {options.map((o, i) => (
              <div key={o.value} id={`${id}-${i}`} role="option" aria-selected={i === active} className={`time-option${o.value === value ? ' current' : ''}`} onClick={() => pick(o)}>
                {o.text}
                {o.hint && <span className="time-hint"> ({o.hint})</span>}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
