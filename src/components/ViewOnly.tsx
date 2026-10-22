import { useState } from 'react';
import { useAppState } from '../store/appStore';
import type { ShareInfo } from '../store/store';
import { useNotice } from '../sync/collabSession';
import { CloseIcon, CommentIcon, EyeIcon } from './icons';

// A board shared with this person to view or comment on only (job 161): a badge beside its name,
// and a note the first time, until they close it. Nothing on it can be changed (the store refuses it).

/** The open board's share, when this person may only view or comment on it. */
function useReadOnlyShare(): ShareInfo | null {
  return useAppState((s) => s.ui.shares.find((x) => (x.role === 'view' || x.role === 'comment') && x.boards.includes(s.boards.open)) ?? null);
}

const ownerName = (share: ShareInfo) => share.people.find((p) => p.uid === share.ownerUid)?.name ?? 'the person who shared it';

export function RoleBadge() {
  const share = useReadOnlyShare();
  if (!share) return null;
  const view = share.role === 'view';
  const can = view ? 'look at this board but not change it' : 'look at this board and comment on its cards, but not change it';
  return (
    <span className="role-badge" title={`You can ${can}. Ask ${ownerName(share)} if something needs changing.`}>
      {view ? <EyeIcon /> : <CommentIcon />}
      {view ? 'View only' : 'Can comment'}
    </span>
  );
}

/** Where closing the note is remembered on this device, for share `id`. */
const seenKey = (id: string) => `note-board:view-only-note:${id}`;

function seen(id: string) {
  try {
    return localStorage.getItem(seenKey(id)) === '1';
  } catch {
    return false;
  }
}

/** The note under the toolbar, shown on a read-only board until closed (one per shared board, kept on this device). Waits while another note shows. */
export function ViewOnlyNote() {
  const share = useReadOnlyShare();
  const notice = useNotice();
  const [, closed] = useState(0);
  if (!share || notice || seen(share.id)) return null;
  const can = share.role === 'view' ? 'view this board' : 'view this board and comment on its cards';
  return (
    <p className="notice-banner" role="status">
      You can {can}. Ask {ownerName(share)} if you need to change something.
      <button
        type="button"
        className="icon-button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem(seenKey(share.id), '1');
          } catch {
            // Storage blocked: it shows again next time.
          }
          closed((n) => n + 1);
        }}
      >
        <CloseIcon />
      </button>
    </p>
  );
}
