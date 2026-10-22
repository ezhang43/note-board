import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { anyExpanded } from '../model/board';
import { hasTickedItems } from '../model/completed';
import { labelOf } from '../model/hotkeys';
import { COLOR_KEYS, type ColorKey } from '../model/palette';
import { boardRights, keptNotice } from '../model/sharing';
import { COLOR_THEMES, swatchFor } from '../model/theme';
import { backupFileName, boardAsMarkdown } from '../model/exportText';
import { CANT_READ, IMPORT_ACCEPT, IMPORT_MAX_BYTES, isPdf, TOO_BIG } from '../model/importFile';
import { readPdf } from './readPdf';
import { boardPicture } from './exportBoard';
import { serializeWorkspace } from '../model/workspace';
import { BoardPath, BoardsMenu } from './BoardsMenu';
import { ShareButton } from './SharePanel';
import type { CardKind } from '../model/types';
import { useNewCardDrag } from './useNewCardDrag';
import { appStore, useAppState, useViewOnly } from '../store/appStore';
import { RoleBadge } from './ViewOnly';
import { activeVersionStore, historyFull, restoreFromBackup } from '../store/versions';
import { collab } from '../sync/collabSession';
import { account, useAccountRemover } from '../sync/account';
import { feedback, useFeedbackSender } from '../sync/feedback';
import { AutoSizeInput } from './AutoSizeInput';
import { useMedia, usePhone } from './usePhone';
import { ask } from './ConfirmDialog';
import { arrowThroughMenu } from './menuArrows';
import { AppearanceIcon, ArrangeIcon, ChecklistIcon, CollapseAllIcon, CaretIcon, ContainerIcon, FileIcon, SameWidthIcon, FeedbackIcon, GridIcon, HandIcon, MoonIcon, MoreIcon, NoteIcon, RedoIcon, SelectIcon, SignOutIcon, UndoIcon } from './icons';

/** Add Note / Checklist: click to add, or press and drag onto the board to place it. */
function AddCardButton({ kind, label }: { kind: CardKind; label: string }) {
  const drag = useNewCardDrag(kind);
  return (
    <button type="button" className={`tb-button add-${kind}`} aria-label={label} title={`Click to add a ${label.toLowerCase()}, or drag it onto the board`} {...drag}>
      {kind === 'note' ? <NoteIcon /> : <ChecklistIcon />}
      <span className="tb-label">{label}</span>
    </button>
  );
}

/** New container: click to add, or press and drag onto the board to place it. */
function NewColumnButton() {
  const drag = useNewCardDrag('column');
  return (
    <button type="button" className="tb-button add-column" aria-label="New container" title="Click to add a container, or drag it onto the board" {...drag}>
      <ContainerIcon />
      <span className="tb-label">Container</span>
    </button>
  );
}

/**
 * Save `text` as a file called `name` on this device. An iPhone home-screen app can't download
 * files, so there the Share sheet offers to save it (Save to Files) instead.
 */
async function saveFile(name: string, data: BlobPart, type: string) {
  const file = new File([data], name, { type });
  const homeScreenIphone = (navigator as { standalone?: boolean }).standalone === true;
  if (homeScreenIphone && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] }).catch(() => {}); // closing the sheet isn't an error
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads every board as one backup file, named after the board when there is just one. */
export function downloadBackup() {
  const name = Object.keys(appStore.getState().boards.others).length ? 'All boards' : appStore.getState().board.name;
  void saveFile(backupFileName(name, new Date(), 'json'), serializeWorkspace(appStore.workspace()), 'application/json');
}

/** Downloads the open board as a picture or a one-page PDF (job 163); a big board shows "Preparing…" meanwhile. */
let drawing = false; // one picture at a time: a second full-size copy of a big board could run a phone out of memory
async function downloadPicture(kind: 'png' | 'pdf') {
  if (drawing) return;
  drawing = true;
  collab.setNotice('Preparing…');
  try {
    const blob = await boardPicture(kind);
    if (!blob) return void collab.setNotice('Nothing on this board to save yet.');
    await saveFile(backupFileName(appStore.getState().board.name, new Date(), kind), blob, blob.type);
  } catch (e) {
    console.error(e);
    collab.setNotice('Couldn’t make the picture. Try again, or try a smaller board.');
  } finally {
    drawing = false;
    if (collab.notice() === 'Preparing…') collab.setNotice(null);
  }
}

/**
 * File menu (owner request): download the board as a backup file (everything, to restore later)
 * or as readable text (Markdown); restore a backup; import cards from another app's file.
 */
/**
 * A toolbar popover (File, Arrange): a click anywhere else closes it; Escape closes it and puts
 * focus back on its button (the first button in the wrap).
 */
function usePopover() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [open]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (open && arrowThroughMenu(e)) return;
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation();
    setOpen(false);
    wrap.current?.querySelector('button')?.focus();
  };
  return { open, setOpen, wrap, onKeyDown };
}

export function FileMenu() {
  const { open, setOpen, wrap, onKeyDown } = usePopover();
  const importer = useRef<HTMLInputElement>(null);
  const backup = useRef<HTMLInputElement>(null);

  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const board = () => appStore.getState().board;
  const viewOnly = useViewOnly();
  // Delete your account (job #63): only where there is an account (signed in, or a demo person).
  const canDeleteAccount = useAccountRemover() !== null;
  return (
    <div className="file-menu-wrap" ref={wrap} onKeyDown={onKeyDown}>
      <button type="button" className="tb-button quiet" aria-haspopup="menu" aria-expanded={open} title="Back up, restore or import" onClick={() => setOpen((o) => !o)}>
        <FileIcon />
        File
      </button>
      {open && (
        <div className="file-menu" role="menu" aria-label="File">
          <button type="button" role="menuitem" onClick={pick(downloadBackup)}>
            Download backup
          </button>
          <button type="button" role="menuitem" title="This board as readable text" onClick={pick(() => saveFile(backupFileName(board().name, new Date(), 'md'), boardAsMarkdown(board(), appStore.boardName), 'text/markdown'))}>
            Download as text
          </button>
          <button type="button" role="menuitem" title="This board as a picture, to send or print" onClick={pick(() => downloadPicture('png'))}>
            Download as picture (PNG)
          </button>
          <button type="button" role="menuitem" title="This board as a one-page PDF, to send or print" onClick={pick(() => downloadPicture('pdf'))}>
            Download as PDF
          </button>
          <button type="button" role="menuitem" onClick={pick(() => backup.current?.click())}>
            Restore from backup…
          </button>
          {/* Nothing is added to a read-only board (job 161). */}
          {!viewOnly && (
            <button type="button" role="menuitem" title="Add cards from a Markdown, text, web page, JSON or PDF file (Milanote, Obsidian, Notion, Evernote, Trello, Google Keep…)" onClick={pick(() => importer.current?.click())}>
              Import file…
            </button>
          )}
          {canDeleteAccount && (
            <button type="button" role="menuitem" className="file-menu-danger" onClick={pick(account.open)}>
              Delete account…
            </button>
          )}
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
          if (!appStore.isBackup(text)) return void collab.setNotice('That file isn’t a BusyAnts backup, so nothing was changed.');
          const { ui, boards } = appStore.getState();
          if (!ui.sharesKnown) return void collab.setNotice(keptNotice('loading', appStore.boardName));
          if (!appStore.isFullBackup(text) && !boardRights(ui.shares, boards.open, boards.home).restore) return void collab.setNotice('Only the person who shared this board can restore it.');
          const full = historyFull(appStore);
          const yes = await ask(
            appStore.isFullBackup(text)
              ? { title: 'Replace all your boards with the backup?', body: full ? 'Your boards are too big for Version history, so they can’t be kept there first.' : 'Your boards as they are now are kept in Version history.', action: 'Replace all boards' }
              : { title: 'Replace this board with the backup?', body: full ? 'Your boards are too big for Version history, but Ctrl+Z brings this board back.' : 'This board is kept in Version history first, and Ctrl+Z brings it back.', action: 'Replace board' },
          );
          // Asked about the board open then: if another opened meanwhile (it was deleted elsewhere, say), nothing happens.
          if (!yes || appStore.getState().boards.open !== boards.open) return;
          const kept = await restoreFromBackup(appStore, activeVersionStore(), text);
          const notice = kept && keptNotice(kept, appStore.boardName);
          if (notice) collab.setNotice(notice);
          // Bring the restored board into view once it has been drawn.
          requestAnimationFrame(() => requestAnimationFrame(() => appStore.showWholeBoard()));
        }}
      />
      <input
        ref={importer}
        type="file"
        accept={IMPORT_ACCEPT}
        aria-label="File to import"
        hidden
        onChange={async (e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = ''; // so picking the same file again imports it again
          if (!file) return;
          if (file.size > IMPORT_MAX_BYTES) return void collab.setNotice(TOO_BIG); // before reading it all in
          let source: Awaited<ReturnType<typeof readPdf>> | string;
          if (isPdf(file.name, await file.slice(0, 5).text())) {
            try {
              source = await readPdf(await file.arrayBuffer());
            } catch {
              return void collab.setNotice(CANT_READ); // broken, or locked with a password
            }
          } else source = await file.text();
          const { note } = appStore.importFile(source, file.name);
          if (note) collab.setNotice(note);
        }}
      />
    </div>
  );
}

/**
 * Feedback (owner decision 2026-10-16): its own button, next to File on a computer and a row in
 * ⋯ More on a phone. It opens Send feedback (job #69), offered only when signed in.
 */
export function FeedbackButton({ onOpen }: { onOpen?: () => void }) {
  if (useFeedbackSender() === null) return null;
  return (
    <button
      type="button"
      className="tb-button quiet"
      title="Send feedback"
      onClick={() => {
        onOpen?.();
        feedback.open();
      }}
    >
      <FeedbackIcon />
      Feedback
    </button>
  );
}

/**
 * Color button: recolors the selected columns, and lightly tints the header of the selected cards
 * (cards themselves are always white). Its menu opens even with nothing selected: the swatches and Default
 * are then faded and do nothing, and Auto-color (every column a different color) still works.
 */
export function ColourControl() {
  const count = useAppState((s) => s.ui.selection.length);
  const open = useAppState((s) => s.ui.colourMenuOpen);
  const hasColumns = useAppState((s) => Object.keys(s.board.columns).length > 0);
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
  // On a phone the menu opens inside the ⋯ panel, which scrolls: bring the whole menu into view.
  useEffect(() => {
    if (open && menu.current?.closest('.phone-more')) menu.current.scrollIntoView({ block: 'nearest' });
  }, [open]);
  const named = hovered ?? (current ? swatchFor(current, theme).label : current === null ? 'Default' : '');

  return (
    <div className="colour-control">
      <button
        type="button"
        className="tb-button"
        aria-label="Color of selected cards and containers"
        title={count ? "Color the selected containers, or tint the selected cards' headers" : 'Color menu: select a card or container to color it, or use Auto-color'}
        aria-expanded={open}
        onClick={appStore.toggleColourMenu}
      >
        <span className="colour-dot" aria-hidden="true" style={{ background: shown.bg, borderColor: current ? shown.text : undefined }} />
        <span className="tb-label">Color</span>
        <CaretIcon />
      </button>
      {open && (
        <div ref={menu} className="colour-menu" role="group" aria-label="Colors">
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
              aria-disabled={count ? undefined : true}
              style={{ background: sw.bg, borderColor: key === current ? sw.text : sw.edge, color: sw.text }}
              onClick={() => count && appStore.recolourSelection(key)}
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
          <button
            type="button"
            className="swatch-default"
            aria-pressed={current === null}
            aria-disabled={count ? undefined : true}
            onClick={() => count && appStore.recolourSelection(null)}
          >
            Default
          </button>
          <button
            type="button"
            className="swatch-default"
            title={hasColumns ? 'Give every container a different color' : 'Add a container first'}
            aria-disabled={hasColumns ? undefined : true}
            onClick={() => hasColumns && appStore.autoColour()}
          >
            Auto-color
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Collapse all / Expand all: collapses every card and container, or (when all are collapsed) opens them
 * all. With blocks selected, only those (owner request).
 */
export function CollapseAllButton({ labelled = false }: { labelled?: boolean }) {
  const any = useAppState((s) => Object.values(s.board.cards).some((c) => c.kind !== 'completed') || Object.keys(s.board.columns).length > 0);
  const selected = useAppState((s) => s.ui.selection.length > 0);
  const expand = useAppState((s) => any && !anyExpanded(s.board, s.ui.selection.length ? s.ui.selection : undefined));
  const label = expand ? 'Expand all' : 'Collapse all';
  const title = selected ? `${expand ? 'Expand' : 'Collapse'} the selected cards and containers` : `${label} cards and containers`;
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

/** Same width: the selected loose cards and containers take the first one's width. Faded with fewer than two selected. */
export function SameWidthButton({ labelled = false }: { labelled?: boolean }) {
  const ready = useAppState((s) => s.ui.selection.filter((id) => s.board.order.includes(id)).length >= 2);
  return (
    <button
      type="button"
      className={`tb-button faded-colour quiet${labelled ? '' : ' icon-only'}`}
      aria-label="Same width"
      title={ready ? "Make the selected cards and containers as wide as the first one you selected" : 'Select two or more cards or containers first'}
      aria-disabled={ready ? undefined : true}
      onClick={() => ready && appStore.matchWidths()}
    >
      <SameWidthIcon />
      {labelled && 'Same width'}
    </button>
  );
}

/**
 * Appearance menu (job 112): the Dark mode switch (pressed = dark) and the color themes. Both
 * choices are remembered on this device only. On a computer an icon button opens it under the
 * toolbar; on a phone (`labelled`) it is a row in ⋯ More that opens inside the panel.
 */
export function AppearanceMenu({ labelled = false }: { labelled?: boolean }) {
  const { open, setOpen, wrap, onKeyDown } = usePopover();
  const dark = useAppState((s) => s.view.theme === 'dark');
  const picked = useAppState((s) => s.view.colorTheme);
  return (
    <div className="file-menu-wrap appearance-wrap" ref={wrap} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={`tb-button${labelled ? '' : ' icon-only'}`}
        aria-label="Appearance"
        title="Dark mode and color theme"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <AppearanceIcon />
        {labelled && 'Appearance'}
        {labelled && <CaretIcon />}
      </button>
      {open && (
        <div className="file-menu appearance-menu" role="group" aria-label="Appearance">
          <button type="button" className="tb-button" aria-pressed={dark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={appStore.toggleTheme}>
            <MoonIcon />
            Dark mode
          </button>
          <div className="theme-chips" role="group" aria-label="Color theme">
            {COLOR_THEMES.map((t) => (
              <button key={t.key} type="button" className="theme-chip" aria-label={t.label} aria-pressed={t.key === picked} onClick={() => appStore.setColorTheme(t.key)}>
                <span className="theme-dot" aria-hidden="true" style={{ background: t.dot }} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Clean up: moves every ticked item into the Completed panel. Faded when nothing is ticked. */
export function CleanUpButton({ labelled = false }: { labelled?: boolean }) {
  // An item still easing out to Completed counts as ticked (Clean up applies it first).
  const any = useAppState((s) => hasTickedItems(s.board) || s.ui.completing.length > 0);
  return (
    <button
      type="button"
      className="tb-button faded-colour quiet"
      title={any ? "Move every ticked item into the Completed panel, under today's date" : 'Nothing is ticked yet'}
      aria-disabled={any ? undefined : true}
      onClick={() => any && appStore.cleanUp()}
    >
      {labelled && <ArrangeIcon />}
      Clean up
    </button>
  );
}

/** Hand / Select: what dragging empty board does. */
export function ToolGroup() {
  const tool = useAppState((s) => s.view.tool);
  const keys = useAppState((s) => s.view.hotkeys);
  return (
    <div className="tool-group" role="group" aria-label="Board tool">
      <button
        type="button"
        className="tool-button"
        aria-label={`Hand (${labelOf(keys.hand)})`}
        title={`Hand (${labelOf(keys.hand)}): drag empty space to move the board`}
        aria-pressed={tool === 'hand'}
        onClick={() => appStore.setTool('hand')}
      >
        <HandIcon />
      </button>
      <button
        type="button"
        className="tool-button"
        aria-label={`Select (${labelOf(keys.select)})`}
        title={`Select (${labelOf(keys.select)}): drag a rectangle to select several cards and containers`}
        aria-pressed={tool === 'select'}
        onClick={() => appStore.setTool('select')}
      >
        <SelectIcon />
      </button>
    </div>
  );
}

/**
 * Arrange menu (owner decision 2026-10-16): Snap to grid, Collapse all, Same width and Clean up in
 * one small popover. Clicks inside keep it open (Snap shows its new state); a click elsewhere closes it.
 */
function ArrangeMenu() {
  const { open, setOpen, wrap, onKeyDown } = usePopover();
  return (
    <div className="file-menu-wrap" ref={wrap} onKeyDown={onKeyDown}>
      <button type="button" className="tb-button quiet" aria-expanded={open} title="Snap to grid, collapse, same width, clean up" onClick={() => setOpen((o) => !o)}>
        <ArrangeIcon />
        Arrange
        <CaretIcon />
      </button>
      {open && (
        <div className="file-menu" role="group" aria-label="Arrange">
          <SnapButton />
          <CollapseAllButton labelled />
          <SameWidthButton labelled />
          <CleanUpButton />
        </div>
      )}
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

/** The BusyAnts ant from the app icon (owner request: the toolbar matches the icon). It opens the website's About page in a new tab (job #53). */
function Logo() {
  return (
    <a className="toolbar-logo-link" href={`${import.meta.env.BASE_URL}about/`} target="_blank" rel="noopener noreferrer" aria-label="BusyAnts website" title="BusyAnts website">
      <img className="toolbar-logo" src={`${import.meta.env.BASE_URL}busyants-icon.svg`} alt="" width={30} height={30} />
    </a>
  );
}

function BoardName() {
  const name = useAppState((s) => s.board.name);
  // A board someone shared is renamed only by them (owner request: editing together).
  const canRename = useAppState((s) => boardRights(s.ui.shares, s.boards.open, s.boards.home).rename);
  return (
    <AutoSizeInput
      className="board-name"
      aria-label="Board name"
      placeholder="Untitled board"
      value={name}
      readOnly={!canRename}
      title={!canRename ? 'Only the person who shared this board can rename it' : undefined}
      onChange={appStore.renameBoard}
    />
  );
}

/**
 * ⋯ (owner pick, 2026-10-22): in windows under 1180px wide, Arrange, File, Feedback, Appearance and
 * Sign out fold into this menu, the same rows the phone's ⋯ sheet has. Share stays on the toolbar.
 */
function MoreMenu({ onSignOut }: { onSignOut?: () => void }) {
  const { open, setOpen, wrap, onKeyDown } = usePopover();
  const viewOnly = useViewOnly();
  return (
    <div className="file-menu-wrap" ref={wrap} onKeyDown={onKeyDown}>
      <button type="button" className="tb-button icon-only" aria-label="More" title="More: Arrange, File, Feedback, Appearance, Sign out" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreIcon />
      </button>
      {open && (
        <div className="toolbar-more phone-more" role="dialog" aria-label="More">
          <div className="phone-rows">
            {!viewOnly && <ArrangeMenu />}
            <FileMenu />
            <FeedbackButton onOpen={() => setOpen(false)} />
            <AppearanceMenu labelled />
            {onSignOut && (
              <button type="button" className="tb-button" onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}>
                <SignOutIcon />
                Sign out
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Toolbar({ onSignOut }: { onSignOut?: () => void }) {
  const canUndo = useAppState((s) => s.ui.canUndo);
  const canRedo = useAppState((s) => s.ui.canRedo);
  // Under 1180px the less-used buttons fold into ⋯ (the full toolbar needs about 1160px).
  const folded = useMedia('(max-width: 1179px)');
  // A board shared with this person to view or comment on only (job 161): a badge, and no buttons that change it.
  const viewOnly = useViewOnly();
  // On a phone the top bar only holds the board name; everything else is in the bottom bar (PhoneBar).
  if (usePhone())
    return (
      <header className="toolbar phone">
        <Logo />
        <BoardsMenu labelled={false} />
        <BoardPath />
        <BoardName />
        <RoleBadge />
      </header>
    );

  return (
    <header className="toolbar">
      <Logo />
      <BoardsMenu labelled={false} />
      <BoardPath />
      <BoardName />
      <RoleBadge />
      <div className="toolbar-spacer" />

      {!viewOnly && (
        <>
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
          <span className="toolbar-label">Add</span>

          <AddCardButton kind="note" label="Note" />
          <AddCardButton kind="todo" label="Checklist" />
          <NewColumnButton />

          <div className="toolbar-divider" aria-hidden="true" />
          <ColourControl />
        </>
      )}
      {!folded && (
        <>
          {!viewOnly && <ArrangeMenu />}
          <FileMenu />
          <FeedbackButton />
        </>
      )}

      <div className="toolbar-divider" aria-hidden="true" />
      {!folded && <AppearanceMenu />}
      <ShareButton />
      {folded && <MoreMenu onSignOut={onSignOut} />}

      {onSignOut && !folded && (
        <>
          <div className="toolbar-divider" aria-hidden="true" />
          {/* An icon, so it still fits at the far right of a 1280px window (owner bug report). */}
          <button type="button" className="tb-button icon-only" aria-label="Sign out" title="Sign out" onClick={onSignOut}>
            <SignOutIcon />
          </button>
        </>
      )}
    </header>
  );
}
