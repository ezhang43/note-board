// @vitest-environment happy-dom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cursorLost, forgetLostCursor, leaveField, watchLostCursor } from './lostCursor';

// Job sync-keeps-cursor (2026-11-09): the text box being typed in leaves the screen because of something else (a synced
// change redrawing the list): the cursor falls onto the page, and Delete / Backspace must not delete the block.

let stop: () => void;
let now = 0;
beforeAll(() => {
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  stop = watchLostCursor();
});
afterAll(() => {
  stop();
  vi.restoreAllMocks();
});

let field: HTMLTextAreaElement;
let card: HTMLElement;

const fire = (on: Element, type: string, init: PointerEventInit = {}) => on.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }));
const press = (on: Element) => {
  fire(on, 'pointerdown', { buttons: 1 });
  fire(on, 'pointerup');
};
/** Lets a moment go by: long after the last press, and after the checks the tracker leaves for later. */
const later = async () => {
  now += 5000;
  await Promise.resolve();
};

beforeEach(async () => {
  document.body.replaceChildren();
  // Start from the focus on something that is no text box (forgets the last test's box).
  const start = document.createElement('button');
  document.body.append(start);
  start.focus();
  start.remove();
  await later();
  card = document.createElement('article');
  card.dataset.cardId = 'c1';
  field = document.createElement('textarea');
  card.append(field);
  document.body.append(card);
});

describe('cursorLost', () => {
  it('is false before anything was typed in, and while the cursor is in the text box', () => {
    expect(cursorLost()).toBe(false);
    field.focus();
    expect(cursorLost()).toBe(false);
  });

  it('is true once the text box being typed in is taken off the page, and stays true for later keys', async () => {
    field.focus();
    field.remove();
    await later();
    expect(cursorLost()).toBe(true);
    expect(cursorLost()).toBe(true);
  });

  it('is true when the whole block goes', async () => {
    field.focus();
    card.remove();
    await later();
    expect(cursorLost()).toBe(true);
  });

  it('is true when the box loses the cursor while staying on the page, with no press or key of the person’s', async () => {
    field.focus();
    field.blur();
    await later();
    expect(cursorLost()).toBe(true);
  });

  it('is still true after a click inside the box being typed in, then the box going straight after (code review)', async () => {
    field.focus();
    press(field);
    field.remove(); // a change arriving just after the click
    await Promise.resolve();
    expect(cursorLost()).toBe(true);
  });

  it('is false after a click elsewhere that takes the cursor out of the box (the card frame, say)', async () => {
    field.focus();
    fire(card, 'pointerdown', { buttons: 1 });
    field.blur(); // the press moves the focus to the page
    fire(card, 'pointerup');
    await later();
    field.remove();
    expect(cursorLost()).toBe(false);
  });

  it('is false after a tap that moves the focus a little after it is let go (code review)', async () => {
    field.focus();
    press(card);
    now += 300;
    field.blur();
    await later();
    expect(cursorLost()).toBe(false);
  });

  it('is true when the focus goes long after a press whose release never came (code review)', async () => {
    field.focus();
    fire(card, 'pointerdown', { buttons: 1 });
    await later();
    field.blur();
    await later();
    expect(cursorLost()).toBe(true);
  });

  it('is false after a click once the box has gone (a deliberate choice of what is selected)', async () => {
    field.focus();
    field.remove();
    await later();
    press(document.body);
    expect(cursorLost()).toBe(false);
  });

  it('is false after the focus moves to something else, a button outside the item say', () => {
    field.focus();
    const button = document.createElement('button');
    card.append(button);
    button.focus();
    field.remove();
    expect(cursorLost()).toBe(false);
  });

  it('is true when a checklist item’s tick box with the keyboard on it goes (code review)', async () => {
    const row = document.createElement('div');
    row.dataset.itemId = 'i1';
    const tick = document.createElement('input');
    tick.type = 'checkbox';
    row.append(tick);
    card.append(row);
    tick.focus();
    row.remove();
    await later();
    expect(cursorLost()).toBe(true);
  });

  it('is false for a text box outside the board’s blocks (a panel’s)', () => {
    const outside = document.createElement('input');
    document.body.append(outside);
    outside.focus();
    outside.remove();
    expect(cursorLost()).toBe(false);
  });

  it('is false after a key or button the app answers by taking the cursor out (Escape, Done), even once the box goes later (code review)', async () => {
    field.focus();
    leaveField(field);
    expect(document.activeElement).not.toBe(field);
    expect(cursorLost()).toBe(false);
    card.remove(); // say, the person's own Delete
    await later();
    expect(cursorLost()).toBe(false);
  });

  it('is true again for the next box typed in that goes', async () => {
    field.focus();
    leaveField(field);
    const other = document.createElement('textarea');
    card.append(other);
    other.focus();
    other.remove();
    await later();
    expect(cursorLost()).toBe(true);
  });

  it('is still true when a key presses a button (Space on a tick box sends a click) and a change takes the box away just after (code review)', async () => {
    field.focus();
    field.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    field.blur(); // the box loses the cursor but stays on the page (a redraw moving it, say)
    await later();
    expect(cursorLost()).toBe(true);
  });

  it('is false once the person switches boards from the keyboard (code review)', async () => {
    field.focus();
    field.remove();
    await later();
    forgetLostCursor();
    expect(cursorLost()).toBe(false);
  });
});
