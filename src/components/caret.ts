// Which line of a text box the cursor is on, counting lines that wrap. Browsers don't tell us this
// directly, so we copy the text box's text and styling into a hidden element and measure there.

function caretTops(el: HTMLTextAreaElement): { caret: number; first: number; last: number } {
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
  const tops = { caret: caret.offsetTop, first: start.offsetTop, last: end.offsetTop };
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
