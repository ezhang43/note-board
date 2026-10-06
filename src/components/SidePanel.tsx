import { useEffect, type ReactNode } from 'react';
import { appStore } from '../store/appStore';
import { CloseIcon } from './icons';
import { isTextField } from './textField';

/**
 * A panel beside the board, in the right-hand spot Version history and Due also use (one at a
 * time); on a phone it fills the screen. It only frames what it holds: a title, ×, and Escape to close.
 */
export function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    // Escape meant for something else (leaving a text box, closing a date picker or the shortcuts list) leaves it open.
    const key = (e: KeyboardEvent) => {
      const { dueFor, shortcutsOpen } = appStore.getState().ui;
      if (e.key === 'Escape' && !isTextField(e.target) && !dueFor && !shortcutsOpen) onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  return (
    <aside className="history-panel side-panel" aria-label={title}>
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
