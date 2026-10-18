import { appStore } from '../store/appStore';
import { collab } from '../sync/collabSession';
import { JournalIcon } from './icons';

/**
 * The Journal button (owner request, 2026-10-18): opens the Journal board with today's dated note
 * ready to type in. By the zoom control, or a tile in the ⋯ panel on a phone (`labelled`).
 */
export function JournalButton({ labelled = false, onOpen }: { labelled?: boolean; onOpen?: () => void }) {
  return (
    <button
      type="button"
      className={labelled ? 'tb-button' : 'help-button dock-tool'}
      aria-label="Journal"
      title="Open today’s journal note"
      onClick={() => {
        if (appStore.journal() === 'loading') collab.setNotice('Your shared boards are still loading. Try again in a moment.');
        onOpen?.();
      }}
    >
      <JournalIcon />
      Journal
    </button>
  );
}
