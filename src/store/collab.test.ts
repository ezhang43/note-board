import { describe, expect, it } from 'vitest';
import { personFrom } from './collab';

// Who someone is to the people a board is shared with (review fixes, 2026-10-05).

describe('a person as others see them', () => {
  it('their Google name and photo', () => {
    expect(personFrom({ uid: 'u1', displayName: 'Erika Zhu', photoURL: 'https://lh3.googleusercontent.com/a/x', email: 'erika@example.com' })).toEqual({
      uid: 'u1',
      name: 'Erika Zhu',
      photo: 'https://lh3.googleusercontent.com/a/x',
    });
  });

  it('never their email address, even without a name', () => {
    const p = personFrom({ uid: 'u1', displayName: null, photoURL: null, email: 'erika@example.com' });
    expect(JSON.stringify(p)).not.toContain('erika');
    expect(p.name).toBe('Someone');
  });

  it('a photo only from a secure web address', () => {
    expect(personFrom({ uid: 'u1', displayName: 'E', photoURL: 'http://tracker.example/p.png' }).photo).toBeNull();
  });
});
