import { useEffect, useRef, useState } from 'react';
import { anyExpanded } from '../model/board';
import { hasTickedItems } from '../model/completed';
import { COLOR_KEYS, type ColorKey } from '../model/palette';
import { swatchFor } from '../model/theme';
import { backupFileName, boardAsMarkdown } from '../model/exportText';
import { serializeWorkspace } from '../model/workspace';
import { BoardPath, BoardsMenu } from './BoardsMenu';
import type { CardKind } from '../model/types';
import { useNewCardDrag } from './useNewCardDrag';
import { appStore, useAppState } from '../store/appStore';
import { activeVersionStore, restoreFromBackup } from '../store/versions';
import { AutoSizeInput } from './AutoSizeInput';
import { usePhone } from './usePhone';
import { CollapseAllIcon, CaretIcon, SameWidthIcon, GridIcon, HandIcon, MoonIcon, PlusIcon, RedoIcon, SelectIcon, UndoIcon } from './icons';

/** Add Note / To-do list: click to add, or press and drag onto the board to place it. */
function AddCardButton({ kind, label }: { kind: CardKind; label: string }) {
  const drag = useNewCardDrag(kind);
  return (
    <button type="button" className={`tb-button add-${kind}`} title={`Click to add a ${label.toLowerCase()}, or drag it onto the board`} {...drag}>
      {label}
    </button>
  );
}

/** New column: click to add, or press and drag onto the board to place it. */
function NewColumnButton() {
  const drag = useNewCardDrag('column');
  return (
    <button type="button" className="tb-button add-column" title="Click to add a column, or drag it onto the board" {...drag}>
      <PlusIcon />
      New column
    </button>
  );
}

/**
 * Save `text` as a file called `name` on this device. An iPhone home-screen app can't download
 * files, so there the Share sheet offers to save it (Save to Files) instead.
 */
async function saveFile(name: string, text: string, type: string) {
  const file = new File([text], name, { type });
  const homeScreenIphone = (navigator as { standalone?: boolean }).standalone === true;
  if (homeScreenIphone && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] }).catch(() => {}); // closing the sheet isn't an error
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * File menu (owner request): download the board as a backup file (everything, to restore later)
 * or as readable text (Markdown); restore a backup; import a Milanote board exported as Markdown.
 */
export function FileMenu() {
  const [open, setOpen] = useState(false);
  const milanote = useRef<HTMLInputElement>(null);
  const backup = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  // A click anywhere else closes the menu.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [open]);

  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const board = () => appStore.getState().board;
  /** A backup holds every board: named after the board when there is just one. */
  const backupName = () => (Object.keys(appStore.getState().boards.others).length ? 'All boards' : board().name);
  return (
    <div className="file-menu-wrap" ref={wrap}>
      <button type="button" className="tb-button quiet" aria-haspopup="menu" aria-expanded={open} title="Back up, restore or import" onClick={() => setOpen((o) => !o)}>
        File
      </button>
      {open && (
        <div className="file-menu" role="menu" aria-label="File">
          <button type="button" role="menuitem" onClick={pick(() => saveFile(backupFileName(backupName(), new Date(), 'json'), serializeWorkspace(appStore.workspace()), 'application/json'))}>
            Download backup
          </button>
          <button type="button" role="menuitem" title="This board as readable text" onClick={pick(() => saveFile(backupFileName(board().name, new Date(), 'md'), boardAsMarkdown(board(), appStore.boardName), 'text/markdown'))}>
            Download as text
          </button>
          <button type="button" role="menuitem" onClick={pick(() => backup.current?.click())}>
            Restore from backup…
          </button>
          <button type="button" role="menuitem" title="Add the cards from a Milanote board exported as Markdown (.md)" onClick={pick(() => milanote.current?.click())}>
            Import from Milanote…
          </button>
        </div>
      )}
      <input
        ref={backup}
        type="file"
        accept=".json,application/json"
        aria-label="Backup file"
        hidden
        onChange={async (e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = ''; // so picking the same file again works again
          if (!file) return;
          const text = await file.text();
          if (!appStore.isBackup(text)) return void window.alert('That file isn’t a BusyAnts backup, so nothing was changed.');
          const question = appStore.isFullBackup(text)
            ? 'Replace all your boards with the ones in the backup? Your boards as they are now are kept in Version history.'
            : 'Replace this board with the backup? This board is kept in Version history, and Ctrl+Z brings it back.';
          if (!window.confirm(question)) return;
          await restoreFromBackup(appStore, activeVersionStore(), text);
          // Bring the restored board into view once it has been drawn.
          requestAnimationFrame(() => requestAnimationFrame(() => appStore.showWholeBoard()));
        }}
      />
      <input
        ref={milanote}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        aria-label="Milanote Markdown file"
        hidden
        onChange={async (e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = ''; // so picking the same file again imports it again
          if (file) appStore.importMilanote(await file.text());
        }}
      />
    </div>
  );
}

/**
 * Colour button: recolours the selected columns, and the title band of the selected cards (cards
 * themselves are always white). Faded while nothing is selected.
 */
export function ColourControl() {
  const count = useAppState((s) => s.ui.selection.length);
  const open = useAppState((s) => s.ui.colourMenuOpen && count > 0);
  // The colour of the last selected block, shown on the button and ringed in the menu.
  const current = useAppState((s): ColorKey | null | undefined => {
    const id = s.ui.selection[s.ui.selection.length - 1];
    if (!id) return undefined;
    return s.board.columns[id] ? s.board.columns[id].color : (s.board.cards[id]?.titleColor ?? null);
  });
  const theme = useAppState((s) => s.view.theme);
  const shown = swatchFor(current ?? null, theme);
  // The swatch under the pointer (or keyboard focus), named under the grid: several are close in tone.
  const [hovered, setHovered] = useState<string | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const lastSelected = useAppState((s) => s.ui.selection[s.ui.selection.length - 1] ?? null);
  // When the menu opens over the block being coloured, move the board down so the block stays in view.
  useEffect(() => {
    if (!open || !lastSelected || !menu.current) return;
    const block = document.querySelector(`[data-card-id="${CSS.escape(lastSelected)}"], [data-col-id="${CSS.escape(lastSelected)}"]`);
    if (!block) return;
    const m = menu.current.getBoundingClientRect();
    const b = block.getBoundingClientRect();
    const covered = b.top < m.bottom && b.bottom > m.top && b.left < m.right && b.right > m.left;
    if (covered) appStore.panBy(0, Math.round(m.bottom - b.top + 16));
  }, [open, lastSelected]);
  const named = hovered ?? (current ? swatchFor(current, theme).label : current === null ? 'Default' : '');

  return (
    <div className="colour-control">
      <button
        type="button"
        className="tb-button faded-colour"
        aria-label="Colour of selected cards and columns"
        title={count ? "Colour the selected columns, or the selected cards' title bands" : 'Select a card or column first'}
        aria-disabled={count ? undefined : true}
        aria-expanded={open}
        onClick={appStore.toggleColourMenu}
      >
        <span className="colour-dot" aria-hidden="true" style={{ background: shown.bg, borderColor: current ? shown.text : undefined }} />
        Colour
        <CaretIcon />
      </button>
      {open && (
        <div ref={menu} className="colour-menu" role="group" aria-label="Colours">
          {COLOR_KEYS.map((key) => {
            const sw = swatchFor(key, theme);
            return (
            <button
              key={key}
              type="button"
              className="swatch"
              aria-label={sw.label}
              title={sw.label}
              aria-pressed={key === current}
              style={{ background: sw.bg, borderColor: key === current ? sw.text : sw.edge, color: sw.text }}
              onClick={() => appStore.recolourSelection(key)}
              onPointerEnter={() => setHovered(sw.label)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(sw.label)}
              onBlur={() => setHovered(null)}
            />
            );
          })}
          <div className="swatch-name" aria-live="polite">
            {named}
          </div>
          <button type="button" className="swatch-default" aria-pressed={current === null} onClick={() => appStore.recolourSelection(null)}>
            Default
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Collapse all / Expand all: collapses every card and column, or (when all are collapsed) opens them
 * all. With blocks selected, only those (owner request).
 */
export function CollapseAllButton({ labelled = false }: { labelled?: boolean }) {
  const any = useAppState((s) => Object.keys(s.board.cards).length + Object.keys(s.board.columns).length > 0);
  const selected = useAppState((s) => s.ui.selection.length > 0);
  const expand = useAppState((s) => any && !anyExpanded(s.board, s.ui.selection.length ? s.ui.selection : undefined));
  const label = expand ? 'Expand all' : 'Collapse all';
  const title = selected ? `${expand ? 'Expand' : 'Collapse'} the selected cards and columns` : `${label} cards and columns`;
  return (
    <button
      type="button"
      className={`tb-button faded-colour quiet${labelled ? '' : ' icon-only'}`}
      aria-label={label}
      title={any ? title : 'Nothing to collapse yet'}
      aria-disabled={any ? undefined : true}
      onClick={() => any && appStore.toggleAllCollapsed()}
    >
      <CollapseAllIcon expand={expand} />
      {labelled && label}
    </button>
  );
}

/** Same width: the selected loose cards and columns take the first one's width. Faded with fewer than two selected. */
export function SameWidthButton({ labelled = false }: { labelled?: boolean }) {
  const ready = useAppState((s) => s.ui.selection.filter((id) => s.board.order.includes(id)).length >= 2);
  return (
    <button
      type="button"
      className={`tb-button faded-colour quiet${labelled ? '' : ' icon-only'}`}
      aria-label="Same width"
      title={ready ? "Make the selected cards and columns as wide as the first one you selected" : 'Select two or more cards or columns first'}
      aria-disabled={ready ? undefined : true}
      onClick={() => ready && appStore.matchWidths()}
    >
      <SameWidthIcon />
      {labelled && 'Same width'}
    </button>
  );
}

/** Light / dark toggle (pressed = dark). The choice is remembered on this device only. */
export function DarkModeButton({ labelled = false }: { labelled?: boolean }) {
  const dark = useAppState((s) => s.view.theme === 'dark');
  return (
    <button
      type="button"
      className={`tb-button${labelled ? '' : ' icon-only'}`}
      aria-label="Dark mode"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      onClick={appStore.toggleTheme}
    >
      <MoonIcon />
      {labelled && 'Dark mode'}
    </button>
  );
}

/** Clean up: moves every ticked item into the Completed card. Faded when nothing is ticked. */
export function CleanUpButton() {
  const any = useAppState((s) => hasTickedItems(s.board));
  return (
    <button
      type="button"
      className="tb-button faded-colour quiet"
      title={any ? "Move every ticked item into the Completed card, under today's date" : 'Nothing is ticked yet'}
      aria-disabled={any ? undefined : true}
      onClick={() => any && appStore.cleanUp()}
    >
      Clean up
    </button>
  );
}

/** Auto-colour: gives every column a different colour. Faded when there are no columns. */
export function AutoColourButton() {
  const hasColumns = useAppState((s) => Object.keys(s.board.columns).length > 0);
  return (
    <button
      type="button"
      className="tb-button faded-colour quiet"
      title={hasColumns ? 'Give every column a different colour' : 'Add a column first'}
      aria-disabled={hasColumns ? undefined : true}
      onClick={() => hasColumns && appStore.autoColour()}
    >
      Auto-colour
    </button>
  );
}

/** Hand / Select: what dragging empty board does. */
export function ToolGroup() {
  const tool = useAppState((s) => s.view.tool);
  return (
    <div className="tool-group" role="group" aria-label="Board tool">
      <button
        type="button"
        className="tool-button"
        aria-label="Hand (H)"
        title="Hand (H): drag empty space to move the board"
        aria-pressed={tool === 'hand'}
        onClick={() => appStore.setTool('hand')}
      >
        <HandIcon />
      </button>
      <button
        type="button"
        className="tool-button"
        aria-label="Select (V)"
        title="Select (V): drag a rectangle to select several cards and columns"
        aria-pressed={tool === 'select'}
        onClick={() => appStore.setTool('select')}
      >
        <SelectIcon />
      </button>
    </div>
  );
}

export function SnapButton() {
  const snap = useAppState((s) => s.board.snap);
  return (
    <button type="button" className="tb-button snap" aria-pressed={snap} onClick={appStore.toggleSnap}>
      <GridIcon />
      Snap to grid
    </button>
  );
}

/** The BusyAnts ant from the app icon (owner request: the toolbar matches the icon). */
function Logo() {
  return <img className="toolbar-logo" src={`${import.meta.env.BASE_URL}busyants-icon.svg`} alt="BusyAnts" width={30} height={30} />;
}

function BoardName() {
  const name = useAppState((s) => s.board.name);
  return <AutoSizeInput className="board-name" aria-label="Board name" placeholder="Untitled board" value={name} onChange={appStore.renameBoard} />;
}

export function Toolbar({ onSignOut }: { onSignOut?: () => void }) {
  const canUndo = useAppState((s) => s.ui.canUndo);
  const canRedo = useAppState((s) => s.ui.canRedo);
  // On a phone the top bar only holds the board name; everything else is in the bottom bar (PhoneBar).
  if (usePhone())
    return (
      <header className="toolbar phone">
        <Logo />
        <BoardsMenu labelled={false} />
        <BoardPath />
        <BoardName />
      </header>
    );

  return (
    <header className="toolbar">
      <Logo />
      <BoardsMenu labelled={false} />
      <BoardPath />
      <BoardName />
      <div className="toolbar-spacer" />

      <ToolGroup />

      {/* Faded when there is nothing to undo or redo. */}
      <button
        type="button"
        className="tb-button icon-only faded-undo"
        aria-label="Undo (Ctrl+Z)"
        title="Undo (Ctrl+Z)"
        aria-disabled={canUndo ? undefined : true}
        onClick={appStore.undo}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className="tb-button icon-only faded-undo"
        aria-label="Redo (Ctrl+Y)"
        title="Redo (Ctrl+Y)"
        aria-disabled={canRedo ? undefined : true}
        onClick={appStore.redo}
      >
        <RedoIcon />
      </button>

      <div className="toolbar-divider" aria-hidden="true" />

      <SnapButton />

      <ColourControl />
      <AutoColourButton />
      <CollapseAllButton />
      <SameWidthButton />

      <div className="toolbar-divider" aria-hidden="true" />
      <span className="toolbar-label">Add</span>

      <AddCardButton kind="note" label="Note" />
      <AddCardButton kind="todo" label="To-do list" />
      <NewColumnButton />

      <div className="toolbar-divider" aria-hidden="true" />
      <FileMenu />
      <CleanUpButton />
      <DarkModeButton />

      {onSignOut && (
        <>
          <div className="toolbar-divider" aria-hidden="true" />
          <button type="button" className="tb-button" onClick={onSignOut}>
            Sign out
          </button>
        </>
      )}
    </header>
  );
}
