// Small bridges to the browser, each safe where there is none (as in unit tests).

/** Runs a function soon, after the current work (and, in the browser, after drawing). */
export type Schedule = (fn: () => void) => void;
export const later: Schedule = (fn) => setTimeout(fn, 0);

/**
 * Where the cursor is being typed: null when it isn't in a text box (or there is no browser, as in unit tests);
 * else the checklist item whose text box has it (empty ids for any other text box).
 */
// simple: the same test as the components' isTextField, without `instanceof`, which the store can't import.
export function typingAt(): { cardId: string; itemId: string } | null {
  const el = globalThis.document?.activeElement as HTMLElement | null | undefined;
  if (!el || !(el.isContentEditable || el.matches('textarea, input:not([type="checkbox"])'))) return null;
  const row = el.closest<HTMLElement>('[data-item-id]');
  return { cardId: row?.closest<HTMLElement>('[data-card-id]')?.dataset.cardId ?? '', itemId: row?.dataset.itemId ?? '' };
}

/** This device's localStorage, or null where it is blocked or missing (as in unit tests). */
export function deviceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Puts text on the computer's clipboard, so it can be pasted into other apps (does nothing without one). Says whether it got there. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard access: copying within the board still works.
    return false;
  }
}

/** Whether the computer is set to dark mode (false where there is no browser, as in unit tests). */
export function prefersDark(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}

/**
 * A short, soft two-note chime, made with Web Audio (no sound file). Does nothing where the
 * browser can't play sound.
 */
// simple: a browser may keep sound off until the page has been clicked; after a reload the
// first chime can then be silent (the round still moves on). A notification still shows.
export function chime() {
  try {
    const audio = new AudioContext();
    void audio.resume().catch(() => {});
    const t = audio.currentTime;
    [660, 880].forEach((freq, i) => {
      const at = t + i * 0.18;
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.type = 'sine';
      tone.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
      tone.connect(gain).connect(audio.destination);
      tone.start(at);
      tone.stop(at + 1.25);
    });
    setTimeout(() => void audio.close().catch(() => {}), 1600);
  } catch {
    // No sound here.
  }
}

/** Asks once whether the page may show notifications (the browser remembers the answer). */
export function askToNotify() {
  try {
    if (globalThis.Notification?.permission === 'default') void Notification.requestPermission().catch(() => {});
  } catch {
    // No notifications here.
  }
}

/** Shows a notification while the tab is behind another, if the person allowed them. */
// simple: phones that only allow notifications from a service worker show none (the chime still plays).
export function notifyIfHidden(title: string, body: string) {
  try {
    if (document.hidden && globalThis.Notification?.permission === 'granted') new Notification(title, { body, icon: `${import.meta.env.BASE_URL}busyants-192.png` });
  } catch {
    // Not allowed here.
  }
}
