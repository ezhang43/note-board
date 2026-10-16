import { beforeEach, describe, expect, it } from 'vitest';
import { feedback } from './feedback';

// Send feedback (job #69): the sending state lives outside the panel, so closing the panel while a
// note is on its way neither traps the board nor lets the note be sent twice.

describe('feedback', () => {
  beforeEach(() => {
    feedback.reset();
    feedback.setSender(null);
  });

  it('sends, says it is sending meanwhile, then sent, and empties the draft', async () => {
    let finish = () => {};
    const sent: string[] = [];
    feedback.setSender((text) => {
      sent.push(text);
      return new Promise<void>((resolve) => (finish = resolve));
    });
    feedback.draft = 'Hello';
    const going = feedback.send('Hello');
    expect(feedback.status()).toBe('sending');
    // A second press while it is on its way does nothing.
    void feedback.send('Hello');
    expect(sent).toEqual(['Hello']);
    finish();
    await going;
    expect(feedback.status()).toBe('sent');
    expect(feedback.draft).toBe('');
  });

  it('keeps the draft when sending fails', async () => {
    feedback.setSender(() => Promise.reject(new Error('no')));
    feedback.draft = 'Keep me';
    await feedback.send('Keep me');
    expect(feedback.status()).toBe('failed');
    expect(feedback.draft).toBe('Keep me');
  });

  it('opening again starts fresh after a send, but not while one is on its way', async () => {
    feedback.setSender(() => Promise.resolve());
    await feedback.send('Hi');
    feedback.open();
    expect(feedback.status()).toBe('');
    feedback.setSender(() => new Promise(() => {}));
    void feedback.send('Hi');
    feedback.close();
    feedback.open();
    expect(feedback.status()).toBe('sending');
  });

  it('a change of account closes the panel and forgets what was typed', () => {
    feedback.open();
    feedback.draft = 'Private words';
    feedback.reset();
    expect(feedback.isOpen()).toBe(false);
    expect(feedback.draft).toBe('');
  });
});
