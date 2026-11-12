// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { SignInScreen } from './SignInScreen';

// Owner request, 2026-11-12: Sign out on a working board asks first. The Sign out on the screens with
// no board to lose (the account can't open a board, the board couldn't be loaded) signs out at once:
// the person is usually stuck there.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(node: ReturnType<typeof createElement>) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, done: () => act(async () => root.unmount()) };
}

const signOutButton = (host: HTMLElement) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Sign out' || b.getAttribute('aria-label') === 'Sign out')!;

describe('the Sign out on the screens without a board', () => {
  for (const status of ['no-access', 'error'] as const) {
    it(`${status}: signs out at once, no question`, async () => {
      HTMLDialogElement.prototype.showModal ??= function () {};
      HTMLDialogElement.prototype.close ??= function () {};
      const onSignOut = vi.fn();
      const { host, done } = await mount(createElement(SignInScreen, { status, error: '', onSignIn: () => {}, onSignOut }));
      await act(async () => signOutButton(host).click());
      expect(onSignOut).toHaveBeenCalledTimes(1);
      expect(document.querySelector('dialog')).toBeNull();
      await done();
    });
  }
});

describe('the Sign out on a working board', () => {
  it('is not signed out until the question is confirmed', async () => {
    HTMLDialogElement.prototype.showModal ??= function () {};
    HTMLDialogElement.prototype.close ??= function () {};
    // A wide window, so the toolbar's own Sign out button shows (the other two are covered in e2e/sign-out-confirm.spec.ts).
    (window as unknown as { happyDOM: { setViewport: (v: { width: number; height: number }) => void } }).happyDOM.setViewport({ width: 1400, height: 900 });
    const onSignOut = vi.fn();
    const { host, done } = await mount(createElement(App, { onSignOut }));
    await act(async () => signOutButton(host).click());
    expect(onSignOut).not.toHaveBeenCalled();
    const dialog = host.querySelector('dialog.ask')!;
    expect(dialog.textContent).toContain('Sign out?');
    expect(dialog.textContent).toContain('Your boards stay saved online. You can sign in again any time.');
    const buttons = [...dialog.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons).toEqual(['Cancel', 'Sign out']);
    await act(async () => (dialog.querySelectorAll('button')[1] as HTMLButtonElement).click());
    expect(onSignOut).toHaveBeenCalledTimes(1);
    await done();
  });

  // Code review: "Your boards stay saved online" would be false when saving online has failed or the
  // device is offline, which is exactly when the person most needs the warning.
  for (const [saveNote, says] of [
    ['Saved', 'Your boards stay saved online'],
    ['Saving…', 'Your boards stay saved online'],
    [null, 'haven’t been saved online yet'],
    ['Offline. Will save when you’re back online', 'haven’t been saved online yet'],
    ['Your account is being deleted on another device; changes here aren’t saved yet', 'haven’t been saved online yet'],
  ] as const) {
    it(`with the save note ${JSON.stringify(saveNote)} the question says "${says}"`, async () => {
      HTMLDialogElement.prototype.showModal ??= function () {};
      HTMLDialogElement.prototype.close ??= function () {};
      (window as unknown as { happyDOM: { setViewport: (v: { width: number; height: number }) => void } }).happyDOM.setViewport({ width: 1400, height: 900 });
      const { host, done } = await mount(createElement(App, { onSignOut: vi.fn(), saveNote }));
      await act(async () => signOutButton(host).click());
      expect(host.querySelector('dialog.ask')!.textContent).toContain(says);
      // Always the same two buttons, and Cancel is still the safe one.
      expect([...host.querySelectorAll('dialog.ask button')].map((b) => b.textContent)).toEqual(['Cancel', 'Sign out']);
      await done();
    });
  }
});
