import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findMatches, type Match } from '../model/search';
import { appStore, useAppState } from '../store/appStore';
import { ArrowIcon, CloseIcon } from './icons';

/** Below this zoom, going to a match zooms in to 100% so it can be read. */
const READABLE_ZOOM = 0.6;

/** The element to bring into view for a match: its marked text, or what hides it. */
function targetOf(m: Match): Element | null {
  if (m.showInstead) return document.querySelector(`[data-card-id="${m.showInstead}"], [data-col-id="${m.showInstead}"]`);
  const box = document.querySelector(`[data-find="${m.key}"]`);
  return box?.querySelector('mark[data-current]') ?? box;
}

/** Move the board so `m` sits in the middle of what can be seen (above a phone's keyboard). */
function reveal(m: Match) {
  const canvas = document.querySelector<HTMLElement>('[data-testid="canvas"]');
  const el = targetOf(m);
  if (!canvas || !el) return;
  const c = canvas.getBoundingClientRect();
  const v = window.visualViewport;
  const bottom = Math.min(c.bottom, v ? v.offsetTop + v.height : c.bottom);
  const centre = { x: c.left + c.width / 2, y: (c.top + bottom) / 2 };
  if (appStore.getState().view.zoom < READABLE_ZOOM) {
    const r = el.getBoundingClientRect();
    appStore.zoomAt({ x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top }, 1 / appStore.getState().view.zoom);
  }
  const r = el.getBoundingClientRect();
  appStore.panBy(Math.round(centre.x - (r.left + r.width / 2)), Math.round(centre.y - (r.top + r.height / 2)));
}

/**
 * Search (owner request): Ctrl+F (or the magnifier button, or ⋯ → Search on a phone) opens a bar.
 * Every match is marked; Enter / ↓ and Shift+Enter / ↑ step through them, and the board moves to
 * each one. A match inside a collapsed card or column (or a closed Completed section) marks that
 * card or column instead. Escape closes the bar.
 */
export function FindBar() {
  const find = useAppState((s) => s.ui.find);
  const board = useAppState((s) => s.board);
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

  useEffect(() => {
    if (!open) return;
    appStore.showMatch(current);
  }, [open, currentId]); // the match is identified by currentId

  // Once the current match is marked on screen, bring it into view.
  useLayoutEffect(() => {
    if (!open || !current) return;
    const frame = requestAnimationFrame(() => reveal(current));
    return () => cancelAnimationFrame(frame);
  }, [open, currentId, at]);

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
        {!query.trim() ? '' : matches.length ? `${at + 1} of ${matches.length}${current?.showInstead ? ' · in a closed card' : ''}` : 'No matches'}
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
