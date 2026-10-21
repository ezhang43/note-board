import { useEffect, type ReactNode } from 'react';
import { CloseIcon } from './icons';
import { escapeIsForPanel } from './textField';

/**
 * A panel beside the board, in the right-hand spot Version history also uses (one at a
 * time); on a phone it fills the screen. It only frames what it holds: a title, ×, and Escape to close.
 */
export function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    // Escape meant for something else (see escapeIsForPanel) leaves it open.
    const key = (e: KeyboardEvent) => escapeIsForPanel(e) && onClose();
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
