// Blocks far outside the visible part of the board aren't drawn (performance): one watcher per board
// area marks a loose card or container more than a screen away with `data-far`, and styles.css lets
// the browser skip drawing its inside (`content-visibility: auto`) at the size it last had. Its text
// stays in the page, so the board's search, the browser's own find, screen readers and the keyboard
// still reach it. Nothing about the board changes: the block keeps the size it was last drawn at
// (useMeasure.ts never records a height while it is marked), and anything that needs a far block
// drawn (a search jump, a picture of the board, a change to it or a card in it) wakes it first.

const FAR = 'data-far';
const watchers = new WeakMap<Element, IntersectionObserver>();
/** When each block was last woken: a look the watcher took before that is out of date. */
const woken = new WeakMap<Element, number>();

function watcherFor(root: Element): IntersectionObserver {
  let io = watchers.get(root);
  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        // Only the newest look at each block counts (a quick pan there and back gives two), and none
        // taken before it was last woken.
        const latest = new Map<Element, IntersectionObserverEntry>();
        for (const e of entries) if (e.time >= (woken.get(e.target) ?? 0)) latest.set(e.target, e);
        const now = [...latest.values()];
        // Every size is read before anything is marked, so the page is laid out once, not once per card.
        const going = now.filter((e) => !e.isIntersecting && !e.target.hasAttribute(FAR)).map((e) => sizeOf(e.target as HTMLElement));
        for (const e of now) if (e.isIntersecting) e.target.removeAttribute(FAR);
        going.forEach(markFar);
      },
      // A screen's worth all round counts as near, so panning never shows a card before it is drawn.
      { root, rootMargin: '100%' },
    );
    watchers.set(root, io);
  }
  return io;
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
  // Not drawn at all (hidden, or not laid out yet): nothing to keep, leave it alone.
  if (!h || !w) return;
  el.style.setProperty('--far-w', `${w}px`);
  el.style.setProperty('--far-h', `${h}px`);
  el.setAttribute(FAR, '');
}

/** Starts watching a loose card or a container on the board (not a card outside it, such as the Checklist panel's). Returns the stop. */
export function watchFar(el: HTMLElement): () => void {
  const root = el.closest('.canvas');
  if (!root || typeof IntersectionObserver === 'undefined') return () => {};
  const io = watcherFor(root);
  io.observe(el);
  return () => {
    io.unobserve(el);
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
  const io = watchers.get(card.closest('.canvas')!);
  if (io) {
    io.unobserve(card);
    io.observe(card); // a fresh look, as if just added
  }
}

/** Draws every far block in `root` again (a picture of the whole board needs them all; a new text size changes every height). */
export function wakeAll(root: ParentNode) {
  root.querySelectorAll(`[${FAR}]`).forEach(wake);
}
