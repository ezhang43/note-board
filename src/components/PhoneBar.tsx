import { useEffect, useRef, useState } from 'react';
import { ShareButton } from './SharePanel';
import { appStore, useAppState } from '../store/appStore';
import { CoffeeIcon, HistoryIcon, InfoIcon, MoreIcon, PlusIcon, RedoIcon, SearchIcon, SignOutIcon, UndoIcon } from './icons';
import {
  CleanUpButton,
  CollapseAllButton,
  ColourControl,
  DarkModeButton,
  FeedbackButton,
  FileMenu,
  SameWidthButton,
  SnapButton,
  ToolGroup,
} from './Toolbar';
import { TextSizeButtons } from './ZoomControl';
import { DONATE_URL } from '../model/constants';
import { CompletedButton } from './CompletedPanel';
import { PomodoroButton } from './PomodoroPanel';
import { CalendarButton } from './CalendarPanel';

/**
 * Phone layout (owner request): a bar along the bottom, in reach of a thumb, with Undo, Redo,
 * + (add a card or container) and ⋯ (every other toolbar button). Tapping outside an open menu closes it.
 */
export function PhoneBar({ onSignOut }: { onSignOut?: () => void }) {
  const canUndo = useAppState((s) => s.ui.canUndo);
  const canRedo = useAppState((s) => s.ui.canRedo);
  const [open, setOpen] = useState<'add' | 'more' | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);

  const toggle = (menu: 'add' | 'more') => setOpen((o) => (o === menu ? null : menu));
  const add = (kind: 'note' | 'todo' | 'column' | 'board') => {
    setOpen(null);
    if (kind === 'column') appStore.addColumn();
    else if (kind === 'board') appStore.addBoardCard();
    else appStore.addCard(kind);
  };

  return (
    <div ref={root} className="phone-bar-wrap">
      {open === 'add' && (
        <div className="phone-sheet phone-add" role="menu" aria-label="Add">
          <button type="button" role="menuitem" onClick={() => add('note')}>
            Note
          </button>
          <button type="button" role="menuitem" onClick={() => add('todo')}>
            Checklist
          </button>
          <button type="button" role="menuitem" onClick={() => add('column')}>
            Container
          </button>
          <button type="button" role="menuitem" onClick={() => add('board')}>
            Sub-board
          </button>
        </div>
      )}
      {open === 'more' && (
        <div className="phone-sheet phone-more" role="dialog" aria-label="More">
          <div className="phone-tiles">
            <button
              type="button"
              className="tb-button"
              onClick={() => {
                setOpen(null);
                appStore.openFind();
              }}
            >
              <SearchIcon />
              Search
            </button>
            <ShareButton phone />
            <button
              type="button"
              className="tb-button"
              aria-label="Version history"
              onClick={() => {
                setOpen(null);
                appStore.toggleHistory();
              }}
            >
              <HistoryIcon />
              History
            </button>
            <CompletedButton labelled onOpen={() => setOpen(null)} />
            <PomodoroButton labelled onOpen={() => setOpen(null)} />
            <CalendarButton labelled onOpen={() => setOpen(null)} />
          </div>
          <section className="phone-arrange" aria-labelledby="phone-arrange">
            <h2 id="phone-arrange" className="phone-label">
              Arrange
            </h2>
            <div className="phone-row">
              <ToolGroup />
              <TextSizeButtons />
            </div>
            <div className="phone-rows">
              <SnapButton />
              <ColourControl />
            </div>
            <div className="phone-trio">
              <CollapseAllButton labelled />
              <SameWidthButton labelled />
              <CleanUpButton labelled />
            </div>
          </section>
          <section className="phone-rest" aria-labelledby="phone-rest">
            <h2 id="phone-rest" className="phone-label">
              More
            </h2>
            <div className="phone-rows">
              <FileMenu />
              <DarkModeButton labelled />
              <FeedbackButton onOpen={() => setOpen(null)} />
              <a className="tb-button" href={`${import.meta.env.BASE_URL}about/`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(null)}>
                <InfoIcon />
                About BusyAnts
              </a>
              <a className="tb-button" href={DONATE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(null)}>
                <CoffeeIcon />
                Buy me a coffee
              </a>
              {onSignOut && (
                <button type="button" className="tb-button" onClick={onSignOut}>
                  <SignOutIcon />
                  Sign out
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      <nav className="phone-bar" role="toolbar" aria-label="Board actions">
        <button type="button" aria-label="Undo" aria-disabled={canUndo ? undefined : true} onClick={appStore.undo}>
          <UndoIcon />
        </button>
        <button type="button" aria-label="Redo" aria-disabled={canRedo ? undefined : true} onClick={appStore.redo}>
          <RedoIcon />
        </button>
        <button type="button" className="phone-add-button" aria-label="Add" aria-haspopup="menu" aria-expanded={open === 'add'} onClick={() => toggle('add')}>
          <PlusIcon size={22} />
        </button>
        <button type="button" aria-label="More" aria-haspopup="dialog" aria-expanded={open === 'more'} onClick={() => toggle('more')}>
          <MoreIcon />
        </button>
      </nav>
    </div>
  );
}
