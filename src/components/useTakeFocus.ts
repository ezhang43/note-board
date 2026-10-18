import { useEffect, type RefObject } from 'react';
import { appStore, useAppState } from '../store/appStore';

/**
 * Puts the cursor in `ref`'s field when the store asks for block `id` to take it (a block just
 * added). With `selectAll`, its text is selected so typing replaces it (a new column's title); otherwise the cursor goes at the end of the text (the Journal note).
 */
export function useTakeFocus(id: string, ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, selectAll = false) {
  const wanted = useAppState((s) => s.ui.focusBlock === id);
  useEffect(() => {
    const el = ref.current;
    if (!wanted || !el) return;
    el.focus({ preventScroll: true });
    if (selectAll) el.select();
    else el.setSelectionRange(el.value.length, el.value.length); // typing goes after any text already there
    appStore.focusTaken(id);
  }, [wanted, id, ref, selectAll]);
}
