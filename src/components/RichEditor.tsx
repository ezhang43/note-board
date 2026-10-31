import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import { deepEqual } from '../model/merge';
import * as R from '../model/richText';
import type { Block, BlockType, Look, Marks, Pos, Rich, Run, Sel, Toggle } from '../model/richText';

// The Journal's rich text box (owner request, 2026-10-19). A contentEditable whose content is drawn
// from the typed format in model/richText with createElement and textContent only: nothing typed,
// pasted or loaded is ever read as markup. Edits go through the model's pure functions where the
// browser's own would make a mess (new lines, joining lines, lists, formatting, paste); simple
// typing and deleting inside one line are left to the browser and read back from the page.

export interface RichEditorHandle {
  el: HTMLDivElement | null;
  focusEnd(): void;
  toggle(mark: Toggle): void;
  setMark(key: 'size' | 'font' | 'hl', value: string | number | undefined): void;
  /** The size box's − and +. */
  stepSize(dir: 1 | -1): void;
  setType(type: 'p' | 'h1' | 'h2'): void;
  list(type: 'bullet' | 'number'): void;
}

interface Props {
  value: Rich;
  /** `typing` is false for formatting, so each format change is an undo step of its own. */
  onChange(rich: Rich, typing: boolean): void;
  onLook(look: Look): void;
  onEscape(): void;
  onFocus?(el: HTMLDivElement): void;
  onBlur?(el: HTMLDivElement): void;
  label: string;
  /** Gray words shown while the note is empty (the caller says when it is: nothing typed here is read back from it). */
  placeholder?: string;
  ref?: Ref<RichEditorHandle>;
}

// ---- drawing ----

function drawBlock(blk: Block, marker: string): HTMLDivElement {
  const div = document.createElement('div');
  div.dataset.type = blk.type;
  if (blk.indent) div.dataset.indent = String(blk.indent);
  if (marker) div.dataset.marker = marker;
  for (const r of blk.runs) {
    const span = document.createElement('span');
    for (const k of ['b', 'i', 'u', 's'] as const) if (r[k]) span.dataset[k] = '';
    if (r.size) span.dataset.size = String(r.size);
    // A size in px, as a share of the line's own size (NORMAL_SIZE px text), so it grows in a heading as Small and Large do.
    if (typeof r.size === 'number') span.style.fontSize = `${r.size / R.NORMAL_SIZE}em`;
    if (r.font) span.dataset.font = r.font;
    if (r.hl) span.dataset.hl = r.hl;
    span.textContent = r.text;
    div.append(span);
  }
  if (!blk.runs.length) div.append(document.createElement('br'));
  return div;
}

/** Brings the page in line with `rich`, replacing only lines that differ. True when anything changed. */
function draw(root: HTMLElement, rich: Rich): boolean {
  const nums = R.numbers(rich);
  let changed = false;
  rich.forEach((blk, b) => {
    const want = drawBlock(blk, blk.type === 'bullet' ? '•' : nums[b]);
    const have = root.childNodes[b];
    if (have && have.isEqualNode(want)) return;
    changed = true;
    if (have) root.replaceChild(want, have);
    else root.append(want);
  });
  while (root.childNodes.length > rich.length) {
    root.lastChild!.remove();
    changed = true;
  }
  return changed;
}

// ---- reading the page back ----

/** The page's lines: each block div, or a stretch of loose nodes the browser left at the top level. */
function lines(root: HTMLElement): Node[][] {
  const out: Node[][] = [];
  let loose: Node[] | null = null;
  for (const n of Array.from(root.childNodes)) {
    if (n instanceof HTMLDivElement) {
      out.push([n]);
      loose = null;
    } else {
      if (!loose) out.push((loose = []));
      loose.push(n);
    }
  }
  return out;
}

const blockTypeOf = (n: Node): BlockType => (n instanceof HTMLElement ? (n.dataset.type as BlockType) : 'p');

/** The formatting shown on the page (after the browser typed or deleted in it), checked like loaded data. */
function parse(root: HTMLElement): Rich {
  const raw = lines(root).map((group) => {
    const top = group[0];
    const runs: Run[] = [];
    for (const n of group) {
      const walk = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      for (let t = n.nodeType === Node.TEXT_NODE ? n : walk.nextNode(); t; t = walk.nextNode()) {
        // Marks come only from our own run spans' data attributes, read from every span the text sits
        // in (the browser may wrap or split them), so anything else it makes reads as plain text.
        // parseRich checks the values.
        const run: Record<string, unknown> = { text: t.textContent ?? '' };
        for (let a = t.parentNode; a && a !== root; a = a.parentNode) {
          if (!(a instanceof HTMLSpanElement)) continue;
          const span = a.dataset;
          for (const k of ['b', 'i', 'u', 's'] as const) if (span[k] !== undefined) run[k] = true;
          for (const k of ['font', 'hl'] as const) run[k] ??= span[k];
          // A size in px reads back as a number; the old words stay words.
          const size = span.size;
          if (size !== undefined) run.size ??= size === 'small' || size === 'large' ? size : Number(size);
        }
        runs.push(run as unknown as Run);
      }
    }
    const indent = top instanceof HTMLElement ? Number(top.dataset.indent ?? 0) : 0;
    return { type: group.length === 1 ? blockTypeOf(top) : 'p', indent, runs };
  });
  return R.parseRich(raw) ?? R.fromPlain('');
}

function posOf(root: HTMLElement, node: Node, offset: number): Pos {
  const groups = lines(root);
  if (!groups.length) return { b: 0, o: 0 };
  // A point on the editor itself (select all): before the given child.
  if (node === root) {
    const child = root.childNodes[offset];
    if (!child) {
      const b = groups.length - 1;
      return { b, o: groupText(groups[b]).length };
    }
    const b = groups.findIndex((g) => g.includes(child));
    return { b, o: textBefore(groups[b], child, 0) };
  }
  for (let b = 0; b < groups.length; b++) {
    if (groups[b].some((n) => n === node || n.contains(node))) return { b, o: textBefore(groups[b], node, offset) };
  }
  return { b: 0, o: 0 };
}
const groupText = (g: Node[]) => g.map((n) => n.textContent ?? '').join('');
function textBefore(group: Node[], node: Node, offset: number): number {
  const range = document.createRange();
  range.setStartBefore(group[0]);
  range.setEnd(node, offset);
  return range.toString().length;
}

function readSel(root: HTMLElement): Sel | null {
  const s = document.getSelection();
  if (!s || !s.rangeCount || !root.contains(s.anchorNode) || !root.contains(s.focusNode)) return null;
  return { start: posOf(root, s.anchorNode!, s.anchorOffset), end: posOf(root, s.focusNode!, s.focusOffset) };
}

/** The DOM point for a place, on a page drawn by `draw`. At a run boundary it stays in the earlier run. */
function pointOf(root: HTMLElement, p: Pos): [Node, number] {
  const div = root.childNodes[Math.min(p.b, root.childNodes.length - 1)];
  if (!div) return [root, 0];
  const walk = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let last: Node | null = null;
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    const n = t.textContent!.length;
    if (p.o <= acc + n) return [t, Math.max(0, p.o - acc)];
    acc += n;
    last = t;
  }
  return last ? [last, last.textContent!.length] : [div, 0];
}

function setSel(root: HTMLElement, sel: Sel) {
  const s = document.getSelection();
  if (!s) return;
  const [an, ao] = pointOf(root, sel.start);
  const [fn, fo] = pointOf(root, sel.end);
  s.setBaseAndExtent(an, ao, fn, fo);
}

const samePos = (a: Pos, b: Pos) => a.b === b.b && a.o === b.o;
const collapsed = (s: Sel) => samePos(s.start, s.end);
const lineRange = (s: Sel): [number, number] => [Math.min(s.start.b, s.end.b), Math.max(s.start.b, s.end.b)];
const endOf = (rich: Rich): Pos => {
  const b = rich.length - 1;
  return { b, o: rich[b].runs.reduce((n, r) => n + r.text.length, 0) };
};
const at = (p: Pos): Sel => ({ start: p, end: p });

export function RichEditor({ value, onChange, onLook, onEscape, onFocus, onBlur, label, placeholder, ref }: Props) {
  const root = useRef<HTMLDivElement>(null);
  /** What is on the page. */
  const cur = useRef<Rich>(value);
  /** The last selection in the editor, for toolbar controls that take the focus. */
  const saved = useRef<Sel | null>(null);
  /** A look chosen with nothing selected, for the next letters typed at `pending.at`. */
  const pending = useRef<{ marks: Marks; at: Pos } | null>(null);
  const composing = useRef(false);
  const props = useRef({ onChange, onLook, onEscape });
  props.current = { onChange, onLook, onEscape };

  const look = (sel: Sel) => {
    const l = R.marksAt(cur.current, sel);
    const p = pending.current;
    props.current.onLook(p && collapsed(sel) && samePos(p.at, sel.start) ? { ...l, ...lookOfMarks(p.marks) } : l);
  };

  /** Shows an edit, puts the selection back and reports it. */
  const apply = (rich: Rich, sel: Sel, typing: boolean) => {
    const el = root.current!;
    cur.current = rich;
    draw(el, rich);
    setSel(el, sel);
    saved.current = sel;
    if (!typing) look(sel);
    props.current.onChange(rich, typing);
  };

  /** The selection a toolbar control works on: the focus goes back to the text first. */
  const target = (): Sel => {
    const el = root.current!;
    const sel = readSel(el) ?? saved.current ?? at(endOf(cur.current));
    if (document.activeElement !== el) {
      el.focus({ preventScroll: true });
      setSel(el, sel);
    }
    return sel;
  };

  const format = (fn: (rich: Rich, sel: Sel) => Rich, setPending: (look: Look) => Look) => {
    const sel = target();
    if (collapsed(sel)) {
      const p = pending.current;
      const now = p && samePos(p.at, sel.start) ? { ...R.marksAt(cur.current, sel), ...lookOfMarks(p.marks) } : R.marksAt(cur.current, sel);
      pending.current = { marks: R.marksOfLook(setPending(now)), at: sel.start };
      look(sel);
      return;
    }
    apply(fn(cur.current, sel), sel, false);
  };

  const handle: RichEditorHandle = {
    get el() {
      return root.current;
    },
    focusEnd() {
      const el = root.current;
      if (!el) return;
      el.focus();
      const sel = at(endOf(cur.current));
      setSel(el, sel);
      saved.current = sel;
    },
    toggle: (mark) =>
      format(
        (rich, sel) => R.toggleMark(rich, sel, mark),
        (l) => ({ ...l, [mark]: !l[mark] }),
      ),
    setMark: (key, v) =>
      format(
        (rich, sel) => R.setMark(rich, sel, key, v as never),
        (l) => ({ ...l, [key]: v }),
      ),
    stepSize: (dir) =>
      format(
        (rich, sel) => R.stepSizes(rich, sel, dir),
        (l) => ({ ...l, size: R.sizeMark(R.stepSize(l.size, dir)) }),
      ),
    setType(type) {
      const sel = target();
      apply(R.setBlockType(cur.current, ...lineRange(sel), type), sel, false);
    },
    list(type) {
      const sel = target();
      apply(R.toggleList(cur.current, ...lineRange(sel), type), sel, false);
    },
  };
  useImperativeHandle(ref, () => handle);

  // A change from outside (undo, sync, another tab): drawn, keeping the caret where it was.
  useLayoutEffect(() => {
    const el = root.current!;
    if (el.childNodes.length && deepEqual(value, cur.current)) return;
    const sel = document.activeElement === el ? readSel(el) : null;
    cur.current = value;
    if (draw(el, value) && sel) {
      const clamp = (p: Pos): Pos => {
        const b = Math.min(p.b, value.length - 1);
        return { b, o: Math.min(p.o, endOf([value[b]]).o) };
      };
      setSel(el, { start: clamp(sel.start), end: clamp(sel.end) });
    }
  }, [value]);

  useEffect(() => {
    const el = root.current!;
    const readBack = () => {
      const sel = readSel(el);
      const rich = parse(el);
      cur.current = rich;
      if (draw(el, rich) && sel) setSel(el, sel);
      props.current.onChange(rich, true);
    };
    const onBeforeInput = (e: InputEvent) => {
      // An edit the browser won't let us stop (some phone keyboards) is its own: read back after.
      if (e.isComposing || composing.current || !e.cancelable) return;
      const t = e.inputType;
      const sel = readSel(el);
      if (!sel) return;
      const rich = cur.current;
      const across = sel.start.b !== sel.end.b;
      const take = (edit: R.Edit) => {
        e.preventDefault();
        pending.current = null;
        apply(edit.rich, at(edit.at), true);
      };
      const p = pending.current;
      const marks = p && collapsed(sel) && samePos(p.at, sel.start) ? p.marks : undefined;
      if (t === 'insertParagraph' || t === 'insertLineBreak') {
        const edit = R.splitAt(rich, sel, marks);
        take(edit);
        // The new line starts empty: its size waits for the next letters, like a size chosen there.
        if (edit.look) pending.current = { marks: edit.look, at: edit.at };
        return;
      }
      if (t === 'insertText') {
        // Plain typing within a line is the browser's own, so spelling, autocorrect and phone
        // keyboards' suggestions keep working; it is read back after.
        if (!marks && !across) return;
        return take(R.insertText(rich, sel, (e.data ?? '').replace(/\r\n?/g, '\n'), marks));
      }
      if (t === 'insertFromDrop') {
        e.preventDefault();
        const range = e.getTargetRanges()[0];
        const text = e.dataTransfer?.getData('text/plain');
        if (!range || !text) return;
        const p = posOf(el, range.startContainer, range.startOffset);
        return take(R.insertText(rich, at(p), text.replace(/\r\n?/g, '\n')));
      }
      // Pasting is handled below. Spelling fixes and on-screen keyboards' words are the browser's own
      // (read back after); other inserts that could bring in markup, and the browser's own formatting
      // and undo, are not let in.
      if (t.startsWith('insert') && t !== 'insertReplacementText' && t !== 'insertCompositionText') return e.preventDefault();
      if (t.startsWith('format') || t.startsWith('history') || t === 'deleteByDrag') return e.preventDefault();
      if (t.startsWith('delete')) {
        if (!collapsed(sel)) {
          if (across) take(R.deleteSel(rich, sel));
          return;
        }
        const back = t.includes('Backward');
        if (back && sel.start.o === 0) return take(R.joinBackward(rich, sel.start.b));
        if (!back && sel.start.o >= endOf([rich[sel.start.b]]).o) return take(R.joinForward(rich, sel.start.b));
      }
    };
    const onInput = () => {
      if (!composing.current) readBack();
    };
    const onCompStart = () => (composing.current = true);
    const onCompEnd = () => {
      composing.current = false;
      readBack();
    };
    const onSelection = () => {
      const sel = readSel(el);
      if (!sel) return;
      saved.current = sel;
      const p = pending.current;
      if (p && !(collapsed(sel) && samePos(p.at, sel.start))) pending.current = null;
      look(sel);
    };
    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('input', onInput);
    el.addEventListener('compositionstart', onCompStart);
    el.addEventListener('compositionend', onCompEnd);
    document.addEventListener('selectionchange', onSelection);
    return () => {
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('input', onInput);
      el.removeEventListener('compositionstart', onCompStart);
      el.removeEventListener('compositionend', onCompEnd);
      document.removeEventListener('selectionchange', onSelection);
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') return onEscape();
    const sel = readSel(e.currentTarget);
    if (!sel) return;
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Tab moves list items; anywhere else it leaves the text as usual.
      const [b0, b1] = lineRange(sel);
      if (!cur.current.slice(b0, b1 + 1).some((blk) => R.isList(blk.type))) return;
      e.preventDefault();
      return apply(R.indentBlocks(cur.current, b0, b1, e.shiftKey ? -1 : 1), sel, false);
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    const run = (fn: () => void) => {
      e.preventDefault();
      fn();
    };
    if (e.shiftKey) {
      if (e.code === 'KeyX') run(() => handle.toggle('s'));
      else if (e.code === 'Digit7') run(() => handle.list('number'));
      else if (e.code === 'Digit8') run(() => handle.list('bullet'));
    } else if (key === 'b' || key === 'i' || key === 'u') run(() => handle.toggle(key));
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // Only the plain text of anything pasted comes in.
    e.preventDefault();
    const sel = readSel(e.currentTarget);
    const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
    if (!sel || !text) return;
    const edit = R.insertText(cur.current, sel, text);
    pending.current = null;
    apply(edit.rich, at(edit.at), true);
  };

  const copy = (e: React.ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const sel = readSel(e.currentTarget);
    if (!sel || collapsed(sel)) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', R.plainOfSel(cur.current, sel));
    if (cut) {
      const edit = R.deleteSel(cur.current, sel);
      apply(edit.rich, at(edit.at), true);
    }
  };

  return (
    <div
      ref={root}
      className="rich"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      data-placeholder={placeholder}
      spellCheck
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onCopy={(e) => copy(e, false)}
      onCut={(e) => copy(e, true)}
      // Dragging words would copy them, not move them (the drop comes in as plain text): not offered.
      onDragStart={(e) => e.preventDefault()}
      onFocus={(e) => onFocus?.(e.currentTarget)}
      onBlur={(e) => onBlur?.(e.currentTarget)}
    />
  );
}

function lookOfMarks(m: Marks): Partial<Look> {
  return { b: !!m.b, i: !!m.i, u: !!m.u, s: !!m.s, size: m.size, font: m.font, hl: m.hl };
}
