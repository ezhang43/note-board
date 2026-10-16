import { describe, expect, it } from 'vitest';
import { deletionCounts, planShares } from './account';

// Deleting your account and data (job #63, Google Play): what happens to each shared board, and
// what the confirmation says will go.

describe('planShares', () => {
  it('deletes the boards this person shared for everyone, and only leaves the ones shared with them', () => {
    const plan = planShares('me', [
      { id: 's1', owner: 'me' },
      { id: 's2', owner: 'bob' },
      { id: 's3', owner: 'me' },
    ]);
    expect(plan).toEqual({ deleteForEveryone: ['s1', 's3'], leave: ['s2'] });
  });

  it('just leaves a share that is gone or no longer readable (removed, or deleted on a run that failed part-way)', () => {
    expect(planShares('me', [{ id: 's1', owner: null }])).toEqual({ deleteForEveryone: [], leave: ['s1'] });
  });

  it('has nothing to do with no shares', () => {
    expect(planShares('me', [])).toEqual({ deleteForEveryone: [], leave: [] });
  });
});

describe('deletionCounts', () => {
  it('counts this person’s boards (not the boards someone else shared with them) and the shares on each side', () => {
    const counts = deletionCounts(
      ['home', 'trip', 'trip-sub', 'work', 'bobs', 'bobs-sub'],
      [
        { boards: ['trip', 'trip-sub'], owner: true },
        { boards: ['bobs', 'bobs-sub'], owner: false },
      ],
    );
    expect(counts).toEqual({ boards: 4, sharedByMe: 1, sharedWithMe: 1 });
  });

  it('a person with only a home board has one board and no shares', () => {
    expect(deletionCounts(['home'], [])).toEqual({ boards: 1, sharedByMe: 0, sharedWithMe: 0 });
  });
});
