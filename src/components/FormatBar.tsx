import { useEffect, useState, type CSSProperties } from 'react';
import { FONTS, styleOf, type Box, type TextFont, type TextSize } from '../model/textStyle';
import type { FormatAsk } from '../store/actions/format';
import { appStore, useAppState } from '../store/appStore';
import { boxKey, focusedBox } from './textBox';

// The small format bar (owner request): shows above a text box when some of its text is
// highlighted, or above selected checklist items. Its buttons format whole text boxes.

interface Target {
  boxes: Box[];
  /** Screen position of what it formats: the bar sits just above it (or below, near the top). */
  left: number;
  top: number;
  bottom: number;
}

/** What the bar would format right now, if anything. */
function findTarget(): Target | null {
  const typing = focusedBox();
  if (typing) {
    const { field, box } = typing;
    if (field.selectionStart === field.selectionEnd) return null;
    const r = field.closest('[data-box]')!.getBoundingClientRect();
    return { boxes: [box], left: r.left, top: r.top, bottom: r.bottom };
  }
  if (!appStore.getState().ui.itemSel) return null;
  const rows = [...document.querySelectorAll('.todo-item.picked')].map((el) => el.getBoundingClientRect());
  if (!rows.length) return null;
  return {
    boxes: appStore.selectedBoxes(),
    left: Math.min(...rows.map((r) => r.left)),
    top: Math.min(...rows.map((r) => r.top)),
    bottom: Math.max(...rows.map((r) => r.bottom)),
  };
}

const BAR_H = 36;
const SIZES: { key: TextSize; label: string; px: number }[] = [
  { key: 'small', label: 'Small', px: 11 },
  { key: 'normal', label: 'Normal', px: 14 },
  { key: 'large', label: 'Large', px: 18 },
];

export function FormatBar() {
  // Redraw on any board, view or selection change, so the bar follows its text box.
  const board = useAppState((s) => s.board);
  const view = useAppState((s) => s.view);
  const itemSel = useAppState((s) => s.ui.itemSel);
  const [target, setTarget] = useState<Target | null>(null);
  const [fontsOpen, setFontsOpen] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const update = () => setTarget(findTarget());
    update();
    // Text selection inside a field changes without any store change.
    const later = () => setTimeout(update, 0);
    document.addEventListener('selectionchange', update);
    document.addEventListener('select', update, true);
    document.addEventListener('keyup', update, true);
    document.addEventListener('focusout', later, true);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('select', update, true);
      document.removeEventListener('keyup', update, true);
      document.removeEventListener('focusout', later, true);
      window.removeEventListener('resize', update);
    };
  }, [board, view, itemSel]);

  // While hovering the bar, outline the boxes it will change, so it's clear the whole box changes.
  const keys = target?.boxes.map(boxKey).join('|') ?? '';
  useEffect(() => {
    if (!hovering || !keys) return;
    const els = keys.split('|').flatMap((k) => [...document.querySelectorAll(`[data-box="${CSS.escape(k)}"]`)]);
    els.forEach((el) => el.classList.add('format-target'));
    return () => els.forEach((el) => el.classList.remove('format-target'));
  }, [hovering, keys]);

  useEffect(() => {
    if (!target) {
      setFontsOpen(false);
      setHovering(false);
    }
  }, [target]);

  if (!target) return null;
  const now = styleOf(board, target.boxes[0]) ?? {};
  const size: TextSize = now.size ?? 'normal';
  const font: TextFont = now.font ?? 'sans';
  const room = target.top - BAR_H - 6 > 72; // below the toolbar
  const style: CSSProperties = { left: Math.max(8, target.left), top: room ? target.top - BAR_H - 6 : target.bottom + 6 };
  const apply = (ask: FormatAsk) => appStore.formatBoxes(target.boxes, ask);
  // Pressing a button must not take the cursor (or the highlighted text) away from the box.
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      className="format-bar"
      role="toolbar"
      aria-label="Text format"
      style={style}
      onMouseDown={keep}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
    >
      <button type="button" className="fb-bold" aria-label="Bold" title="Bold (Ctrl+B)" aria-pressed={!!now.bold} onClick={() => apply('bold')}>
        B
      </button>
      <button type="button" className="fb-italic" aria-label="Italic" title="Italic (Ctrl+I)" aria-pressed={!!now.italic} onClick={() => apply('italic')}>
        I
      </button>
      <span className="fb-divider" />
      {SIZES.map((s) => (
        <button
          key={s.key}
          type="button"
          aria-label={s.label}
          title={`${s.label} text (Ctrl+Shift+> / <)`}
          aria-pressed={size === s.key}
          style={{ fontSize: s.px }}
          onClick={() => apply({ size: s.key })}
        >
          A
        </button>
      ))}
      <span className="fb-divider" />
      <div className="fb-font">
        <button type="button" aria-label="Font" title="Font" aria-haspopup="menu" aria-expanded={fontsOpen} style={{ fontFamily: fontVar(font) }} onClick={() => setFontsOpen((o) => !o)}>
          {FONTS.find((f) => f.key === font)!.label} ▾
        </button>
        {fontsOpen && (
          <div className="fb-font-menu" role="menu" aria-label="Fonts">
            {FONTS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="menuitemradio"
                aria-checked={font === f.key}
                style={{ fontFamily: fontVar(f.key) }}
                onClick={() => {
                  apply({ font: f.key });
                  setFontsOpen(false);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const fontVar = (f: TextFont) => (f === 'sans' ? 'var(--font)' : `var(--font-${f})`);
