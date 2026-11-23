import type { ReactNode } from 'react';
import { useEscapeLayer } from './escapeLayer';
import { CloseIcon } from './icons';
import { isTextField } from './textField';

/**
 * A panel beside the board, in the right-hand spot Version history also uses (one at a
 * time); on a phone it fills the screen. It only frames what it holds: a title, ×, and Escape to close.
 * `actions` are icon buttons in the header, just left of the × (the Journal's +).
 */
export function SidePanel({ title, onClose, actions, children }: { title: string; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  useEscapeLayer(
    true,
    (e) => {
      if (isTextField(e.target)) return false;
      // Escape pressed inside the Checklist panel on the left belongs to that panel.
      if (e.target instanceof Element && e.target.closest('.checklist-panel')) return false;
      onClose();
      return true;
    },
    'panel',
  );

  return (
    // tabIndex -1: a click on its heading or blank space keeps the keyboard in the panel instead
    // of on the page, so keys meant for it (Journal) never reach the board behind it.
    <aside className="history-panel side-panel" aria-label={title} tabIndex={-1}>
      <header className="history-head">
        <h2>{title}</h2>
        {actions}
        <button type="button" className="icon-button" aria-label={`Close ${title.toLowerCase()}`} title="Close (Esc)" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      {children}
    </aside>
  );
}
