// Small inline icons used by the toolbar and zoom control.

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function HandIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.7" {...common}>
      <path d="M18 11V6a2 2 0 0 0-4 0v5" />
      <path d="M14 10V4a2 2 0 0 0-4 0v6" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

export function SelectIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.7" {...common}>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M12 4h2M18 4h1a1 1 0 0 1 1 1v1M4 12v2M4 18v1a1 1 0 0 0 1 1h1M12 20h-1" />
      <path d="M13 13l7.5 2.5-3.2 1.3-1.3 3.2z" />
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" strokeWidth="1.6" {...common}>
      <path d="M5.5 3L2.5 6l3 3" />
      <path d="M2.5 6h7a4 4 0 0 1 0 8H7" />
    </svg>
  );
}

export function RedoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" strokeWidth="1.6" {...common}>
      <path d="M10.5 3l3 3-3 3" />
      <path d="M13.5 6h-7a4 4 0 0 0 0 8H9" />
    </svg>
  );
}

export function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" strokeWidth="1.5" {...common}>
      <path d="M1.5 5.5h13M1.5 10.5h13M5.5 1.5v13M10.5 1.5v13" />
    </svg>
  );
}

export function CaretIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" strokeWidth="1.8" {...common} style={{ stroke: 'var(--ink-faint)' }}>
      <path d="M3 4.5l3 3 3-3" />
    </svg>
  );
}

export function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" strokeWidth="1.8" {...common}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

/** Dark mode toggle: a moon. */
export function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...common}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}

/** Sign out: an arrow leaving through a door. */
export function SignOutIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...common}>
      <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9" />
    </svg>
  );
}

/** Collapse all (arrows pointing in) or expand all (arrows pointing out). */
export function CollapseAllIcon({ expand }: { expand: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...common}>
      {expand ? <path d="M7 9l5-5 5 5M7 15l5 5 5-5" /> : <path d="M7 4l5 5 5-5M7 20l5-5 5 5" />}
    </svg>
  );
}

/** Same width: two bars of equal length between two upright lines. */
export function SameWidthIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...common}>
      <path d="M4 4v16M20 4v16" />
      <rect x="7" y="6" width="10" height="4" rx="1" />
      <rect x="7" y="14" width="10" height="4" rx="1" />
    </svg>
  );
}

export function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      strokeWidth="1.8"
      {...common}
      style={{ stroke: 'var(--ink-faint)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 150ms ease' }}
    >
      <path d="M3 4.5l3 3 3-3" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" strokeWidth="1.8" {...common} style={{ stroke: 'var(--placeholder)' }}>
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  );
}

/** A stopwatch: the focus timer. */
export function TimerIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...common}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 2M10 3h4M12 3v3" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" strokeWidth="1.8" {...common}>
      <path d="M9 3h4v4M13 3L7 9M11 10v3H3V5h3" />
    </svg>
  );
}

export function ResizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" strokeWidth="1.4" {...common} style={{ stroke: 'var(--placeholder)' }}>
      <path d="M9 3L3 9M9 6.5L6.5 9" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" strokeWidth="1.5" {...common}>
      <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8L12 4M6.8 6.8v4.4M9.2 6.8v4.4" />
    </svg>
  );
}

export function GripIcon() {
  return (
    <svg width="8" height="12" viewBox="0 0 12 18" style={{ fill: 'var(--placeholder)' }} aria-hidden="true">
      {[3, 9, 15].flatMap((cy) => [3, 9].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" />))}
    </svg>
  );
}

export function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" strokeWidth="1.8" {...common}>
      <path d="M3 8h10" />
    </svg>
  );
}

/** Phone bar: more board actions. */
export function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2.4" {...common}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    </svg>
  );
}

/** Phone item bar: indent (lines with an arrow pointing right) or outdent (pointing left). */
export function IndentIcon({ out = false }: { out?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="1.8" {...common}>
      <path d="M11 6h9M11 12h9M11 18h9" />
      {out ? <path d="M7 9l-3 3 3 3" /> : <path d="M4 9l3 3-3 3" />}
    </svg>
  );
}

/** Phone item bar: move up (or down). */
export function ArrowIcon({ down = false }: { down?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="1.8" {...common}>
      {down ? <path d="M12 5v14M6 13l6 6 6-6" /> : <path d="M12 19V5M6 11l6-6 6 6" />}
    </svg>
  );
}

/** Phone item bar: tick. */
export function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" {...common}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Version history: a clock with an arrow going back round it. */
export function HistoryIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...common}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Fit to screen: four corners pointing out. */
export function FitIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...common}>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </svg>
  );
}

/** Search: a magnifying glass. */
export function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.9" {...common}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

/** Boards: two stacked boards (owner request: several boards). */
export function BoardsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" strokeWidth="1.5" {...common}>
      <rect x="1.5" y="4.5" width="10" height="9" rx="1.5" />
      <path d="M4.5 2.5h8.5a1.5 1.5 0 0 1 1.5 1.5v7" />
    </svg>
  );
}

/** Calendar: due dates (owner request). */
export function CalendarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" strokeWidth="1.5" {...common}>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
    </svg>
  );
}

/** Google Calendar panel: a calendar page with a grid of days (Due has the plain calendar). */
export function CalendarDaysIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...common}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" />
    </svg>
  );
}

/** Buy me a coffee: a cup with a handle and steam. */
export function CoffeeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...common}>
      <path d="M4 10h13v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6v-4z" />
      <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 3v3M12 3v3" />
    </svg>
  );
}

/** Share: two people (owner request: editing together). */
export function ShareIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="1.7" {...common}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.2 14.1c2.4-.3 4.1 1.2 4.6 4" />
    </svg>
  );
}
