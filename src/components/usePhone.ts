import { useSyncExternalStore } from 'react';

/** Phone layout (owner request): windows under 600px wide. Tablets keep the desktop layout. */
const PHONE = '(max-width: 599px)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia?.(PHONE);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

/** Whether the window is phone-sized; updates when it is resized or the phone is turned. */
export function usePhone() {
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(PHONE).matches ?? false, () => false);
}
