import { useEffect, type ReactNode } from 'react';
import { CloseIcon } from './icons';

/**
 * A panel beside the board, in the right-hand spot Version history and Due also use (one at a
 * time); on a phone it fills the screen. It only frames what it holds: a title, ×, and Escape to close.
 */
export function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
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
