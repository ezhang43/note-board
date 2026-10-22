import { useEffect, useRef } from 'react';
import { appStore } from '../store/appStore';
import { CloseIcon } from './icons';
import { ExampleStrip, TemplateGrid } from './TemplatePicker';
import { useCoverBoard } from './textField';

/**
 * "Start a board" (owner request, job #162): opened by "New from a template…" in the Boards menu. A
 * dialog over the board (a bottom sheet on a phone); Escape, ×, or a press outside closes it.
 */
export function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const backdrop = useRef<HTMLDivElement>(null);
  useCoverBoard(backdrop);
  useEffect(() => {
    backdrop.current?.querySelector<HTMLElement>('.tpl-tile')?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="shortcuts-backdrop templates-backdrop" ref={backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="shortcuts-panel templates-panel" role="dialog" aria-modal="true" aria-label="Start a board">
        <header className="shortcuts-header">
          <h2>Start a board</h2>
          <button type="button" className="icon-button" aria-label="Close" title="Close (Escape)" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <p className="shortcuts-hint">Pick one to start from, then change anything.</p>
        <ExampleStrip after={onClose} />
        <h3 className="tpl-label">Templates</h3>
        <TemplateGrid after={onClose} />
        <div className="tpl-foot">
          <span>Or start with nothing.</span>
          <button
            type="button"
            className="tb-button"
            onClick={() => {
              appStore.newBoard();
              onClose();
            }}
          >
            Blank board
          </button>
        </div>
      </section>
    </div>
  );
}
