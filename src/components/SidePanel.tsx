import { useEffect, type ReactNode } from 'react';
import { appStore } from '../store/appStore';
import { CloseIcon } from './icons';
import { isTextField, panelCovers } from './textField';

/**
 * A panel beside the board, in the right-hand spot Version history also uses (one at a
 * time); on a phone it fills the screen. It only frames what it holds: a title, ×, and Escape to close.
 */
export function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    // Escape meant for something else (leaving a text box, the shortcuts list or a "Delete …?"
    // question) leaves it open.
    const key = (e: KeyboardEvent) => {
      const { shortcutsOpen, confirm, deleteCompleted } = appStore.getState().ui;
      // A "Delete …?" question inside the panel (Google Calendar) answers its own Escape.
      // So does an event's card (job #108), wherever the keyboard is.
      const asking = (e.target instanceof Element && e.target.closest('[role="alertdialog"]')) || document.querySelector('.cal-card');
      if (e.key === 'Escape' && !isTextField(e.target) && !panelCovers() && !shortcutsOpen && !confirm && !deleteCompleted && !asking) onClose();
    };
    // Capture: seen before the page's own shortcuts close the list that Escape was for.
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  return (
    // tabIndex -1: a click on its heading or blank space keeps the keyboard in the panel instead
    // of on the page, so keys meant for it (Journal) never reach the board behind it.
    <aside className="history-panel side-panel" aria-label={title} tabIndex={-1}>
      <header className="history-head">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label={`Close ${title.toLowerCase()}`} title="Close (Esc)" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      {children}
    </aside>
  );
}
