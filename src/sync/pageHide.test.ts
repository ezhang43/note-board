import { describe, expect, it, vi } from 'vitest';
import { flushWhenHidden } from './pageHide';

/** A pretend page: tests fire its events and choose whether it is hidden. */
function fakePage() {
  const handlers: Record<string, (() => void)[]> = {};
  const page = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (type: string, fn: () => void) => (handlers[type] ??= []).push(fn),
  };
  const fire = (type: string) => handlers[type]?.forEach((fn) => fn());
  return { page, fire };
}

describe('uploading when the page goes away', () => {
  it('uploads when the window is hidden or minimised, not when it comes back', () => {
    const { page, fire } = fakePage();
    const flush = vi.fn();
    flushWhenHidden(page, page, flush);
    page.visibilityState = 'hidden';
    fire('visibilitychange');
    expect(flush).toHaveBeenCalledOnce();
    page.visibilityState = 'visible';
    fire('visibilitychange');
    expect(flush).toHaveBeenCalledOnce();
  });

  it('uploads when the page is closed', () => {
    const { page, fire } = fakePage();
    const flush = vi.fn();
    flushWhenHidden(page, page, flush);
    fire('pagehide');
    expect(flush).toHaveBeenCalledOnce();
  });
});
