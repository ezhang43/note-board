// @vitest-environment happy-dom
import { act, createElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appStore } from '../store/appStore';
import { pushEscapeLayer, useEscapeLayer, useOutsidePointerDown, type EscapePriority } from './escapeLayer';
import { ColourControl } from './Toolbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function pressEscape(target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('pushEscapeLayer (LIFO Escape stack)', () => {
  it('dispatches to the top-most layer first and stops propagation when consumed', () => {
    const calls: string[] = [];
    cleanups.push(pushEscapeLayer(() => { calls.push('bottom'); return true; }));
    cleanups.push(pushEscapeLayer(() => { calls.push('top'); return true; }));

    const bubble = vi.fn();
    window.addEventListener('keydown', bubble);
    cleanups.push(() => window.removeEventListener('keydown', bubble));

    const ev = pressEscape();
    expect(calls).toEqual(['top']);
    expect(ev.defaultPrevented).toBe(true);
    expect(bubble).not.toHaveBeenCalled();
  });

  it('passes through to lower layers when a handler returns false or undefined', () => {
    const calls: string[] = [];
    cleanups.push(pushEscapeLayer(() => { calls.push('bottom'); return true; }));
    cleanups.push(pushEscapeLayer(() => { calls.push('middle'); return false; }));
    cleanups.push(pushEscapeLayer(() => { calls.push('top'); }));

    pressEscape();
    expect(calls).toEqual(['top', 'middle', 'bottom']);
  });

  it('treats e.preventDefault() as consuming the Escape press', () => {
    const calls: string[] = [];
    cleanups.push(pushEscapeLayer(() => { calls.push('bottom'); return true; }));
    cleanups.push(pushEscapeLayer((e) => { calls.push('top'); e.preventDefault(); }));

    pressEscape();
    expect(calls).toEqual(['top']);
  });

  it('ignores non-Escape keys', () => {
    const handler = vi.fn(() => true);
    cleanups.push(pushEscapeLayer(handler));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('dispatches higher priority tiers before lower ones regardless of mount order', () => {
    const calls: string[] = [];
    cleanups.push(pushEscapeLayer(() => { calls.push('capture'); return false; }, 'capture'));
    cleanups.push(pushEscapeLayer(() => { calls.push('panel-1'); return false; }, 'panel'));
    cleanups.push(pushEscapeLayer(() => { calls.push('modal'); return false; }, 'modal'));
    cleanups.push(pushEscapeLayer(() => { calls.push('overlay-1'); return false; }, 'overlay'));
    cleanups.push(pushEscapeLayer(() => { calls.push('panel-2'); return false; }, 'panel'));
    cleanups.push(pushEscapeLayer(() => { calls.push('overlay-2'); return false; }, 'overlay'));

    pressEscape();
    expect(calls).toEqual(['capture', 'modal', 'overlay-2', 'overlay-1', 'panel-2', 'panel-1']);
  });

  it('removes a middle layer cleanly and tolerates double cleanup', () => {
    const calls: string[] = [];
    cleanups.push(pushEscapeLayer(() => { calls.push('first'); return false; }));
    const removeSecond = pushEscapeLayer(() => { calls.push('second'); return false; });
    cleanups.push(pushEscapeLayer(() => { calls.push('third'); return false; }));

    removeSecond();
    removeSecond();
    pressEscape();
    expect(calls).toEqual(['third', 'first']);
  });

  it('attaches one window capture listener while non-empty and removes it when empty', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const a = pushEscapeLayer(() => true);
    const b = pushEscapeLayer(() => true);
    expect(addSpy.mock.calls.filter(([t, , c]) => t === 'keydown' && c === true)).toHaveLength(1);

    a();
    expect(removeSpy.mock.calls.filter(([t, , c]) => t === 'keydown' && c === true)).toHaveLength(0);

    b();
    expect(removeSpy.mock.calls.filter(([t, , c]) => t === 'keydown' && c === true)).toHaveLength(1);
  });
});

describe('useEscapeLayer', () => {
  it('registers while active, preserves LIFO order across re-renders, and calls the latest callback', async () => {
    const calls: string[] = [];
    const addSpy = vi.spyOn(window, 'addEventListener');

    function Layer({ name, active, priority }: { name: string; active: boolean; priority?: EscapePriority }) {
      useEscapeLayer(active, () => {
        calls.push(name);
        return true;
      }, priority);
      return null;
    }

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    cleanups.push(() => act(() => root.unmount()));

    await act(async () => {
      root.render(createElement('div', null,
        createElement(Layer, { name: 'first-v1', active: true }),
        createElement(Layer, { name: 'second-v1', active: true }),
      ));
    });

    // Re-render with updated callbacks: order must remain second > first, and no new window listener added.
    await act(async () => {
      root.render(createElement('div', null,
        createElement(Layer, { name: 'first-v2', active: true }),
        createElement(Layer, { name: 'second-v2', active: true }),
      ));
    });

    expect(addSpy.mock.calls.filter(([t, , c]) => t === 'keydown' && c === true)).toHaveLength(1);

    pressEscape();
    expect(calls).toEqual(['second-v2']);

    // Deactivate second: first-v2 should now receive Escape.
    calls.length = 0;
    await act(async () => {
      root.render(createElement('div', null,
        createElement(Layer, { name: 'first-v2', active: true }),
        createElement(Layer, { name: 'second-v2', active: false }),
      ));
    });
    pressEscape();
    expect(calls).toEqual(['first-v2']);
  });
});

describe('useOutsidePointerDown', () => {
  it('fires for pointerdown outside the container, ignores inside and ignored targets', async () => {
    const onOutside = vi.fn();

    function Box({ active }: { active: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      useOutsidePointerDown(active, ref, onOutside, (t) => Boolean(t?.closest('.ignored')));
      return createElement('div', null,
        createElement('div', { ref, className: 'inside' }, 'inside'),
        createElement('div', { className: 'ignored' }, 'ignored'),
        createElement('div', { className: 'outside' }, 'outside'),
      );
    }

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    cleanups.push(() => act(() => root.unmount()));

    await act(async () => root.render(createElement(Box, { active: true })));

    host.querySelector('.inside')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    host.querySelector('.ignored')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onOutside).not.toHaveBeenCalled();

    host.querySelector('.outside')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onOutside).toHaveBeenCalledTimes(1);

    await act(async () => root.render(createElement(Box, { active: false })));
    host.querySelector('.outside')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });
});

describe('ColourControl Escape layer', () => {
  it('passes Escape through when typing in a text field and closes when focus is outside text fields', async () => {
    appStore.clearSelection();
    if (!appStore.getState().ui.colourMenuOpen) appStore.toggleColourMenu();
    expect(appStore.getState().ui.colourMenuOpen).toBe(true);

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    cleanups.push(() => {
      act(() => root.unmount());
      appStore.clearSelection();
    });

    await act(async () => root.render(createElement(ColourControl)));

    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();

    let ev!: KeyboardEvent;
    await act(async () => {
      ev = pressEscape(field);
    });
    expect(ev.defaultPrevented).toBe(false);
    expect(appStore.getState().ui.colourMenuOpen).toBe(true);

    let evOutside!: KeyboardEvent;
    await act(async () => {
      evOutside = pressEscape(document.body);
    });
    expect(evOutside.defaultPrevented).toBe(true);
    expect(appStore.getState().ui.colourMenuOpen).toBe(false);
  });
});
