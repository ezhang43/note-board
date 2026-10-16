import { useSyncExternalStore } from 'react';

// Send feedback (owner request, job #69). The published site (session.ts: Firestore, with the
// person's email) and a demo person (demo.ts: the dev server) say how; running locally without
// one there is no account, so the File menu doesn't offer it.

type Status = '' | 'sending' | 'sent' | 'failed';

let sender: ((text: string) => Promise<unknown>) | null = null;
let panelOpen = false;
// Kept here, not in the panel, so the panel can be closed while a note is on its way (Firestore
// waits for the server, which can take long on a poor connection) without it being sent twice.
let status: Status = '';
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export const feedback = {
  /** Sends a note; rejects if it wasn't sent. Null where there is no account. */
  sender: () => sender,
  setSender(fn: typeof sender) {
    sender = fn;
    changed();
  },
  /** What was typed and not sent yet, so closing the box by mistake loses nothing. */
  draft: '',
  status: () => status,
  async send(text: string) {
    if (!sender || status === 'sending') return;
    status = 'sending';
    changed();
    try {
      await sender(text);
      feedback.draft = '';
      status = 'sent';
    } catch {
      // The draft stays, to try again.
      status = 'failed';
    }
    changed();
  },
  isOpen: () => panelOpen,
  open() {
    panelOpen = true;
    if (status !== 'sending') status = '';
    changed();
  },
  close() {
    panelOpen = false;
    changed();
  },
  /** Another account signed in (or none): nothing of the last person's stays on screen. */
  reset() {
    feedback.draft = '';
    feedback.close();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useFeedbackSender = () => useSyncExternalStore(feedback.subscribe, feedback.sender);
export const useFeedbackPanel = () => useSyncExternalStore(feedback.subscribe, feedback.isOpen);
export const useFeedbackStatus = () => useSyncExternalStore(feedback.subscribe, feedback.status);
