import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { appStore } from '../store/appStore';
import { isFar, wake, watchFar } from './farAway';

/** Tells the store how tall a block is drawn, so new blocks can be placed clear of it. */
export function useMeasuredHeight(id: string, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A far block isn't drawn: its size then is only the one it is kept at, never a new height.
    const update = () => !isFar(el) && appStore.setMeasuredHeight(id, el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, ref]);
}

/**
 * Lets a loose card or a container far outside the visible board go undrawn (farAway.ts). A change
 * to it (`data`: its card or container, a new object whenever it changes) or to a card inside it
 * draws it again first, so its new height is measured as usual and the blocks around make room.
 * simple: a height change from anything else (another board's name in a board card, a picture
 * loading in a far link card) is only measured once the block comes near, a screen before it shows,
 * when the blocks around make room as usual. Wake on those too if that ever leaves overlaps in view.
 */
export function useFarAway(ref: RefObject<HTMLElement | null>, data: unknown, watch = true) {
  const drawn = data != null; // the block draws nothing without its data: start watching once it does
  useEffect(() => {
    const el = ref.current;
    return el && watch ? watchFar(el) : undefined;
  }, [ref, watch, drawn]);
  useLayoutEffect(() => wake(ref.current), [ref, data]);
}
