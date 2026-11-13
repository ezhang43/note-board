import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { AI_MAX_PER_PRESS, autoSortDue, type AiEntry } from '../model/aiCategories';
import { ai, askClaude } from '../store/ai';
import { LABELS_MAX, aiLabels, sortWithAi } from '../store/aiLabels';
import { readAutoSort, saveAutoSort } from './visualizerState';

// "Sort with AI" in the Visualizer (owner request, 2026-11-13): shown only while a key is saved and By category
// shows (the Visualizer decides). With "Sort automatically" on (the default, job "viz-ai-autosort") it runs by
// itself once per open per person, model and range (autoSortDue), exactly as a press would, but only when the
// labels can be kept (aiLabels.room), so the same items are never sent and billed again; with it off nothing is
// sent until the button is pressed. The hint says exactly what goes: only items from the person's own boards,
// never from a board shared with them (owner, 2026-11-13; see toSend).

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; sorted: number; of: number }
  | { kind: 'done'; sorted: number }
  | { kind: 'stopped' }
  | { kind: 'error'; message: string };

const NOT_SENT = 'no board names, lists or notes, and nothing from boards shared with you.';
// A sub-item goes with the text of the item it sat under, as context (coordinator request 2026-11-13); that item may not be ticked itself.
const WITH_PARENT = ' (a sub-item with the text of the item it is under)';
const items = (n: number) => `${n} finished ${n === 1 ? 'item' : 'items'}`;
/** Why Sort automatically did not send (aiLabels.room): said in the hint instead of what it sends. */
const PAUSED = {
  'cant-save': "Can't save sorted labels on this device, so Sort automatically is paused.",
  full: `Sort automatically is paused: this device keeps at most ${LABELS_MAX.toLocaleString('en-US')} sorted labels.`,
} as const;

export function VizAiSort({
  uid,
  model,
  entries,
  total,
  loading,
  known,
  range,
  tried,
  onSorted,
}: {
  uid: string | null;
  model: string;
  /** What one press sends (see toSend). */
  entries: AiEntry[];
  /** How many still need a label, before the per-press cut. */
  total: number;
  /** The shares are not known yet, so no board counts as own and nothing can be sent. */
  loading: boolean;
  /** The AI category names already on the disc. */
  known: string[];
  /** The range showing: Sort automatically runs once per open for each (and for each person and model). */
  range: string;
  /** What has already run in this open, pressed or automatic, even if cut short (the Visualizer keeps it, so it outlives By board and back). */
  tried: MutableRefObject<Set<string>>;
  /** After a press ends (done, stopped or failed): the disc picks up the labels saved. */
  onSorted: () => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [auto, setAuto] = useState(readAutoSort);
  // Why Sort automatically did not send, for which run key.
  const [paused, setPaused] = useState<{ run: string; why: keyof typeof PAUSED } | null>(null);
  // The sort running, and whether Sort automatically started it (then unticking the box stops it, as Cancel does).
  const stop = useRef<{ run: AbortController; auto: boolean } | null>(null);
  // What a run is counted under in `tried`: the person, the model and the range.
  const runKey = `${uid ?? ''}\u0000${model}\u0000${range}`;
  // Closing the Visualizer (or switching to By board) stops a sort still running. It still counts as run (marked
  // when it started), so coming back to By category in the same open does not send that batch again.
  useEffect(() => () => stop.current?.run.abort(), []);

  const start = async (byItself: boolean) => {
    const run = new AbortController();
    stop.current = { run, auto: byItself };
    // A press counts too, so ticking Sort automatically afterwards does not send the same range again.
    tried.current.add(runKey);
    const key = ai.getKey(uid);
    // Stopped as soon as the key or the model changes (forgotten here or in another tab, signed out, another model).
    const stillValid = () => ai.getKey(uid) === key && ai.getModel() === model;
    const off = ai.subscribe(() => !stillValid() && run.abort());
    setStatus({ kind: 'running', sorted: 0, of: entries.length });
    const r = await sortWithAi({
      ask: askClaude,
      cache: aiLabels,
      uid,
      model,
      entries,
      known,
      signal: run.signal,
      stillValid,
      onProgress: (sorted) => setStatus({ kind: 'running', sorted, of: entries.length }),
    });
    off();
    if (stop.current?.run !== run) return;
    stop.current = null;
    if (!r.ok && r.kind === 'storage') setPaused({ run: runKey, why: 'cant-save' });
    setStatus(r.ok ? { kind: 'done', sorted: r.sorted } : r.kind === 'cancelled' ? { kind: 'stopped' } : { kind: 'error', message: r.message });
    onSorted();
  };

  const running = status.kind === 'running';
  // Sort automatically: the same start as a press, once the labels it brings back can be kept. Started on the
  // next tick (start marks it tried), so React's development double run (mount, unmount, mount) neither stops it
  // nor skips it. Not marked tried when paused, so a later open (or this row shown again) checks again.
  useEffect(() => {
    if (!autoSortDue({ auto, loading, running, total, run: runKey, tried: tried.current })) return;
    const t = setTimeout(() => {
      const room = aiLabels.room(entries.length, uid);
      if (room !== 'ok') return setPaused({ run: runKey, why: room });
      setPaused(null);
      void start(true);
    });
    return () => clearTimeout(t);
    // start and entries are left out on purpose: new each render; these are what decide a run.
  }, [auto, loading, running, total, runKey, tried]);

  // Said only when a sub-item is among what goes, so the hint stays exact.
  const withParent = entries.some((e) => e.parent !== undefined) ? WITH_PARENT : '';
  const rest = total > entries.length ? ` The first ${AI_MAX_PER_PRESS} of ${total} now; press again for the rest.` : '';
  const pausedWhy = auto && paused?.run === runKey ? paused.why : null;
  const hint = loading
    ? 'Waiting for your shared boards to load, so that only items from your own boards are sent.'
    : !total
      ? 'Nothing left to sort from your own boards. The labels stay on this device.'
      : pausedWhy
        ? `${PAUSED[pausedWhy]} Sort with AI sends the text of ${items(entries.length)} from your own boards to Anthropic with your key${withParent}: ${NOT_SENT}${rest}${pausedWhy === 'full' ? ' The oldest labels are then dropped, and may be sent again later.' : ''}`
        : !auto
          ? `Sends the text of ${items(entries.length)} from your own boards to Anthropic with your key${withParent}: ${NOT_SENT}${rest}`
          : !tried.current.has(runKey)
            ? `Sorts automatically when opened: sends the text of ${items(entries.length)} from your own boards to Anthropic with your key${withParent}: ${NOT_SENT}${total > entries.length ? ` The first ${AI_MAX_PER_PRESS} of ${total} now; press Sort with AI for the rest.` : ''}`
            : // Already run in this range and open: it will not send again by itself until the next open, so say what a press does.
              `Sorts automatically when opened: sends the text of finished items from your own boards to Anthropic with your key${withParent}: ${NOT_SENT} Press Sort with AI to send ${items(entries.length)} still waiting${total > entries.length ? ` (the first ${AI_MAX_PER_PRESS} of ${total})` : ''}.`;

  return (
    <div className="viz-ai">
      <div className="viz-ai-row">
        {running ? (
          <button type="button" className="viz-ai-button" onClick={() => stop.current?.run.abort()}>
            Cancel
          </button>
        ) : (
          <button type="button" className="viz-ai-button" disabled={!total || loading} onClick={() => void start(false)}>
            Sort with AI
          </button>
        )}
        <label className="viz-ai-auto">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              saveAutoSort(e.target.checked);
              // Unticking stops a sort Sort automatically started, as Cancel does (a pressed one keeps going).
              if (!e.target.checked && stop.current?.auto) stop.current.run.abort();
            }}
          />
          <span>Sort automatically</span>
        </label>
        <p className="viz-ai-status" role="status">
          {status.kind === 'running' ? `Sorting… ${status.sorted} of ${status.of}` : status.kind === 'done' ? `Sorted ${items(status.sorted)}.` : status.kind === 'stopped' ? 'Stopped.' : ''}
        </p>
      </div>
      {status.kind === 'error' && (
        <p className="viz-ai-error" role="alert">
          {status.message}
        </p>
      )}
      {!running && <p className="viz-ai-hint">{hint}</p>}
    </div>
  );
}
