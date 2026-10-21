import { useCallback, useSyncExternalStore } from 'react';

/** Phone layout (owner request): windows under 600px wide. Tablets keep the desktop layout. */
const PHONE = '(max-width: 599px)';

/** Whether a CSS media query matches right now (for event handlers; components use useMedia). */
const matches = (query: string) => window.matchMedia?.(query).matches ?? false;

/** Whether the window is phone-sized right now (for event handlers; components use usePhone). */
export const isPhone = () => matches(PHONE);

/** Whether a media query matches; updates when the window is resized or the phone is turned. */
export function useMedia(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => matches(query), () => false);
}

/** Whether the window is phone-sized; updates when it is resized or the phone is turned. */
export const usePhone = () => useMedia(PHONE);
