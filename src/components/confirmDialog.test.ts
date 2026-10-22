// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { ask, ConfirmDialog } from './ConfirmDialog';

// Interface review 181 C-L9: a question left open when the app goes away (signed out in another tab)
// must not come back after signing in again, where "Delete board" would still delete.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('a question open while the app unmounts', () => {
  it('is answered no, and is not asked again by the next dialog', async () => {
    HTMLDialogElement.prototype.showModal ??= function () {};
    HTMLDialogElement.prototype.close ??= function () {};
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(ConfirmDialog)));
    let answer: boolean | undefined;
    await act(async () => {
      void ask({ title: 'Delete “Trip”?', body: 'Everything on it goes.', action: 'Delete board' }).then((yes) => (answer = yes));
    });
    expect(host.textContent).toContain('Delete “Trip”?');
    await act(async () => root.unmount());
    expect(answer).toBe(false);

    const again = createRoot(host);
    await act(async () => again.render(createElement(ConfirmDialog)));
    expect(host.textContent).not.toContain('Delete “Trip”?');
    await act(async () => again.unmount());
  });
});
