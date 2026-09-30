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
    <svg width="12" height="12" viewBox="0 0 12 12" strokeWidth="1.8" {...common} stroke="#6B655C">
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

export function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      strokeWidth="1.8"
      {...common}
      stroke="#6B655C"
      style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 150ms ease' }}
    >
      <path d="M3 4.5l3 3 3-3" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" strokeWidth="1.8" {...common} stroke="#8A8378">
      <path d="M3 3l8 8M11 3l-8 8" />
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

export function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" strokeWidth="1.8" {...common}>
      <path d="M3 8h10" />
    </svg>
  );
}
