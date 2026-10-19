import { useEffect } from 'react';
import { addressFromTransfer } from '../model/media';
import { appStore } from '../store/appStore';
import { clientToBoard } from './canvasDom';
import { isTextField, panelCovers } from './textField';
import { toast } from './useShortcuts';

const NO_FILES = 'Images from your computer can’t be added yet. Paste a web address instead.';

// An old version being looked at, and the Journal and Habits panels: keys in the panels never act on the board behind them, even when focus is on the page itself; nor does a paste.
const inJournalOrHabits = () => {
  const { sidePanel, preview } = appStore.getState().ui;
  return preview !== null || sidePanel === 'journal' || sidePanel === 'habits';
};

/**
 * A web address pasted or dropped on the board becomes a link card (job 124). Nothing is uploaded:
 * a picture or video is shown from its address (CardView). A file from the computer only gets a
 * friendly note. Typing in a text field, the side panels and old versions are left alone. The
 * board's own copy and paste handles its keys first (useShortcuts), so it wins over an address.
 */
export function useDropPaste() {
  useEffect(() => {
    const free = (target: EventTarget | null) =>
      !isTextField(target) && !panelCovers() && !(target instanceof Element && target.closest('.side-panel')) && !inJournalOrHabits();
    const get = (dt: DataTransfer) => (type: string) => dt.getData(type);
    const hasFile = (dt: DataTransfer) => dt.files.length > 0 || [...dt.items].some((i) => i.kind === 'file');

    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt || !free(e.target)) return;
      const address = addressFromTransfer(get(dt));
      if (address) appStore.addLinkCard(address);
      else if (hasFile(dt)) toast(NO_FILES);
      else return;
      e.preventDefault();
    };
    // Only the board is a drop target; elsewhere (and over a text field) the browser does what it always did.
    const onBoard = (e: DragEvent) => !!e.dataTransfer && free(e.target) && e.target instanceof Element && e.target.closest('[data-testid="canvas"]') !== null;
    const onDragOver = (e: DragEvent) => {
      const types = e.dataTransfer?.types ?? [];
      if (onBoard(e) && ['Files', 'text/uri-list', 'text/plain'].some((t) => types.includes(t))) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (!dt || !onBoard(e)) return;
      const address = addressFromTransfer(get(dt));
      if (address) appStore.addLinkCard(address, clientToBoard(e.clientX, e.clientY), (e.target as Element).closest<HTMLElement>('[data-col-id]')?.dataset.colId);
      else if (hasFile(dt)) toast(NO_FILES);
      else return;
      e.preventDefault();
    };
    document.addEventListener('paste', onPaste);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, []);
}
