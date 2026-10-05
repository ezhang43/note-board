import { useEffect, useMemo, useRef, useState } from 'react';
import { boardTree } from '../model/workspace';
import { appStore, useAppState } from '../store/appStore';
import { activeVersionStore, deleteBoardSafely } from '../store/versions';
import { BoardsIcon, CaretIcon, CloseIcon } from './icons';

// Several boards, and boards inside boards (owner request, 2026-10-05): the Boards menu lists every
// board (boards inside another indented under it), opens one, makes a new board, adds a board
// inside this one, or deletes a board (never the home board). The path above the open board shows
// before its name, to go back out.

const shownName = (name: string) => name.trim() || 'Untitled board';

/** Boards button and menu. */
export function BoardsMenu({ labelled = true }: { labelled?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const openId = useAppState((s) => s.boards.open);
  const home = useAppState((s) => s.boards.home);
  const openName = useAppState((s) => s.board.name);
  const others = useAppState((s) => s.boards.others);

  // A click anywhere else closes the menu.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [open]);

  const rows = open ? boardTree(appStore.workspace()) : [];
  const nameOf = (id: string) => shownName(id === openId ? openName : (others[id]?.name ?? ''));
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const remove = (id: string) => {
    setOpen(false);
    if (!window.confirm(`Delete the board “${nameOf(id)}” and everything on it? Boards inside it are kept. You can bring it back from Version history.`)) return;
    void deleteBoardSafely(appStore, activeVersionStore(), id);
  };

  return (
    <div className="boards-menu-wrap" ref={wrap}>
      <button
        type="button"
        className={`tb-button quiet${labelled ? '' : ' icon-only'}`}
        aria-label="Boards"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Open, add or delete boards"
        onClick={() => setOpen((o) => !o)}
      >
        <BoardsIcon />
        {labelled && 'Boards'}
        {labelled && <CaretIcon />}
      </button>
      {open && (
        <div className="boards-menu" role="menu" aria-label="Boards">
          <div className="boards-list">
            {rows.map(({ id, depth }) => (
              <div key={id} className="boards-row" style={{ paddingLeft: 4 + depth * 16 }}>
                <button type="button" role="menuitem" className="boards-open" aria-current={id === openId ? 'true' : undefined} onClick={pick(() => appStore.openBoard(id))}>
                  {nameOf(id)}
                </button>
                {id !== home && (
                  <button type="button" className="icon-button" aria-label={`Delete board ${nameOf(id)}`} title="Delete this board" onClick={() => remove(id)}>
                    <CloseIcon />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="boards-actions">
            <button type="button" role="menuitem" title="A new board inside this one, with a card here that opens it" onClick={pick(() => appStore.addBoardCard())}>
              Add a sub-board here
            </button>
            <button type="button" role="menuitem" title="A new board on its own" onClick={pick(() => appStore.newBoard())}>
              New board
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The boards above the open one ("Home ›"), each a button back to it. Nothing on a top board. */
export function BoardPath() {
  // Worked out again only when boards are added, removed, opened or changed elsewhere (not at every
  // edit of the open board): the boards above the open one never include it.
  const boards = useAppState((s) => s.boards);
  const path = useMemo(() => appStore.pathToOpen().slice(0, -1), [boards]);
  const names = path.map((id) => boards.others[id]?.name ?? '');
  if (!path.length) return null;
  return (
    <nav className="board-path" aria-label="Boards above this one">
      {path.map((id, i) => (
        <span key={id} className="board-path-step">
          <button type="button" className="board-path-link" aria-label={`Back to ${shownName(names[i])}`} title={`Back to ${shownName(names[i])}`} onClick={() => appStore.openBoard(id)}>
            {shownName(names[i])}
          </button>
          <span className="board-path-sep" aria-hidden="true">
            ›
          </span>
        </span>
      ))}
    </nav>
  );
}
