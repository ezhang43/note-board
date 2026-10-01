interface Page {
  addEventListener(type: string, listener: () => void): void;
}

/**
 * Calls `flush` when the page is hidden (minimised, switched away from, phone locked) or closed.
 * Closing alone isn't enough: installed apps and phones often close a page without telling it.
 */
export function flushWhenHidden(doc: Page & { visibilityState: DocumentVisibilityState }, win: Page, flush: () => void) {
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') flush();
  });
  win.addEventListener('pagehide', flush);
}
