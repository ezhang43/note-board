import { describe, expect, it } from 'vitest';
import { memoryServer, personFrom } from './collab';

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

  it('a photo only from Google’s photo server, so no other server sees who looks (review 181-A M2)', () => {
    const photo = (photoURL: string) => personFrom({ uid: 'u1', displayName: 'E', photoURL }).photo;
    expect(photo('https://tracker.example/p.png')).toBeNull();
    expect(photo('https://lh3.googleusercontent.com.evil.example/a')).toBeNull();
    expect(photo('https://lh5.googleusercontent.com/-abc/photo.jpg')).toBe('https://lh5.googleusercontent.com/-abc/photo.jpg');
  });
});

describe('joining a shared board (owner decision, 2026-10-18)', () => {
  it('says whether this join added the person', async () => {
    const { server } = memoryServer();
    const dan = { uid: 'dan', name: 'Dan', photo: null };
    const carol = { uid: 'carol', name: 'Carol', photo: null };
    await server.createShare(dan, 's1', 'n1', 'key', '{}', 'dan-page');
    expect(await server.join(carol, 's1', 'key')).toBe(true);
    expect(await server.join(carol, 's1', 'key')).toBe(false);
    expect(await server.join(dan, 's1', 'key')).toBe(false);
  });
});
