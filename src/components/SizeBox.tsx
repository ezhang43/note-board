import { MAX_SIZE, MIN_SIZE, SIZE_STEPS } from '../model/richText';

// The size box (owner request 2026-10-30, "Number box, like Google Docs"): − , the size in px, +, and
// the list of sizes under the number. The Journal's Formatting bar and the small format bar both use it
// (owner request 2026-11-19).

interface Props {
  /** The size shown, in px; null when the selection has more than one (the box is then empty). */
  px: number | null;
  /** Whether the list is open; `onToggle` opens or shuts it. */
  open: boolean;
  onToggle: () => void;
  onStep: (dir: 1 | -1) => void;
  onPick: (px: number) => void;
}

export function SizeBox({ px, open, onToggle, onStep, onPick }: Props) {
  const mixed = px === null;
  const canDown = mixed || px > MIN_SIZE;
  const canUp = mixed || px < MAX_SIZE;
  return (
    // aria-disabled, not disabled, at 10 and 36: a press on a disabled button may not reach the bar's keep in every
    // browser, and would take the cursor out of the text.
    <div className="jt-size" role="group" aria-label="Text size">
      <button type="button" aria-label="Smaller" title="Smaller" aria-disabled={!canDown} onClick={() => canDown && onStep(-1)}>
        −
      </button>
      <button type="button" className="jt-size-box" aria-label={mixed ? 'Size: mixed' : `Size ${px}`} title="Choose a size" aria-expanded={open} onClick={onToggle}>
        {mixed ? '' : px}
      </button>
      <button type="button" aria-label="Larger" title="Larger" aria-disabled={!canUp} onClick={() => canUp && onStep(1)}>
        +
      </button>
      {open && (
        <div className="jt-sizes" role="group" aria-label="Sizes">
          {SIZE_STEPS.map((n) => (
            <button key={n} type="button" aria-pressed={!mixed && px === n} onClick={() => onPick(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
