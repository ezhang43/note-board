import { useEffect, useRef, useState } from 'react';
import { AI_MAX_PER_PRESS } from '../model/aiCategories';
import { ai, askClaude } from '../store/ai';
import { aiLabels, sortWithAi } from '../store/aiLabels';

// "Sort with AI" in the Visualizer (owner request, 2026-11-13): shown only while a key is saved (the
// Visualizer decides). Nothing is sent until the button is pressed. The hint says exactly what goes: only items
// from the person's own boards, never from a board shared with them (owner, 2026-11-13; see toSend).

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; sorted: number; of: number }
  | { kind: 'done'; sorted: number }
  | { kind: 'stopped' }
  | { kind: 'error'; message: string };

const items = (n: number) => `${n} finished ${n === 1 ? 'item' : 'items'}`;

export function VizAiSort({
  uid,
  model,
  texts,
  total,
  loading,
  known,
  onSorted,
}: {
  uid: string | null;
  model: string;
  /** What one press sends (see toSend). */
  texts: string[];
  /** How many still need a label, before the per-press cut. */
  total: number;
  /** The shares are not known yet, so no board counts as own and nothing can be sent. */
  loading: boolean;
  /** The AI category names already on the disc. */
  known: string[];
  /** After a press ends (done, stopped or failed): the disc picks up the labels saved. */
  onSorted: () => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const stop = useRef<AbortController | null>(null);
  // Closing the Visualizer stops a sort still running.
  useEffect(() => () => stop.current?.abort(), []);

  const start = async () => {
    const run = new AbortController();
    stop.current = run;
    const key = ai.getKey(uid);
    // Stopped as soon as the key or the model changes (forgotten here or in another tab, signed out, another model).
    const stillValid = () => ai.getKey(uid) === key && ai.getModel() === model;
    const off = ai.subscribe(() => !stillValid() && run.abort());
    setStatus({ kind: 'running', sorted: 0, of: texts.length });
    const r = await sortWithAi({
      ask: askClaude,
      cache: aiLabels,
      uid,
      model,
      texts,
      known,
      signal: run.signal,
      stillValid,
      onProgress: (sorted) => setStatus({ kind: 'running', sorted, of: texts.length }),
    });
    off();
    if (stop.current !== run) return;
    stop.current = null;
    setStatus(r.ok ? { kind: 'done', sorted: r.sorted } : r.kind === 'cancelled' ? { kind: 'stopped' } : { kind: 'error', message: r.message });
    onSorted();
  };

  const running = status.kind === 'running';
  const hint = loading
    ? 'Waiting for your shared boards to load, so that only items from your own boards are sent.'
    : !total
      ? 'Every item from your own boards is sorted. The labels stay on this device.'
      : `Sends the text of ${items(texts.length)} from your own boards to Anthropic with your key: no board names, lists or notes, and nothing from boards shared with you.${total > texts.length ? ` The first ${AI_MAX_PER_PRESS} of ${total} now; press again for the rest.` : ''}`;

  return (
    <div className="viz-ai">
      <div className="viz-ai-row">
        {running ? (
          <button type="button" className="viz-ai-button" onClick={() => stop.current?.abort()}>
            Cancel
          </button>
        ) : (
          <button type="button" className="viz-ai-button" disabled={!total || loading} onClick={start}>
            Sort with AI
          </button>
        )}
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
