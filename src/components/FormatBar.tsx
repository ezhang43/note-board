import { flushSync } from 'react-dom';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyEvent } from 'react';
import { FONTS, styleOf, type Box, type TextFont, type TextSize } from '../model/textStyle';
import type { FormatAsk } from '../store/actions/format';
import { appStore, useAppState, useViewOnly } from '../store/appStore';
import { boxKey, focusedBox } from './textBox';
import { isTextField, panelCovers } from './textField';

// The small format bar (owner request): shows above a text box when some of its text is
// highlighted, or above selected checklist items. Its buttons format whole text boxes.
// It stays out of the way (owner, 2026-11-02): never while the mouse is still dragging a highlight, it appears
// PAUSE ms after the highlight stops changing (mouse released, keys stopped), and goes at once when the person
// types, deletes, cuts or copies. Alt+F10 shows it at once.
// From the keyboard (job 174): Alt+F10 moves into it; arrows and Tab go round it; Escape goes back to the text.

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

/** Which text is highlighted where, to tell a real change of highlight from a selectionchange that moved nothing. */
function highlightSig(): string {
  const typing = focusedBox();
  return typing ? `${boxKey(typing.box)}:${typing.field.selectionStart}-${typing.field.selectionEnd}` : '';
}

/** While the keyboard is in the bar, the text it formats has lost focus: the bar must stay. */
const focusInBar = () => document.activeElement?.closest('.format-bar') != null;

/** The same boxes, at their new place (after undo, zoom or a resize); gone when one of them is. */
function refollow(t: Target): Target | null {
  const rects = t.boxes.map((b) => document.querySelector(`[data-box="${CSS.escape(boxKey(b))}"]`)?.getBoundingClientRect());
  if (rects.some((r) => !r)) return null;
  const r = rects as DOMRect[];
  return { boxes: t.boxes, left: Math.min(...r.map((x) => x.left)), top: Math.min(...r.map((x) => x.top)), bottom: Math.max(...r.map((x) => x.bottom)) };
}

const BAR_H = 36;
const PAUSE = 250; // ms after the highlight settles
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
  const [shown, setShown] = useState(false);
  // `down`: a mouse button or finger is on the page. `waiting`: the highlight changed and the bar is due once it settles.
  const quiet = useRef({ timer: 0, down: false, waiting: false, sig: '', itemSig: '' });
  const viewOnly = useViewOnly();
  const [fontsOpen, setFontsOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const fontButton = useRef<HTMLButtonElement>(null);
  const fontMenu = useRef<HTMLDivElement>(null);
  // Where Alt+F10 came from, so Escape can put the cursor and the highlighted text back.
  const back = useRef<{ el: HTMLElement; start: number | null; end: number | null } | null>(null);

  // After any board, view or selection change.
  const refresh = () => setTarget(focusInBar() ? (t) => t && refollow(t) : findTarget());
  useEffect(refresh, [board, view, itemSel]); // simple: `refresh` is new each render but only uses setTarget (stable)

  const q = quiet.current;
  /** The bar is due after the pause (if the highlight still exists by then). */
  const arm = () => {
    clearTimeout(q.timer);
    q.timer = window.setTimeout(() => {
      q.waiting = false;
      if (findTarget() || focusInBar()) setShown(true);
    }, PAUSE);
  };
  /** The highlight moved: hide the bar and bring it back after the pause, once the pointer is up. */
  const moved = () => {
    clearTimeout(q.timer);
    q.waiting = true;
    setShown(false);
    if (!q.down) arm();
  };
  /** Typed, deleted, cut or copied: hide, and stay hidden until the highlight changes again. */
  const hide = () => {
    clearTimeout(q.timer);
    q.waiting = false;
    setShown(false);
  };
  // Checklist items picked or unpicked, or the words highlighted changed. A new object with the same picks (after
  // formatting them) is not a change: the bar must stay under the person's pointer for the next click.
  useEffect(() => {
    const sig = JSON.stringify(itemSel);
    if (sig === q.itemSig) return;
    q.itemSig = sig;
    if (!focusInBar()) moved();
  }, [itemSel]);
  useEffect(() => () => clearTimeout(q.timer), []);

  useEffect(() => {
    const update = refresh;
    // Alt+F10 (as in Google Docs): into the bar, while some text is highlighted.
    const toBar = (e: KeyboardEvent) => {
      if (e.key !== 'F10' || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || panelCovers() || focusInBar()) return;
      const t = findTarget();
      if (!t) return;
      // Alt+F10 doesn't wait for the pause: show the bar now, then step into it.
      clearTimeout(q.timer);
      q.waiting = false;
      flushSync(() => {
        setTarget(t);
        setShown(true);
      });
      const first = document.querySelector<HTMLElement>('.format-bar button');
      if (!first) return;
      e.preventDefault();
      const el = document.activeElement;
      const field = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el : null;
      back.current = el instanceof HTMLElement ? { el, start: field?.selectionStart ?? null, end: field?.selectionEnd ?? null } : null;
      first.focus();
    };
    // Text selection inside a field changes without any store change.
    const later = () => setTimeout(update, 0);
    const changed = () => {
      update();
      const sig = highlightSig();
      if (sig === q.sig || focusInBar()) return;
      q.sig = sig;
      // No text box has a highlight any more (focus left it for the picked items, say): the picked items arm the bar
      // themselves, and this late event must not hide a bar that is already showing for them.
      if (sig) moved();
    };
    const press = (e: Event) => {
      if (!(e.target instanceof Element && e.target.closest('.format-bar'))) q.down = true;
    };
    const release = () => {
      q.down = false;
      if (q.waiting) arm();
    };
    const typing = (e: KeyboardEvent) => {
      if (focusInBar() || e.altKey) return;
      const k = e.key;
      const mod = e.ctrlKey || e.metaKey;
      // In a text box any character types; with picked items only a word highlight is typed over (a letter that is
      // just a board shortcut, like "q", leaves the bar alone).
      const types = isTextField(e.target) || !!appStore.getState().ui.itemSel?.words;
      const edit = mod ? k.length === 1 && 'xcv'.includes(k.toLowerCase()) : k === 'Backspace' || k === 'Delete' || (types && (k.length === 1 || k === 'Enter'));
      if (edit) hide();
    };
    document.addEventListener('selectionchange', changed);
    document.addEventListener('select', changed, true);
    document.addEventListener('pointerdown', press, true);
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', release);
    document.addEventListener('keydown', typing, true);
    document.addEventListener('keyup', update, true);
    document.addEventListener('focusout', later, true);
    document.addEventListener('keydown', toBar);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('selectionchange', changed);
      document.removeEventListener('select', changed, true);
      document.removeEventListener('pointerdown', press, true);
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('pointercancel', release, true);
      window.removeEventListener('blur', release);
      document.removeEventListener('keydown', typing, true);
      document.removeEventListener('keyup', update, true);
      document.removeEventListener('focusout', later, true);
      document.removeEventListener('keydown', toBar);
      window.removeEventListener('resize', update);
    };
  }, []);

  // While hovering the bar, outline the boxes it will change, so it's clear the whole box changes.
  const keys = target?.boxes.map(boxKey).join('|') ?? '';
  useEffect(() => {
    if (!hovering || !keys) return;
    const els = keys.split('|').flatMap((k) => [...document.querySelectorAll(`[data-box="${CSS.escape(k)}"]`)]);
    els.forEach((el) => el.classList.add('format-target'));
    return () => els.forEach((el) => el.classList.remove('format-target'));
  }, [hovering, keys]);

  const visible = shown && !!target && !viewOnly;
  useEffect(() => {
    if (!target) setShown(false);
  }, [target]);
  useEffect(() => {
    if (!visible) {
      setFontsOpen(false);
      setHovering(false);
    }
  }, [visible]);

  // Opened from the keyboard, the Font menu takes the keyboard (opened with the mouse it must not take the cursor).
  useEffect(() => {
    if (fontsOpen && focusInBar()) (fontMenu.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? fontMenu.current?.querySelector('button'))?.focus();
  }, [fontsOpen]);

  if (!visible) return null; // not yet (or no longer) due; nothing is formatted on a read-only board (job 161)
  const now = styleOf(board, target.boxes[0]) ?? {};
  const size: TextSize = now.size ?? 'normal';
  const font: TextFont = now.font ?? 'sans';
  // Above the text (below the toolbar); else below it if that fits on screen; the bar never covers the highlighted words.
  const above = target.top - BAR_H - 6;
  const up = above > 72;
  // Neither side fits (a very short window): below, held inside the window, and never up over the toolbar.
  const top = up ? above : Math.max(72, Math.min(target.bottom + 6, window.innerHeight - BAR_H - 8));
  const style: CSSProperties = { left: Math.max(8, target.left), top };
  const apply = (ask: FormatAsk) => appStore.formatBoxes(target.boxes, ask);
  // Pressing a button must not take the cursor (or the highlighted text) away from the box.
  const keep = (e: React.MouseEvent) => e.preventDefault();
  // Keyboard inside the bar: Escape goes back to the text (or closes the open Font menu), Tab goes round, arrows walk along.
  const onKeyDown = (e: ReactKeyEvent<HTMLDivElement>) => {
    const here = document.activeElement as HTMLElement;
    if (e.key === 'Escape') {
      e.stopPropagation(); // not for a panel or the selection behind it
      e.preventDefault();
      if (fontsOpen) {
        setFontsOpen(false);
        fontButton.current?.focus();
        return;
      }
      const to = back.current;
      back.current = null;
      if (to && to.el !== document.body && to.el.isConnected) {
        to.el.focus();
        if (to.start !== null && to.end !== null) (to.el as HTMLTextAreaElement).setSelectionRange(to.start, to.end);
      } else here.blur();
      return;
    }
    // Tab goes round every button; in the open Font menu the arrows go up and down it, otherwise left and right along the bar.
    const buttons = (within: ParentNode) => [...within.querySelectorAll<HTMLButtonElement>('button')];
    const inMenu = !!fontMenu.current?.contains(here);
    let step = 0;
    let walk = buttons(e.currentTarget);
    if (e.key === 'Tab') step = e.shiftKey ? -1 : 1;
    else if (inMenu) {
      walk = buttons(fontMenu.current!);
      step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    } else {
      walk = walk.filter((b) => !fontMenu.current?.contains(b));
      step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    }
    if (!step) return;
    e.preventDefault();
    walk[(walk.indexOf(here as HTMLButtonElement) + step + walk.length) % walk.length]?.focus();
  };

  return (
    <div
      className={up ? 'format-bar' : 'format-bar below'}
      role="toolbar"
      aria-label="Text format"
      style={style}
      onMouseDown={keep}
      onKeyDown={onKeyDown}
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
        <button ref={fontButton} type="button" aria-label="Font" title="Font" aria-haspopup="menu" aria-expanded={fontsOpen} style={{ fontFamily: fontVar(font) }} onClick={() => setFontsOpen((o) => !o)}>
          {FONTS.find((f) => f.key === font)!.label} ▾
        </button>
        {fontsOpen && (
          <div ref={fontMenu} className="fb-font-menu" role="menu" aria-label="Fonts">
            {FONTS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="menuitemradio"
                aria-checked={font === f.key}
                style={{ fontFamily: fontVar(f.key) }}
                onClick={() => {
                  apply({ font: f.key });
                  if (focusInBar()) fontButton.current?.focus(); // from the keyboard: stay in the bar
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
