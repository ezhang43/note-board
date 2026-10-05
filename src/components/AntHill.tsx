import { useEffect, useRef, useState } from 'react';
import { FLAG_FOOT, HILL_PATH, HILL_VIEW, TRAIL_PATH, antClimb, trailPoint } from '../model/antHill';
import { reducedMotion } from '../store/env';

/**
 * The ant hill at the top of the Completed card (owner request): the ant stands as far up the
 * trail as the items cleaned up so far take it. When more arrive it walks up slowly.
 */
export function AntHill({ count }: { count: number }) {
  const climb = antClimb(count);
  const { value, moving } = useWalk(climb.step / climb.steps, climb.hill);
  const at = trailPoint(value);
  const label = climb.atTop ? `Ant at the top of hill ${climb.hill}` : `Ant on hill ${climb.hill}: ${climb.step} of ${climb.steps} steps to the top`;
  return (
    <div className="ant-hill" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${HILL_VIEW.w} ${HILL_VIEW.h}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <path className="hill-ground" d={HILL_PATH} />
        <path className="hill-trail" d={TRAIL_PATH} />
        <g className={`hill-flag${climb.atTop ? ' reached' : ''}`}>
          <path className="hill-flag-pole" d={`M${FLAG_FOOT.x} ${FLAG_FOOT.y} V${FLAG_FOOT.y - 20}`} />
          <path className="hill-flag-cloth" d={`M${FLAG_FOOT.x} ${FLAG_FOOT.y - 20} l13 4 l-13 4 Z`} />
        </g>
        <g className={`hill-ant${moving ? ' walking' : ''}`} transform={`translate(${at.x} ${at.y}) rotate(${at.angle})`}>
          <AntArt />
        </g>
      </svg>
      <span className="hill-caption" aria-hidden="true">
        {climb.atTop ? `Top of hill ${climb.hill}!` : `Hill ${climb.hill} · ${climb.step} of ${climb.steps}`}
      </span>
    </div>
  );
}

/** The BusyAnts ant from the app icon, facing right, about 15 wide, its feet at 0,0. */
function AntArt() {
  return (
    <g transform="scale(-0.045 0.045) translate(-300 -396)">
      <g className="hill-ant-legs" fill="none" strokeWidth={20} strokeLinecap="round">
        <path d="M250 334 L240 380 M292 338 L298 384 M346 362 L364 400" />
      </g>
      <g className="hill-ant-body">
        <path d="M160 160 Q150 112 116 96 M214 156 Q228 108 264 94" fill="none" strokeWidth={14} strokeLinecap="round" />
        <circle cx="114" cy="94" r="16" />
        <circle cx="266" cy="92" r="16" />
        <circle cx="350" cy="306" r="76" />
        <circle cx="268" cy="300" r="34" />
        <circle cx="186" cy="244" r="94" />
      </g>
    </g>
  );
}

/**
 * Walks `target` (0 = foot, 1 = top) from where the ant is, slowly: about a second plus a quarter
 * second per tenth of the hill, at most three seconds. On another hill (or with reduced motion,
 * or when first shown) it is there at once, so the ant never slides back down a hill.
 */
function useWalk(target: number, hill: number): { value: number; moving: boolean } {
  const [value, setValue] = useState(target);
  const [moving, setMoving] = useState(false);
  const now = useRef(target);
  const onHill = useRef(hill);
  useEffect(() => {
    const from = now.current;
    if (onHill.current !== hill || reducedMotion() || from === target) {
      onHill.current = hill;
      now.current = target;
      setValue(target);
      setMoving(false);
      return;
    }
    const ms = Math.min(3000, 1000 + Math.abs(target - from) * 2500);
    const start = performance.now();
    let frame = 0;
    const step = (time: number) => {
      const p = Math.min(1, (time - start) / ms);
      const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      now.current = from + (target - from) * eased;
      setValue(now.current);
      if (p < 1) frame = requestAnimationFrame(step);
      else setMoving(false);
    };
    setMoving(true);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, hill]);
  return { value, moving };
}
