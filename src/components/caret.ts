// Which line of a text box the cursor is on, counting lines that wrap. Browsers don't tell us this
// directly, so we copy the text box's text and styling into a hidden element and measure there.

function caretTops(el: HTMLTextAreaElement): { caret: number; first: number; last: number; line: number } {
  const style = getComputedStyle(el);
  const mirror = document.createElement('div');
  for (const p of ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'boxSizing', 'textTransform', 'wordSpacing'] as const) {
    mirror.style[p] = style[p];
  }
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-9999px',
    width: `${el.offsetWidth}px`,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  });
  const pos = el.selectionStart ?? 0;
  const marker = (text: string) => {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  };
  const start = marker('​');
  const caret = marker('​');
  const end = marker('​');
  mirror.append(start, el.value.slice(0, pos), caret, el.value.slice(pos), end);
  document.body.append(mirror);
  const tops = { caret: caret.offsetTop, first: start.offsetTop, last: end.offsetTop, line: caret.offsetHeight };
  mirror.remove();
  return tops;
}

export function caretOnFirstLine(el: HTMLTextAreaElement): boolean {
  const t = caretTops(el);
  return t.caret === t.first;
}

export function caretOnLastLine(el: HTMLTextAreaElement): boolean {
  const t = caretTops(el);
  return t.caret === t.last;
}

/** Where the bottom of the line the cursor is on sits on screen (the whole box's bottom for a one-line field). */
export function caretBottom(el: HTMLTextAreaElement | HTMLInputElement): number {
  const box = el.getBoundingClientRect();
  if (el instanceof HTMLInputElement) return box.bottom;
  const t = caretTops(el);
  // The board can be zoomed, which scales the box on screen but not the copy measured here.
  const scale = el.offsetHeight ? box.height / el.offsetHeight : 1;
  // The line is as tall as its line-height says (the copy's marker is only as tall as the letters).
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
  return box.top + (t.caret + (lineHeight > t.line ? lineHeight : t.line) - el.scrollTop) * scale;
}
