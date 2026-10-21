import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { shownName } from '../model/board';
import { findMatches, findMatchesAcross, type BoardMatch, type Match } from '../model/search';
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
  const boards = useAppState((s) => s.boards);
  const openId = boards.open;
  const all = find?.all ?? false;
  const from = find?.from ?? openId;
  const panelOpen = useAppState((s) => s.ui.sidePanel === 'completed');
  const query = find?.query ?? '';
  // simple: every board is searched again at each change to the open board; fine for the boards this app holds, upgrade if typing lags with All boards on.
  const matches: BoardMatch[] = useMemo(() => {
    if (!query.trim()) return [];
    if (all) return findMatchesAcross(appStore.workspace(), from, query);
    return findMatches(board, query).map((m) => ({ ...m, boardId: openId }));
  }, [board, boards, query, all, from, openId]);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const open = find !== null;

  // Ctrl+F opens the board's search instead of the browser's (which can't move the board).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyF') {
        e.preventDefault();
        // Behind a panel that covers the board, or the shortcuts list (it may be recording a key), it does nothing.
        if (panelCovers() || appStore.getState().ui.shortcutsOpen) return;
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
  useEffect(() => setIndex(0), [query, all]);
  const at = matches.length ? Math.min(index, matches.length - 1) : -1;
  const current = at >= 0 ? matches[at] : null;
  const currentId = current && `${current.boardId}:${current.key}:${current.start}:${current.showInstead}`;
  // A match on another board is only marked once that board is open (Enter goes there).
  const here = current?.boardId === openId;
  const inPanel = here && !!current.showInstead && board.cards[current.showInstead]?.kind === 'completed';

  useEffect(() => {
    if (!open) return;
    appStore.showMatch(here ? current : null);
  }, [open, currentId, openId]); // the match is identified by currentId

  // Once the current match is marked on screen, bring it into view. After a different board has
  // opened, wait until the board has been centred on arrival (Canvas does that two frames in).
  const arrived = useRef(openId);
  useLayoutEffect(() => {
    const switched = arrived.current !== openId;
    arrived.current = openId;
    if (!open || !current || !here) return;
    let frame = 0;
    const wait = (left: number) => {
      frame = requestAnimationFrame(() => (left > 1 ? wait(left - 1) : reveal(current, inPanel, panelOpen)));
    };
    wait(switched ? 3 : 1);
    return () => cancelAnimationFrame(frame);
  }, [open, currentId, at, panelOpen, openId]);

  if (!open) return null;
  // Enter goes to the current match first when it is on another board (it has not been opened yet).
  const go = (n: number) => {
    setIndex(n);
    if (matches[n].boardId !== openId) appStore.openBoard(matches[n].boardId);
  };
  const step = (by: 1 | -1) => matches.length && go(here ? (at + by + matches.length) % matches.length : at);
  const where = current && !here ? ` · ${shownName(appStore.boardName(current.boardId))}` : '';
  const count = !query.trim() ? '' : matches.length ? `${at + 1} of ${matches.length}${where || (inPanel ? (panelOpen ? '' : ' · in Completed') : current?.showInstead ? ' · in a closed card' : '')}` : 'No matches';
  return (
    <div className="find-bar" role="search" aria-label="Search the board" onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation(); // nothing else answers this Escape
        appStore.closeFind();
      }}
    >
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
          // The board's own keys stay out of the search box, except the zoom keys (or the browser zooms the whole page).
          if (!((e.ctrlKey || e.metaKey) && ['=', '+', '-', '_', '0'].includes(e.key))) e.stopPropagation();
        }}
      />
      <span className="find-count" role="status" title={count}>
        {count}
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
      <div className="find-scope" role="group" aria-label="Where to search">
        {([false, true] as const).map((wide) => (
          <button
            key={String(wide)}
            type="button"
            aria-pressed={all === wide}
            className={all === wide ? 'find-scope-option on' : 'find-scope-option'}
            onMouseDown={(e) => e.preventDefault()} // the search box keeps the cursor, so Enter still steps
            onClick={() => appStore.setFindAll(wide)}
          >
            {wide ? 'All boards' : 'This board'}
          </button>
        ))}
      </div>
    </div>
  );
}
