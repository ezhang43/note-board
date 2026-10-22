import { useEffect, useState } from 'react';
import { createBoard } from '../model/board';
import { boardRights, keptNotice } from '../model/sharing';
import { readWorkspace } from '../model/workspace';
import { dayLabel, describeVersion, groupByDay, type VersionMeta } from '../model/versions';
import { appStore, useAppState } from '../store/appStore';
import { activeVersionStore, restoreVersion, TOO_BIG_RESTORE } from '../store/versions';
import { collab } from '../sync/collabSession';
import { CloseIcon } from './icons';
import { escapeIsForPanel } from './textField';
import { usePhone } from './usePhone';

const timeOf = (savedAt: number) => new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

type Loaded = { status: 'loading' } | { status: 'ready'; versions: VersionMeta[] } | { status: 'error'; message: string };

function problem(e: unknown) {
  return (e as { code?: string }).code === 'permission-denied'
    ? 'Version history isn’t switched on yet: the Firebase rules need the update in firestore.rules.'
    : 'Couldn’t load the version history. Check your connection and try again.';
}

/** Counts the versions asked for; a version that arrives after a later click, "Current version" or closing is dropped. */
let asked = 0;

/** Back to the current board, also for a version still loading. */
function back() {
  asked++;
  appStore.endPreview();
}

/**
 * Show version `meta` on the board, read-only: the open board as it was then (empty if it didn't
 * exist yet; restoring then only brings back boards deleted since).
 */
async function look(meta: VersionMeta, onError: (message: string) => void) {
  const mine = ++asked;
  const from = appStore.getState().boards.open;
  const data = await activeVersionStore()
    ?.get(meta.id)
    .catch(() => null);
  if (mine !== asked || !appStore.getState().ui.historyOpen || appStore.getState().boards.open !== from) return;
  const got = data ? readWorkspace(data) : null;
  const open = appStore.getState().boards.open;
  // A version from before there were several boards is of the home board.
  const board = got && (got.legacy ? Object.values(got.ws.boards)[0] : (got.ws.boards[open] ?? { ...createBoard(), name: appStore.boardName(open) }));
  if (board) appStore.previewVersion(meta, board);
  else onError('That version couldn’t be opened.');
}

/**
 * Version history (owner request, like Google Docs): earlier versions of the board by day, newest
 * first. Picking one shows it on the board, read-only, with a bar to restore it or go back. On a
 * computer the list stays at the side; on a phone it fills the screen and steps aside while looking.
 */
export function HistoryPanel() {
  const open = useAppState((s) => s.ui.historyOpen);
  const preview = useAppState((s) => s.ui.preview);
  const phone = usePhone();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoaded({ status: 'loading' });
    const store = activeVersionStore();
    if (!store) return setLoaded({ status: 'error', message: problem(null) });
    store.list().then(
      (versions) => live && setLoaded({ status: 'ready', versions }),
      (e) => live && setLoaded({ status: 'error', message: problem(e) }),
    );
    return () => {
      live = false;
    };
  }, [open]);

  // Escape: back to the current board first, then close the history (not one meant for something
  // else: see escapeIsForPanel). Capture, like SidePanel: seen before the shortcuts list closes on it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const looking = appStore.getState().ui.preview !== null;
      if (!escapeIsForPanel(e, looking)) return;
      if (looking) back();
      else appStore.toggleHistory();
    };
    window.addEventListener('keydown', onKey, true);
    // Closing the history in any way drops a version still loading.
    return () => {
      window.removeEventListener('keydown', onKey, true);
      asked++;
    };
  }, [open]);

  if (!open || (phone && preview)) return null;
  const now = Date.now();
  return (
    <aside className="history-panel" aria-label="Version history">
      <header className="history-head">
        <h2>Version history</h2>
        <button type="button" className="icon-button" aria-label="Close version history" title="Close (Esc)" onClick={appStore.toggleHistory}>
          <CloseIcon />
        </button>
      </header>
      <button type="button" className="history-row" aria-pressed={!preview} onClick={back}>
        <span className="history-time">Current version</span>
        <span className="history-detail">What’s on the board now</span>
      </button>
      {loaded.status === 'loading' && <p className="history-note">Loading…</p>}
      {loaded.status === 'error' && <p className="history-note">{loaded.message}</p>}
      {loaded.status === 'ready' && !loaded.versions.length && (
        <p className="history-note">No earlier versions yet. One is saved whenever you start editing after 10 minutes away.</p>
      )}
      {loaded.status === 'ready' &&
        groupByDay(loaded.versions, now).map((group) => (
          <section key={group.label} className="history-day" aria-label={group.label}>
            <h3>{group.label}</h3>
            {group.versions.map((v) => (
              <button
                key={v.id}
                type="button"
                className="history-row"
                aria-pressed={preview?.meta.id === v.id}
                onClick={() => look(v, (message) => setLoaded({ status: 'error', message }))}
              >
                <span className="history-time">{timeOf(v.savedAt)}</span>
                <span className="history-detail">{describeVersion(v)}</span>
              </button>
            ))}
          </section>
        ))}
    </aside>
  );
}

/** The bar shown while looking at an earlier version: what it is, Restore, and Back. */
export function PreviewBar() {
  const preview = useAppState((s) => s.ui.preview);
  const canRestore = useAppState((s) => boardRights(s.ui.shares, s.boards.open, s.boards.home).restore);
  const [busy, setBusy] = useState(false);
  // Which version a restore failed on, and why: the message belongs to it, not to the next one looked at.
  const [failed, setFailed] = useState({ on: '', why: '' });
  const shown = preview?.meta.id;
  useEffect(() => setFailed({ on: '', why: '' }), [shown]);
  if (!preview) return null;
  const { meta } = preview;
  const restore = async () => {
    const store = activeVersionStore();
    if (!store || busy) return;
    setBusy(true);
    setFailed({ on: '', why: '' });
    try {
      // Offline, the boards from before are saved once back online; if that fails, say so.
      const kept = await restoreVersion(appStore, store, meta.id, Date.now, () =>
        collab.setNotice('The boards from before your restore couldn’t be saved in Version history.'),
      );
      const notice = keptNotice(kept, appStore.boardName);
      if (notice) collab.setNotice(notice);
    } catch (e) {
      setFailed({ on: meta.id, why: e instanceof Error && e.message === TOO_BIG_RESTORE ? TOO_BIG_RESTORE : 'Couldn’t restore it. Try again.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="preview-bar" role="region" aria-label="Looking at an earlier version">
      <p>
        <strong>
          {dayLabel(meta.savedAt, Date.now())}, {timeOf(meta.savedAt)}
        </strong>{' '}
        · {describeVersion(meta)}
        {failed.on === meta.id && <span className="preview-error"> · {failed.why}</span>}
      </p>
      <div className="preview-actions">
        <button type="button" className="tb-button" onClick={back}>
          Back to current
        </button>
        {canRestore ? (
          <button type="button" className="tb-button add-column" aria-busy={busy} onClick={restore}>
            Restore this version
          </button>
        ) : (
          <span className="preview-note">Only the person who shared this board can restore it.</span>
        )}
      </div>
    </section>
  );
}
