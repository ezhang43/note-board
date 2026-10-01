import { useRef } from 'react';
import { hasTickedItems } from '../model/completed';
import { COLOR_KEYS, COLUMN_DEFAULT, PALETTE, type ColorKey } from '../model/palette';
import type { CardKind } from '../model/types';
import { useNewCardDrag } from './useNewCardDrag';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { CaretIcon, GridIcon, HandIcon, PlusIcon, RedoIcon, SelectIcon, UndoIcon } from './icons';

/** Add Note / To-do list / Link: click to add, or press and drag onto the board to place it. */
function AddCardButton({ kind, label }: { kind: CardKind; label: string }) {
  const drag = useNewCardDrag(kind);
  return (
    <button type="button" className={`tb-button add-${kind}`} title={`Click to add a ${label.toLowerCase()}, or drag it onto the board`} {...drag}>
      <span className="add-dot" aria-hidden="true" />
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

/** Import: pick a Milanote board exported as Markdown; its cards are added to this board. */
function ImportButton() {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="tb-button"
        title="Add the cards from a Milanote board exported as Markdown (.md)"
        onClick={() => input.current?.click()}
      >
        Import
      </button>
      <input
        ref={input}
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
    </>
  );
}

/** Colour button: recolours the selected column(s). Faded while no column is selected (cards are always white). */
function ColourControl() {
  const count = useAppState((s) => s.ui.selection.filter((id) => s.board.columns[id]).length);
  const open = useAppState((s) => s.ui.colourMenuOpen && count > 0);
  // The colour of the last selected column, shown on the button and ringed in the menu.
  const current = useAppState((s): ColorKey | null | undefined => {
    const id = s.ui.selection.filter((x) => s.board.columns[x]).pop();
    return id ? s.board.columns[id].color : undefined;
  });
  const shown = current ? PALETTE[current] : COLUMN_DEFAULT;

  return (
    <div className="colour-control">
      <button
        type="button"
        className="tb-button faded-colour"
        aria-label="Colour of selected block"
        title={count ? 'Change the colour of the selected column' : 'Select a column first'}
        aria-disabled={count ? undefined : true}
        aria-expanded={open}
        onClick={appStore.toggleColourMenu}
      >
        <span className="colour-dot" aria-hidden="true" style={{ background: shown.bg, borderColor: current ? shown.text : undefined }} />
        Colour
        <CaretIcon />
      </button>
      {open && (
        <div className="colour-menu" role="group" aria-label="Colours">
          {COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="swatch"
              aria-label={PALETTE[key].label}
              title={PALETTE[key].label}
              aria-pressed={key === current}
              style={{ background: PALETTE[key].bg, borderColor: key === current ? PALETTE[key].text : PALETTE[key].edge, color: PALETTE[key].text }}
              onClick={() => appStore.recolourSelection(key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Clean up: moves every ticked item into the Completed card. Faded when nothing is ticked. */
function CleanUpButton() {
  const any = useAppState((s) => hasTickedItems(s.board));
  return (
    <button
      type="button"
      className="tb-button faded-colour"
      title={any ? "Move every ticked item into the Completed card, under today's date" : 'Nothing is ticked yet'}
      aria-disabled={any ? undefined : true}
      onClick={() => any && appStore.cleanUp()}
    >
      Clean up
    </button>
  );
}

/** Auto-colour: gives every column a different colour. Faded when there are no columns. */
function AutoColourButton() {
  const hasColumns = useAppState((s) => Object.keys(s.board.columns).length > 0);
  return (
    <button
      type="button"
      className="tb-button faded-colour"
      title={hasColumns ? 'Give every column a different colour' : 'Add a column first'}
      aria-disabled={hasColumns ? undefined : true}
      onClick={() => hasColumns && appStore.autoColour()}
    >
      Auto-colour
    </button>
  );
}

export function Toolbar({ onSignOut }: { onSignOut?: () => void }) {
  const name = useAppState((s) => s.board.name);
  const snap = useAppState((s) => s.board.snap);
  const tool = useAppState((s) => s.view.tool);
  const canUndo = useAppState((s) => s.ui.canUndo);
  const canRedo = useAppState((s) => s.ui.canRedo);

  return (
    <header className="toolbar">
      <AutoSizeInput
        className="board-name"
        aria-label="Board name"
        placeholder="Untitled board"
        value={name}
        onChange={appStore.renameBoard}
      />
      <div className="toolbar-spacer" />

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
          title="Select (V): drag a rectangle to select several blocks"
          aria-pressed={tool === 'select'}
          onClick={() => appStore.setTool('select')}
        >
          <SelectIcon />
        </button>
      </div>

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

      <button type="button" className="tb-button snap" aria-pressed={snap} onClick={appStore.toggleSnap}>
        <GridIcon />
        Snap to grid
      </button>

      <ColourControl />
      <AutoColourButton />

      <div className="toolbar-divider" aria-hidden="true" />
      <span className="toolbar-label">Add</span>

      <AddCardButton kind="note" label="Note" />
      <AddCardButton kind="todo" label="To-do list" />
      <AddCardButton kind="link" label="Link" />
      <NewColumnButton />
      <ImportButton />
      <CleanUpButton />

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
