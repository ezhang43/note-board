import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TOUR_KEY, placeCard, tourPending } from '../model/tour';
import { CloseIcon } from './icons';

// The welcome tour (owner request, 2026-10-16): a spotlight on one control at a time, with a small
// card beside it. It starts by itself the first time the board is shown on a device, can be skipped
// at any point, and is remembered per device like the dark-mode choice. It never touches board data.

type Step = { title: string; text: string; target: string; phoneTarget?: string; phoneText?: string };

/** `target` is the desktop control; `phoneTarget` its phone-bar equivalent (none: skipped on a phone). */
const STEPS: Step[] = [
  {
    title: 'Add a note or a checklist',
    text: 'Note gives you a blank card to jot down anything. Checklist makes a list you can tick off. You can also drag one from here onto the board.',
    target: '.add-note, .add-todo',
    phoneTarget: '.phone-add-button',
    phoneText: 'Tap + to add a note, a checklist or a column.',
  },
  {
    title: 'Move cards, fill columns',
    text: 'Drag a card to move it. A column is a container that holds your notes and checklists together.',
    target: '.add-column',
  },
  {
    title: 'Share a board',
    text: 'Share lets other people see and edit this board with you, using a link.',
    target: 'header.toolbar button[aria-label="Share"]',
  },
  {
    title: 'Your boards',
    text: 'The Boards menu lists all your boards. Start a new one, or open one from here.',
    target: 'header.toolbar button[aria-label="Boards"]',
    phoneTarget: 'header.toolbar button[aria-label="Boards"]',
  },
  {
    // Phone only (empty desktop target): ⋯ holds Share there, and stays last so the replay hint comes at the end.
    title: 'More',
    text: '',
    target: '',
    phoneTarget: '.phone-bar [aria-label="More"]',
    phoneText: 'Tap ⋯ for everything else, like Share, Search and Version history. You can show this tour again there.',
  },
  {
    title: 'Keyboard shortcuts',
    text: 'Press ? any time to see every keyboard shortcut.',
    target: '.help-button[aria-label="Keyboard shortcuts"]',
  },
];

const TOUR_EVENT = 'note-board:tour';
const PAD = 6;
let autoStarted = false;

/** Start the tour from its first step (the "Show the tour again" links). */
export function startTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

type Rect = { x: number; y: number; w: number; h: number };

/** The box around every visible control matching `selector`, or null when none is showing. */
function targetRect(selector: string): Rect | null {
  let box: { l: number; t: number; r: number; b: number } | null = null;
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    box = box ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.right), b: Math.max(box.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }
  return box && { x: box.l - PAD, y: box.t - PAD, w: box.r - box.l + 2 * PAD, h: box.b - box.t + 2 * PAD };
}

const isPhone = () => window.matchMedia?.('(max-width: 599px)').matches ?? false;

/** Remember on this device that the tour is finished (a blocked store just means it may show again later). */
function remember() {
  try {
    localStorage.setItem(TOUR_KEY, '1');
  } catch {
    // The tour has already started once this session (autoStarted), so it won't nag again until a reload.
  }
}

export function Tour() {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState<{ avail: number[]; rects: (Rect | null)[] }>({ avail: [], rects: [] });
  const [size, setSize] = useState({ w: 320, h: 160 });
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);

  const begin = useCallback(() => {
    returnTo.current = document.activeElement;
    setAt(0);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    remember();
    if (returnTo.current instanceof HTMLElement) returnTo.current.focus();
  }, []);

  // Starts by itself once per device, and again when asked.
  useEffect(() => {
    if (!autoStarted) {
      autoStarted = true;
      let pending = false;
      try {
        pending = tourPending(() => localStorage.getItem(TOUR_KEY));
      } catch {
        // storage blocked: no tour
      }
      if (pending) begin();
    }
    window.addEventListener(TOUR_EVENT, begin);
    return () => window.removeEventListener(TOUR_EVENT, begin);
  }, [begin]);

  // Which steps have a control on screen right now, and where it is. Redone on resize and whenever
  // the page changes (fonts arriving, the Share button appearing), so the spotlight follows its control.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const phone = isPhone();
        const rects = STEPS.map((s) => (phone ? (s.phoneTarget ? targetRect(s.phoneTarget) : null) : s.target ? targetRect(s.target) : null));
        const avail = rects.flatMap((r, i) => (r ? [i] : []));
        setShown((old) => (JSON.stringify(old) === JSON.stringify({ avail, rects }) ? old : { avail, rects }));
      });
    };
    measure();
    window.addEventListener('resize', measure);
    const watcher = new MutationObserver(measure);
    watcher.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      watcher.disconnect();
    };
  }, [open]);

  const { avail, rects } = shown;
  const ready = open && avail.length > 0;
  // A step whose control is missing is skipped: move to the next one showing, or end.
  useEffect(() => {
    if (!ready || avail.includes(at)) return;
    const after = avail.find((i) => i > at);
    if (after !== undefined) setAt(after);
    else setAt(avail[avail.length - 1]);
  }, [ready, avail, at]);

  // Escape ends the tour and goes no further, so it doesn't also clear the board's selection.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [open, close]);

  const rect = rects[at];
  useLayoutEffect(() => {
    const b = card.current?.getBoundingClientRect();
    if (b && (Math.round(b.width) !== size.w || Math.round(b.height) !== size.h)) setSize({ w: Math.round(b.width), h: Math.round(b.height) });
  });
  useEffect(() => {
    if (ready && rect) next.current?.focus();
  }, [ready, at, !!rect]);

  if (!ready || !rect || !avail.includes(at)) return null;
  const step = STEPS[at];
  const position = avail.indexOf(at);
  const last = position === avail.length - 1;
  const text = isPhone() && step.phoneText ? step.phoneText : step.text;
  const place = placeCard(rect, size, { w: window.innerWidth, h: window.innerHeight });

  const go = (to: number) => setAt(avail[to]);
  // Tab stays inside the card while the tour is up.
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const from = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.shiftKey ? (from <= 0 ? buttons.length - 1 : from - 1) : from === buttons.length - 1 ? 0 : from + 1;
    e.preventDefault();
    buttons[to].focus();
  };

  return (
    <>
      {/* Catches clicks on the dimmed board so nothing under it reacts. */}
      <div className="tour-shield" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} />
      <div className="tour-spot" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} aria-hidden="true" />
      <div
        ref={card}
        className="tour-card"
        role="dialog"
        aria-labelledby="tour-step tour-title"
        aria-describedby="tour-text"
        style={{ left: place.left, top: place.top }}
        onKeyDown={trap}
      >
        <div className="tour-head">
          <span id="tour-step" className="tour-step">
            Step {position + 1} of {avail.length}
          </span>
          <button type="button" className="icon-button" aria-label="Close tour" title="Close (Escape)" onClick={close}>
            <CloseIcon />
          </button>
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-text">{text}</p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={close}>
            Skip tour
          </button>
          <span className="tour-spacer" />
          <button type="button" className="tour-back" disabled={position === 0} onClick={() => go(position - 1)}>
            Back
          </button>
          <button ref={next} type="button" className="tour-next" onClick={() => (last ? close() : go(position + 1))}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
