import { useEffect, type RefObject } from 'react';
import { appStore } from '../store/appStore';

/** Tells the store how tall a block is drawn, so new blocks can be placed clear of it. */
export function useMeasuredHeight(id: string, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => appStore.setMeasuredHeight(id, el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, ref]);
}
