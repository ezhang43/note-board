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

  it('closing after seeing how it went starts fresh next time, but not while a note is on its way', async () => {
    feedback.setSender(() => Promise.resolve());
    feedback.open();
    await feedback.send('Hi');
    feedback.close();
    feedback.open();
    expect(feedback.status()).toBe('');
    feedback.setSender(() => new Promise(() => {}));
    void feedback.send('Hi');
    feedback.close();
    feedback.open();
    expect(feedback.status()).toBe('sending');
  });

  it('a note that finishes while the panel is closed shows how it went when opened again', async () => {
    let fail = () => {};
    feedback.setSender(() => new Promise<void>((_, reject) => (fail = () => reject(new Error('no')))));
    feedback.open();
    const going = feedback.send('Hi');
    feedback.close();
    fail();
    await going;
    feedback.open();
    expect(feedback.status()).toBe('failed');
  });

  it('a change of account closes the panel and forgets what was typed', () => {
    feedback.open();
    feedback.draft = 'Private words';
    feedback.reset();
    expect(feedback.isOpen()).toBe(false);
    expect(feedback.draft).toBe('');
  });

  it('a change of account mid-send: the next person sees neither “Sending…” nor how the last note went', async () => {
    let finish = () => {};
    feedback.setSender(() => new Promise<void>((resolve) => (finish = resolve)));
    const going = feedback.send('From the last person');
    feedback.reset();
    expect(feedback.status()).toBe('');
    // The next person can send straight away.
    const sent: string[] = [];
    feedback.setSender(async (text) => void sent.push(text));
    await feedback.send('Mine');
    expect(sent).toEqual(['Mine']);
    // They see their own thanks and close it, then start another note.
    feedback.close();
    feedback.open();
    feedback.draft = 'Half typed';
    // The last person's note arriving late changes nothing on screen.
    finish();
    await going;
    expect(feedback.status()).toBe('');
    expect(feedback.draft).toBe('Half typed');
  });

  it('a change of account mid-send that then fails shows no error to the next person', async () => {
    let fail = () => {};
    feedback.setSender(() => new Promise<void>((_, reject) => (fail = () => reject(new Error('no')))));
    const going = feedback.send('From the last person');
    feedback.reset();
    fail();
    await going;
    expect(feedback.status()).toBe('');
  });
});
