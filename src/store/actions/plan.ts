import { draftCards, type Draft } from '../../model/brainDump';
import type { StoreContext } from '../core';
import { addCardsInLanes } from './blocks';

// The Brain dump (wow plan, job 3): messy typed or pasted lines become cards. The text is read by the model's
// parseBrainDump; the dialog shows the preview; these actions open and close it and add the cards.

export function planActions(ctx: StoreContext) {
  return {
    /** Opens the Brain dump. Not on a board that may only be viewed. */
    openBrainDump() {
      if (ctx.viewOnly()) return;
      ctx.updateUi({ brainDumpOpen: true });
    },
    closeBrainDump() {
      ctx.updateUi({ brainDumpOpen: false });
    },
    /** Opens the AI settings (the person's own key, model and monthly cap). Open to anyone, also on a board that may only be viewed: it changes no board. */
    openAiSettings() {
      ctx.updateUi({ aiSettingsOpen: true });
    },
    closeAiSettings() {
      ctx.updateUi({ aiSettingsOpen: false });
    },
    /** What is typed in the box. Kept while the dialog is closed (so a stray Escape loses nothing), and gone with this person's session. */
    setBrainDumpText(text: string) {
      ctx.updateUi({ brainDumpText: text });
    },
    /**
     * Adds a card for each draft to the open board, packed near the view and selected, as one undo step (the
     * same lanes as Import file). Returns how many were added: none on a board that may only be viewed.
     */
    addBrainDump(drafts: Draft[]): number {
      if (!drafts.length || ctx.viewOnly()) return 0;
      addCardsInLanes(ctx, draftCards(drafts));
      ctx.updateUi({ brainDumpText: '' });
      return drafts.length;
    },
  };
}
