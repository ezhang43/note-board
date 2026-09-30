import { COLOR_KEYS, COLUMN_DEFAULT, PALETTE, type ColorKey } from '../model/palette';
import { appStore, useAppState } from '../store/appStore';
import { AutoSizeInput } from './AutoSizeInput';
import { CaretIcon, GridIcon, HandIcon, PlusIcon, RedoIcon, SelectIcon, UndoIcon } from './icons';

/** Colour button: recolours the selected block(s). Faded while nothing is selected. */
function ColourControl() {
  const count = useAppState((s) => s.ui.selection.length);
  const open = useAppState((s) => s.ui.colourMenuOpen && s.ui.selection.length > 0);
  // The colour of the last selected block, shown on the button and ringed in the menu.
  const current = useAppState((s): ColorKey | null | undefined => {
    const id = s.ui.selection[s.ui.selection.length - 1];
    if (!id) return undefined;
    return s.board.columns[id] ? s.board.columns[id].color : s.board.cards[id]?.color;
  });
  const shown = current ? PALETTE[current] : COLUMN_DEFAULT;

  return (
    <div className="colour-control">
      <button
        type="button"
        className="tb-button faded-colour"
        aria-label="Colour of selected block"
        title={count ? 'Change the colour of the selected block' : 'Select a card or column first'}
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

export function Toolbar() {
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

      <div className="toolbar-divider" aria-hidden="true" />
      <span className="toolbar-label">Add</span>

      <button type="button" className="tb-button add-note" onClick={() => appStore.addCard('note')}>
        <span className="add-dot" aria-hidden="true" />
        Note
      </button>
      <button type="button" className="tb-button add-todo" onClick={() => appStore.addCard('todo')}>
        <span className="add-dot" aria-hidden="true" />
        To-do list
      </button>
      <button type="button" className="tb-button add-link" onClick={() => appStore.addCard('link')}>
        <span className="add-dot" aria-hidden="true" />
        Link
      </button>
      <button type="button" className="tb-button add-column" onClick={appStore.addColumn}>
        <PlusIcon />
        New column
      </button>
    </header>
  );
}
