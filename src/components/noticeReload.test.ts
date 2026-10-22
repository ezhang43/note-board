// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { UPDATED_NOTICE } from '../model/updated';
import { collab } from '../sync/collabSession';
import { NoticeBanner } from './SharePanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Interface review 181 C-L7: the "BusyAnts was updated" note carries a Reload button; other notes don't.

async function show(text: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(NoticeBanner)));
  await act(async () => collab.setNotice(text));
  const names = [...host.querySelectorAll('button')].map((b) => b.textContent || b.getAttribute('aria-label'));
  await act(async () => root.unmount());
  collab.setNotice(null);
  host.remove();
  return names;
}

describe('the notice banner', () => {
  it('offers Reload, then Dismiss, when the site was updated', async () => {
    expect(await show(UPDATED_NOTICE)).toEqual(['Reload', 'Dismiss']);
  });

  it('only has Dismiss for any other note', async () => {
    expect(await show('Nothing on this board to save yet.')).toEqual(['Dismiss']);
  });
});
