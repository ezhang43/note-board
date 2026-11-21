// Blocks far outside the visible part of the board aren't drawn (performance): one watcher per board
// area marks a loose card or container more than a screen away with `data-far`, and styles.css lets
// the browser skip drawing its inside (`content-visibility: auto`) at the size it last had. Its text
// stays in the page, so the board's search, the browser's own find, screen readers and the keyboard
// still reach it. Nothing about the board changes: the block keeps the size it was last drawn at
// (useMeasure.ts never records a height while it is marked), and anything that needs a far block
// drawn (a search jump, a picture of the board, a change to it or a card in it) wakes it first.
// Each change redraws the board, so while it pans (job perf-wake-batches) blocks coming within two
// screens are woken in batches, and blocks going more than two screens away are put away only once
// the pan stops. A block that comes within one screen before its batch is woken at once, as before.

const FAR = 'data-far';
/** While the board pans, blocks coming within two screens are drawn in batches, at most one every this many ms. */
const WAKE_EVERY = 100;
/** Blocks gone more than two screens away are put away once no block has come or gone for this long (the pan has stopped)... */
const HIDE_AFTER = 300;
/** ...or after this long at most, so a long slow pan still puts away what it passed. */
const HIDE_AT_MOST = 1000;

type Watch = {
  /** Two screens all round: a block coming in is woken with the next batch; one going out is put away once things settle. */
  ahead: IntersectionObserver;
  /** One screen all round: a block coming in is woken at once (a pan faster than the batches). */
  near: IntersectionObserver;
  toWake: Set<Element>;
  toHide: Set<Element>;
  lastWake: number;
  wakeTimer?: ReturnType<typeof setTimeout>;
  hideTimer?: ReturnType<typeof setTimeout>;
  /** When the oldest block waiting to be put away started waiting. */
  hideSince: number;
};
const watchers = new WeakMap<Element, Watch>();
/** When each block was last woken: a look the watcher took before that is out of date. */
const woken = new WeakMap<Element, number>();
/** Blocks just started being watched (or woken): the first look puts a far one away at once, as on opening a board. */
const fresh = new WeakSet<Element>();

function wakeBatch(w: Watch) {
  w.wakeTimer = undefined;
  w.lastWake = performance.now();
  for (const el of w.toWake) el.removeAttribute(FAR);
  w.toWake.clear();
}

/** Marks these blocks far. Every size is read before anything is marked, so the page is laid out once, not once per card. */
const putAway = (els: Iterable<Element>) =>
  [...els].filter((el) => el.isConnected && !el.hasAttribute(FAR)).map((el) => sizeOf(el as HTMLElement)).forEach(markFar);

/** Only the newest look at each block counts (a quick pan there and back gives two), and none taken before it was last woken. */
function newest(entries: IntersectionObserverEntry[]) {
  const latest = new Map<Element, IntersectionObserverEntry>();
  for (const e of entries) if (e.time >= (woken.get(e.target) ?? 0)) latest.set(e.target, e);
  return latest.values();
}

function watcherFor(root: Element): Watch {
  const known = watchers.get(root);
  if (known) return known;
  const settleLater = () => {
    const now = performance.now();
    if (!w.hideTimer) w.hideSince = now;
    clearTimeout(w.hideTimer);
    w.hideTimer = setTimeout(
      () => {
        w.hideTimer = undefined;
        putAway(w.toHide);
        w.toHide.clear();
      },
      Math.max(0, Math.min(HIDE_AFTER, w.hideSince + HIDE_AT_MOST - now)),
    );
  };
  const w: Watch = {
    ahead: new IntersectionObserver(
      (entries) => {
        const now: Element[] = [];
        for (const e of newest(entries)) {
          const first = fresh.has(e.target);
          fresh.delete(e.target);
          if (e.isIntersecting) {
            w.toWake.add(e.target);
            w.toHide.delete(e.target);
          } else {
            w.toWake.delete(e.target);
            if (first) now.push(e.target);
            else w.toHide.add(e.target);
          }
        }
        putAway(now);
        if (w.toWake.size && !w.wakeTimer) w.wakeTimer = setTimeout(() => wakeBatch(w), Math.max(0, w.lastWake + WAKE_EVERY - performance.now()));
        if (w.toHide.size) settleLater();
      },
      { root, rootMargin: '200%' },
    ),
    near: new IntersectionObserver(
      (entries) => {
        // A screen's worth all round counts as near, so panning never shows a card before it is drawn.
        for (const e of newest(entries))
          if (e.isIntersecting) {
            e.target.removeAttribute(FAR);
            w.toWake.delete(e.target);
            w.toHide.delete(e.target);
          }
      },
      { root, rootMargin: '100%' },
    ),
    toWake: new Set(),
    toHide: new Set(),
    lastWake: -Infinity,
    hideSince: 0,
  };
  watchers.set(root, w);
  return w;
}

/**
 * The size of the inside of `el` (without its padding and border), as drawn now: the size kept while
 * it is far is that of its inside, which the browser then puts the padding and border around.
 */
function sizeOf(el: HTMLElement) {
  const s = getComputedStyle(el);
  const px = (...v: string[]) => v.reduce((sum, k) => sum + (parseFloat(s.getPropertyValue(k)) || 0), 0);
  const w = el.offsetWidth && el.offsetWidth - px('padding-left', 'padding-right', 'border-left-width', 'border-right-width');
  const h = el.offsetHeight && el.offsetHeight - px('padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width');
  return { el, w, h };
}

/** Marks a card as far away, keeping the size it is drawn at now (read before it stops being drawn). */
function markFar({ el, w, h }: { el: HTMLElement; w: number; h: number }) {
  // Not drawn at all (hidden, not laid out yet, or gone from the page): nothing to keep, leave it alone.
  if (!h || !w) return;
  el.style.setProperty('--far-w', `${w}px`);
  el.style.setProperty('--far-h', `${h}px`);
  el.setAttribute(FAR, '');
}

const observe = (w: Watch, el: Element) => {
  fresh.add(el);
  w.ahead.observe(el);
  w.near.observe(el);
};
const unobserve = (w: Watch, el: Element) => {
  w.ahead.unobserve(el);
  w.near.unobserve(el);
  w.toWake.delete(el);
  w.toHide.delete(el);
};

/** Starts watching a loose card or a container on the board (not a card outside it, such as the Checklist panel's). Returns the stop. */
export function watchFar(el: HTMLElement): () => void {
  const root = el.closest('.canvas');
  if (!root || typeof IntersectionObserver === 'undefined') return () => {};
  const w = watcherFor(root);
  observe(w, el);
  return () => {
    unobserve(w, el);
    el.removeAttribute(FAR);
  };
}

/** Whether `el` is a far block or inside one (not drawn now). */
export const isFar = (el: Element) => !!el.closest(`[${FAR}]`);

/**
 * Draws a far block (or the far block `el` is in) again now; the watcher looks again at the next frame
 * and marks it far once more if it still is, at its new size.
 */
export function wake(el: Element | null | undefined) {
  const card = el?.closest<HTMLElement>(`[${FAR}]`);
  if (!card) return;
  card.removeAttribute(FAR);
  woken.set(card, performance.now());
  const w = watchers.get(card.closest('.canvas')!);
  if (w) {
    // A fresh look, as if just added.
    unobserve(w, card);
    observe(w, card);
  }
}

/** Draws every far block in `root` again (a picture of the whole board needs them all; a new text size changes every height). */
export function wakeAll(root: ParentNode) {
  root.querySelectorAll(`[${FAR}]`).forEach(wake);
}
