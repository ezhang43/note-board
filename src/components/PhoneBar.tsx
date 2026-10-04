import { useEffect, useRef, useState } from 'react';
import { appStore, useAppState } from '../store/appStore';
import { HistoryIcon, MoreIcon, PlusIcon, RedoIcon, SearchIcon, UndoIcon } from './icons';
import {
  AutoColourButton,
  CleanUpButton,
  CollapseAllButton,
  ColourControl,
  DarkModeButton,
  ImportButton,
  SameWidthButton,
  SnapButton,
  ToolGroup,
} from './Toolbar';
import { TextSizeButtons } from './ZoomControl';

/**
 * Phone layout (owner request): a bar along the bottom, in reach of a thumb, with Undo, Redo,
 * + (add a card or column) and ⋯ (every other toolbar button). Tapping outside an open menu closes it.
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
  const add = (kind: 'note' | 'todo' | 'link' | 'column') => {
    setOpen(null);
    if (kind === 'column') appStore.addColumn();
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
            To-do list
          </button>
          <button type="button" role="menuitem" onClick={() => add('link')}>
            Link
          </button>
          <button type="button" role="menuitem" onClick={() => add('column')}>
            Column
          </button>
        </div>
      )}
      {open === 'more' && (
        <div className="phone-sheet phone-more" role="dialog" aria-label="More">
          <div className="phone-row">
            <ToolGroup />
            <TextSizeButtons />
          </div>
          <SnapButton />
          <ColourControl />
          <AutoColourButton />
          <CollapseAllButton labelled />
          <SameWidthButton labelled />
          <CleanUpButton />
          <ImportButton />
          <DarkModeButton labelled />
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
          <button
            type="button"
            className="tb-button"
            onClick={() => {
              setOpen(null);
              appStore.toggleHistory();
            }}
          >
            <HistoryIcon />
            Version history
          </button>
          {onSignOut && (
            <button type="button" className="tb-button" onClick={onSignOut}>
              Sign out
            </button>
          )}
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
