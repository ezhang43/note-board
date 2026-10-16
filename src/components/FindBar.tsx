import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findMatches, type Match } from '../model/search';
import { appStore, useAppState } from '../store/appStore';
import { revealOnBoard } from './canvasDom';
import { ArrowIcon, CloseIcon } from './icons';
import { panelCovers } from './textField';

/** The element to bring into view for a match: its marked text, or what hides it. */
function targetOf(m: Match): Element | null {
  if (m.showInstead) return document.querySelector(`[data-card-id="${CSS.escape(m.showInstead)}"], [data-col-id="${CSS.escape(m.showInstead)}"]`);
  const box = document.querySelector(`[data-find="${CSS.escape(m.key)}"]`);
  return box?.querySelector('mark[data-current]') ?? box;
}

/**
 * Move the board so `m` sits in the middle of what can be seen (above a phone's keyboard). A match
 * in the Completed panel is scrolled into view there while the panel is open; while it is shut the
 * Completed button is ringed instead and nothing moves.
 */
function reveal(m: Match, inPanel: boolean, panelOpen: boolean) {
  if (inPanel) {
    if (panelOpen) document.querySelector(`[data-find="${CSS.escape(m.key)}"]`)?.scrollIntoView({ block: 'nearest' });
    return;
  }
  const el = targetOf(m);
  if (el) revealOnBoard(el);
}

/**
 * Search (owner request): Ctrl+F (or the magnifier button, or ⋯ → Search on a phone) opens a bar.
 * Every match is marked; Enter / ↓ and Shift+Enter / ↑ step through them, and the board moves to
 * each one. A match inside a collapsed card or column marks that card or column instead; one in
 * the Completed panel is marked there, or rings the Completed button while the panel is shut.
 * Escape closes the bar.
 */
export function FindBar() {
  const find = useAppState((s) => s.ui.find);
  const board = useAppState((s) => s.board);
  const panelOpen = useAppState((s) => s.ui.sidePanel === 'completed');
  const query = find?.query ?? '';
  const matches = useMemo(() => (query.trim() ? findMatches(board, query) : []), [board, query]);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const open = find !== null;

  // Ctrl+F opens the board's search instead of the browser's (which can't move the board).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyF') {
        e.preventDefault();
        // Behind a panel that covers the board it does nothing (neither search could be seen).
        if (panelCovers()) return;
        appStore.openFind();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // A new search starts at the first match.
  useEffect(() => setIndex(0), [query]);
  const at = matches.length ? Math.min(index, matches.length - 1) : -1;
  const current = at >= 0 ? matches[at] : null;
  const currentId = current && `${current.key}:${current.start}:${current.showInstead}`;
  const inPanel = !!current?.showInstead && board.cards[current.showInstead]?.kind === 'completed';

  useEffect(() => {
    if (!open) return;
    appStore.showMatch(current);
  }, [open, currentId]); // the match is identified by currentId

  // Once the current match is marked on screen, bring it into view.
  useLayoutEffect(() => {
    if (!open || !current) return;
    const frame = requestAnimationFrame(() => reveal(current, inPanel, panelOpen));
    return () => cancelAnimationFrame(frame);
  }, [open, currentId, at, panelOpen]);

  if (!open) return null;
  const step = (by: 1 | -1) => matches.length && setIndex((at + by + matches.length) % matches.length);
  return (
    <div className="find-bar" role="search" aria-label="Search the board">
      <input
        ref={input}
        type="search"
        aria-label="Search the board"
        placeholder="Search the board"
        value={query}
        onChange={(e) => appStore.setFindQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            step(e.key === 'ArrowDown' ? 1 : -1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            appStore.closeFind();
          }
          e.stopPropagation(); // the board's own keys stay out of the search box
        }}
      />
      <span className="find-count" role="status">
        {!query.trim() ? '' : matches.length ? `${at + 1} of ${matches.length}${inPanel ? (panelOpen ? '' : ' · in Completed') : current?.showInstead ? ' · in a closed card' : ''}` : 'No matches'}
      </span>
      <button type="button" className="icon-button" aria-label="Previous match" title="Previous (Shift+Enter)" disabled={!matches.length} onClick={() => step(-1)}>
        <ArrowIcon />
      </button>
      <button type="button" className="icon-button" aria-label="Next match" title="Next (Enter)" disabled={!matches.length} onClick={() => step(1)}>
        <ArrowIcon down />
      </button>
      <button type="button" className="icon-button" aria-label="Close search" title="Close (Esc)" onClick={appStore.closeFind}>
        <CloseIcon />
      </button>
    </div>
  );
}
