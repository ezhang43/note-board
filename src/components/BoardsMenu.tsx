import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { shownName } from '../model/board';
import { boardRights } from '../model/sharing';
import { boardTree } from '../model/workspace';
import { appStore, useAppState, useViewOnly } from '../store/appStore';
import { activeVersionStore, deleteBoardSafely } from '../store/versions';
import { collab } from '../sync/collabSession';
import { ask } from './ConfirmDialog';
import { BoardsIcon, CaretIcon, CloseIcon, ShareIcon } from './icons';
import { TemplatesDialog } from './TemplatesDialog';

// Several boards, and boards inside boards (owner request, 2026-10-05): the Boards menu lists every
// board (boards inside another indented under it), opens one, makes a new board, adds a board
// inside this one, or deletes a board (never the home board). The path above the open board shows
// before its name, to go back out. Shared boards (owner request: editing together) are marked; only
// the person who shared one can delete it, and that deletes it for everyone.

/** Boards button and menu. */
export function BoardsMenu({ labelled = true }: { labelled?: boolean }) {
  const [open, setOpen] = useState(false);
  // The "Start a board" dialog (templates), opened from a row in the menu; focus goes back to the button after.
  const [gallery, setGallery] = useState(false);
  const viewOnly = useViewOnly();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeGallery = useCallback(() => {
    setGallery(false);
    requestAnimationFrame(() => button.current?.focus());
  }, []);
  const openId = useAppState((s) => s.boards.open);
  const home = useAppState((s) => s.boards.home);
  const openName = useAppState((s) => s.board.name);
  const others = useAppState((s) => s.boards.others);
  const shares = useAppState((s) => s.ui.shares);

  // A click anywhere else closes the menu.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [open]);

  // The Journal and Habits panels' own boards stay out of the list (owner, 2026-10-18 and 2026-10-19).
  const hidden = open ? appStore.hiddenBoards() : [];
  const rows = open ? boardTree(appStore.workspace()).filter(({ id }) => !hidden.includes(id)) : [];
  const nameOf = (id: string) => shownName(id === openId ? openName : (others[id]?.name ?? ''));
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const remove = async (id: string) => {
    setOpen(false);
    wrap.current?.querySelector('button')?.focus(); // the menu goes: the question hands focus back to the Boards button
    const sharing = collab.sharing();
    const name = nameOf(id);
    const forEveryone = () => boardRights(appStore.getState().ui.shares, id, home).deleteForEveryone && !!collab.sharing();
    const everyone = forEveryone();
    // Deleting a board isn't on Ctrl+Z (only Version history brings it back), so it always asks.
    const yes = await ask(
      everyone
        ? { title: `Delete “${name}” for everyone?`, body: 'It goes for everyone it’s shared with. Boards inside it are kept on your boards. You can bring it back from Version history.', action: 'Delete board', cancel: 'Keep board', danger: true }
        : { title: `Delete “${name}”?`, body: 'Everything on it goes. Boards inside it are kept. You can bring it back from Version history.', action: 'Delete board', cancel: 'Keep board', danger: true },
    );
    // Only what was asked: not if the board went, or started or stopped being shared, meanwhile.
    if (!yes || !appStore.workspace().boards[id] || forEveryone() !== everyone) return;
    deleteBoardSafely(appStore, activeVersionStore(), id, sharing).catch(() => collab.setNotice(`“${name}” couldn’t be deleted. Check your connection and try again.`));
  };

  return (
    <div
      className="boards-menu-wrap"
      ref={wrap}
      onKeyDown={(e) => {
        // Escape shuts the menu (and goes no further, so a side panel behind it stays open).
        if (e.key !== 'Escape' || !open) return;
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }}
    >
      <button
        ref={button}
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
                  {shares.some((s) => s.boards.includes(id)) && (
                    <span className="boards-shared" title="Shared">
                      <ShareIcon size={14} />
                    </span>
                  )}
                </button>
                {boardRights(shares, id, home).delete && (
                  <button type="button" className="icon-button" aria-label={`Delete board ${nameOf(id)}`} title="Delete this board" onClick={() => void remove(id)}>
                    <CloseIcon />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="boards-actions">
            {/* Not on a read-only board (job 161), where its card couldn't go. */}
            {!viewOnly && (
              <button type="button" role="menuitem" title="A new board inside this one, with a card here that opens it" onClick={pick(() => appStore.addBoardCard())}>
                Add a sub-board here
              </button>
            )}
            <button type="button" role="menuitem" title="A new board on its own" onClick={pick(() => appStore.newBoard())}>
              New board
            </button>
            <button type="button" role="menuitem" aria-haspopup="dialog" title="Start a board from a ready-made one" onClick={pick(() => setGallery(true))}>
              New from a template…
            </button>
          </div>
        </div>
      )}
      {gallery && createPortal(<TemplatesDialog onClose={closeGallery} />, document.querySelector('.app') ?? document.body)}
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
