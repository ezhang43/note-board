import { EXPORT_MARGIN, exportArea, exportScale, pdfFromJpeg } from '../model/exportImage';

// Download as picture (PNG) / PDF (job 163): draws the open board, every card and container and not
// just what is on screen, into a picture. The board is copied into a hidden, unzoomed, unselected
// copy (`.export-clone`, styled in styles.css) and the html-to-image package (MIT) draws that copy,
// so what is saved looks like the board does now, in its theme and in dark mode.

/** Drawn in place of a picture from another site that the browser won't let us read back (no CORS header). */
const BLANK_PICTURE =
  'data:image/svg+xml,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#9a948a" fill-opacity="0.25"/></svg>');

/** State classes that only mean something while someone is working on the board. */
const WORKING = ['selected', 'dragging', 'find-target', 'drop-target', 'size-match', 'append-target', 'following'];

/** One more frame, so a "Preparing…" note is on the screen before the drawing starts. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/**
 * The open board as a PNG or a one-page PDF; null when there is nothing on it. Throws if the browser
 * can't draw it (the caller says so).
 */
export async function boardPicture(kind: 'png' | 'pdf'): Promise<Blob | null> {
  const canvas = document.querySelector<HTMLElement>('.canvas');
  const world = canvas?.querySelector<HTMLElement>('.world');
  if (!canvas || !world) return null;
  const zoom = Number(canvas.dataset.zoom) || 1;
  const origin = world.getBoundingClientRect();
  const blocks = [...world.querySelectorAll<HTMLElement>(':scope > [data-card-id], :scope > [data-col-id]')].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: (r.left - origin.left) / zoom, y: (r.top - origin.top) / zoom, w: r.width / zoom, h: r.height / zoom };
  });
  const area = exportArea(blocks, EXPORT_MARGIN);
  if (!area) return null;
  const scale = exportScale(area.w, area.h);

  // The hidden copy: unzoomed, moved so the area starts at its corner, nothing selected.
  const copy = canvas.cloneNode(true) as HTMLElement;
  copy.classList.add('export-clone');
  copy.removeAttribute('data-testid');
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  Object.assign(copy.style, { width: `${area.w}px`, height: `${area.h}px`, backgroundImage: 'none' });
  copy.querySelector<HTMLElement>('.world')!.style.transform = `translate(${-area.x}px, ${-area.y}px)`;
  copy.querySelectorAll('.' + WORKING.join(', .')).forEach((el) => el.classList.remove(...WORKING));
  // A copy doesn't carry what was typed into a text box, only its starting text.
  const typed = (root: Element) => [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')];
  const live = typed(canvas);
  typed(copy).forEach((el, i) => (el.value = live[i].value));
  // A video or a web page (YouTube...) can't be drawn: leave a blank panel the same shape.
  copy.querySelectorAll('.link-media :is(video, iframe)').forEach((el) => {
    const panel = document.createElement('div');
    panel.style.cssText = 'width:100%;aspect-ratio:16/9';
    el.replaceWith(panel);
  });

  document.body.append(copy);
  try {
    await nextFrame();
    const { toCanvas } = await import('html-to-image'); // loaded only when someone downloads a picture
    const drawn = await toCanvas(copy, {
      width: area.w,
      height: area.h,
      pixelRatio: scale,
      backgroundColor: getComputedStyle(canvas).backgroundColor,
      imagePlaceholder: BLANK_PICTURE,
      // The copy is see-through and fixed to the window; in the picture it is solid and in the corner.
      style: { position: 'relative', opacity: '1' },
    });
    const toBlob = (type: string, quality?: number) =>
      new Promise<Blob>((resolve, reject) => drawn.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made.'))), type, quality));
    if (kind === 'png') return await toBlob('image/png');
    const jpeg = new Uint8Array(await (await toBlob('image/jpeg', 0.92)).arrayBuffer());
    return new Blob([pdfFromJpeg(jpeg, drawn.width, drawn.height, area.w, area.h)], { type: 'application/pdf' });
  } finally {
    copy.remove();
  }
}
