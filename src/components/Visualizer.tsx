import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MONTHS, dayKey } from '../model/calendar';
import { VIZ_DEFAULT_RANGE, VIZ_GROUPS, VIZ_RANGES, cardLines, chartPath, counts, discOf, doneItems, inRange, keepIfSame, loopOrder, perDay, summaryOf, type DoneItem, type VizGroupBy, type VizRange } from '../model/visualizer';
import { makeAiCategorizer, ownBoards, toSend } from '../model/aiCategories';
import { categoryOf } from '../model/categorize';
import { ai, useAiSettings } from '../store/ai';
import { aiLabels } from '../store/aiLabels';
import { appStore, useAppState } from '../store/appStore';
import { collab, useSharing } from '../sync/collabSession';
import { CloseIcon, VisualizerIcon } from './icons';
import { useCoverBoard } from './textField';
import { closeVisualizer, openVisualizer, readCalm, readGroupBy, saveCalm, saveGroupBy, useVisualizerOpen } from './visualizerState';
import { readPalette, startDisc } from './visualizerDraw';
import { VizAiSort } from './VizAiSort';

/**
 * The Visualizer (owner request 2026-11-12): a full-screen, always dark view that loops over what Clean up
 * moved into the Completed panels, oldest to newest. It only reads the boards: nothing here changes, saves
 * or syncs them, and whether it is open is not part of the board either (see visualizerState).
 */

/** Opens the Visualizer: a row in the ⋯ More menu on a computer, a full-width tile in the ⋯ sheet on a phone. */
export function VisualizerButton({ onOpen }: { onOpen?: () => void }) {
  return (
    <button
      type="button"
      className="tb-button viz-open"
      aria-label="Visualizer"
      title="Visualizer: completed items, replayed"
      onClick={() => {
        openVisualizer();
        onOpen?.();
      }}
    >
      <VisualizerIcon />
      Visualizer
    </button>
  );
}

export function Visualizer() {
  return useVisualizerOpen() ? <Overlay /> : null;
}

const RANGE_NOUN: Record<VizRange, string> = { '7': 'Last 7 days', '30': 'Last 30 days', all: 'All time' };
/** How many "Just finished" rows show at once. */
const FEED_ROWS = 7;
const CHART_W = 320;
const CHART_H = 64;

/** "Nov 12" from a day key. */
const shortDay = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}`;

function Overlay() {
  const backdrop = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useCoverBoard(backdrop);
  useEffect(() => dialog.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      closeVisualizer();
    };
    // Captured first and kept to itself, so Escape closes only this and does not also reach the board behind it.
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, []);

  // Always full motion, whatever the system says (owner, 2026-11-13); only the Calm button turns the quiet drawing on.
  const [calm, setCalm] = useState(readCalm);
  const [range, setRange] = useState<VizRange>(VIZ_DEFAULT_RANGE);
  const [group, setGroup] = useState<VizGroupBy>(readGroupBy);
  // The real boards, even while Version history is showing an old one: this is a read, never a write.
  const ws = useSyncExternalStore(appStore.subscribe, appStore.workspace);
  const today = dayKey(new Date());
  const all = useMemo(() => doneItems(ws), [ws]);
  // The same list again when a board change elsewhere (a synced edit) left the finished items as they were, so the loop does not start over.
  const kept = useRef<DoneItem[] | undefined>(undefined);
  const items = useMemo(() => (kept.current = keepIfSame(kept.current, loopOrder(inRange(all, range, today)))), [all, range, today]);
  const numbers = useMemo(() => counts(all, items, today), [all, items, today]);
  // Sort with AI: the labels saved on this device are used only while this person has a key saved.
  useAiSettings();
  useSharing(); // signing in or out redraws, so uid below is current
  const uid = collab.me()?.uid ?? null;
  const hasKey = ai.hasKey(uid);
  const model = ai.getModel();
  const [labelsRev, setLabelsRev] = useState(0);
  // Labels someone else saved (before a sign-out or a change of person) are of no use here: drop them.
  useEffect(() => aiLabels.dropUnlessFor(uid), [uid]);
  const lookup = useMemo(() => (hasKey ? aiLabels.reader(model, uid) : null), [hasKey, model, uid, labelsRev]); // labelsRev: read again once a press ends
  // Only the person's own boards (owner, 2026-11-13): nothing from a board someone else shared with them is sent or labeled.
  const shares = useAppState((s) => s.ui.shares);
  const sharesKnown = useAppState((s) => s.ui.sharesKnown);
  const isOwn = useMemo(() => ownBoards(shares, sharesKnown), [shares, sharesKnown]);
  const categorize = useMemo(() => (lookup ? makeAiCategorizer(items, lookup, isOwn) : categoryOf), [items, lookup, isOwn]);
  const disc = useMemo(() => discOf(items, group, categorize), [items, group, categorize]);
  const pending = useMemo(() => (lookup ? toSend(items, (t) => lookup(t) !== null, isOwn) : null), [items, lookup, isOwn]);
  // The two lines of the small card for each item as it lands (plain text, drawn on the canvas).
  const cards = useMemo(() => items.map((item, i) => cardLines(item, disc.wedges[disc.slots[i]?.wedge]?.name, group)), [items, disc, group]);
  const days = useMemo(() => perDay(items, range, today), [items, range, today]);
  const chart = useMemo(() => chartPath(days, CHART_W, CHART_H), [days]);
  const peak = useMemo(() => days.reduce((best, d) => (d.count > best.count ? d : best), { date: '', count: 0 }), [days]);

  // How far round the loop it is. Only this and the feed re-render; the ring is drawn outside React.
  const [at, setAt] = useState({ landed: 0, loop: 0 });
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let loop = 0;
    setAt({ landed: 0, loop });
    return startDisc({
      canvas: el,
      wedges: disc.wedges,
      slots: disc.slots,
      palette: readPalette(el),
      still: calm,
      cards,
      onLanded: (landed) => {
        if (!landed) loop++;
        setAt({ landed, loop });
      },
    });
  }, [disc, cards, calm]);

  // `at` is from the loop before when the range has just changed (the effect below resets it a moment later), so it can be past the end.
  const landed = Math.min(at.landed, items.length);
  const feed = items.slice(Math.max(0, landed - FEED_ROWS), landed).reverse();
  const nowDay = landed ? days.findIndex((d) => d.date === items[landed - 1].date) : -1;
  const first = days[0];
  const last = days[days.length - 1];

  return (
    <div ref={backdrop} className="viz">
      <section ref={dialog} className="viz-panel" role="dialog" aria-modal="true" aria-label="Visualizer" tabIndex={-1}>
        <div className="viz-stage">
          <canvas ref={canvas} className="viz-canvas" role="img" aria-label={summaryOf(disc.wedges, items.length)} />
          {!items.length && <p className="viz-empty">Nothing cleaned up yet in this range. Tick items and press Clean up.</p>}
        </div>
        <div className="viz-info">
          <div className="viz-controls">
            <div className="viz-range" role="group" aria-label="Range">
              {VIZ_RANGES.map((r) => (
                <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="viz-range" role="group" aria-label="Group by">
              {VIZ_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={group === g.id}
                  onClick={() => {
                    setGroup(g.id);
                    saveGroupBy(g.id);
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="viz-range" role="group" aria-label="Motion">
              <button
                type="button"
                aria-pressed={calm}
                title="Calm: no beams, sparks or cards"
                onClick={() => {
                  setCalm(!calm);
                  saveCalm(!calm);
                }}
              >
                Calm
              </button>
            </div>
          </div>
          {pending && group === 'category' && (
            <VizAiSort
              uid={uid}
              model={model}
              texts={pending.texts}
              total={pending.total}
              loading={!sharesKnown}
              known={disc.wedges.filter((w) => w.key.startsWith('ai:')).map((w) => w.name)}
              onSorted={() => setLabelsRev((n) => n + 1)}
            />
          )}
          <dl className="viz-counts">
            {(
              [
                ['Done today', numbers.today],
                ['This week', numbers.week],
                [RANGE_NOUN[range], numbers.inRange],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="viz-count">
                <dt className="viz-count-label">{label}</dt>
                <dd className="viz-count-number">{n}</dd>
              </div>
            ))}
          </dl>
          <div className="viz-chart">
            <h3>Done per day</h3>
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H + 8}`} preserveAspectRatio="none" role="img" aria-label={peak.count ? `Done per day, ${shortDay(first.date)} to ${shortDay(last.date)}. Most: ${peak.count} on ${shortDay(peak.date)}.` : 'Done per day: nothing yet.'}>
              <g transform="translate(0 4)">
                <line className="viz-chart-base" x1="0" x2={CHART_W} y1={CHART_H} y2={CHART_H} />
                {chart.area && <path className="viz-chart-area" d={chart.area} />}
                {chart.line && <path className="viz-chart-line" d={chart.line} />}
                {nowDay >= 0 && chart.line && <line className="viz-chart-now" x1={chart.x(nowDay)} x2={chart.x(nowDay)} y1="0" y2={CHART_H} />}
              </g>
            </svg>
            {first && last && first !== last && (
              <p className="viz-chart-dates">
                <span>{shortDay(first.date)}</span>
                <span>{shortDay(last.date)}</span>
              </p>
            )}
          </div>
          <div className="viz-feed-wrap">
            <h3>Just finished</h3>
            <ul className="viz-feed">
              {feed.map((item, i) => {
                const index = landed - 1 - i;
                return (
                  <li key={`${at.loop}-${index}`}>
                    <span className="viz-feed-text">{item.text || 'Untitled item'}</span>
                    <span className="viz-feed-where">
                      {[group === 'category' ? disc.wedges[disc.slots[index]?.wedge]?.name : undefined, item.list, item.boardName].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <button type="button" className="viz-close" aria-label="Close" title="Close (Escape)" onClick={closeVisualizer}>
          <CloseIcon />
        </button>
      </section>
    </div>
  );
}
