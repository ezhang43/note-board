import { describe, expect, it } from 'vitest';
import { canDelete, canResolve, chipOf, commentable, commentText, sinceLabel, threadOf, threadPlace, type Comment } from './comments';

// Comments on cards (job 161, PR 4): the rules the chip, the thread and the store share.

let n = 0;
const c = (over: Partial<Comment> = {}): Comment => ({ id: `c${++n}`, card: 'k_1', text: 'hi', author: 'bob', name: 'Bob', photo: null, at: 100, resolved: false, resolvedAt: null, ...over });

describe('commentText', () => {
  it('trims, and takes 1 to 1,000 characters', () => {
    expect(commentText('  Looks good \n')).toBe('Looks good');
    expect(commentText('   ')).toBeNull();
    expect(commentText('x'.repeat(1000))).toHaveLength(1000);
    expect(commentText('x'.repeat(1001))).toBeNull();
  });
});

describe('commentable', () => {
  it('only a card id the online rules accept', () => {
    expect(commentable('k_1a2b3c4d')).toBe(true);
    expect(commentable('../x')).toBe(false);
    expect(commentable('')).toBe(false);
    expect(commentable('x'.repeat(101))).toBe(false);
  });
});

describe('threadOf', () => {
  it('a card’s comments, oldest first; its starter is the first comment’s author', () => {
    const t = threadOf([c({ at: 300, author: 'cat' }), c({ card: 'k_2' }), c({ at: 200, author: 'dan' })], 'k_1');
    expect(t.comments.map((x) => x.author)).toEqual(['dan', 'cat']);
    expect(t.starter).toBe('dan');
    expect(t.resolved).toBe(false);
    expect(threadOf([], 'k_1')).toEqual({ comments: [], resolved: false, starter: null, first: null });
  });

  it('resolved when its first comment is, until someone replies after it was resolved', () => {
    const first = c({ at: 100, resolved: true, resolvedAt: 500 });
    expect(threadOf([first, c({ at: 400 })], 'k_1').resolved).toBe(true);
    expect(threadOf([first, c({ at: 600 })], 'k_1').resolved).toBe(false);
    // Only the first comment's state counts.
    expect(threadOf([c({ at: 100 }), c({ at: 200, resolved: true, resolvedAt: 300 })], 'k_1').resolved).toBe(false);
  });
});

describe('chipOf', () => {
  it('the count of an open thread, and a dot for a comment by someone else since it was last opened here', () => {
    const t = threadOf([c({ at: 100, author: 'bob' }), c({ at: 200, author: 'me' }), c({ at: 300, author: 'cat' })], 'k_1');
    expect(chipOf(t, undefined, 'me')).toEqual({ count: 3, unread: true });
    expect(chipOf(t, 300, 'me')).toEqual({ count: 3, unread: false });
    expect(chipOf(t, 250, 'me')).toEqual({ count: 3, unread: true });
    // My own comment never counts as new.
    expect(chipOf(threadOf([c({ author: 'me' })], 'k_1'), undefined, 'me')).toEqual({ count: 1, unread: false });
  });

  it('nothing for a resolved thread or none', () => {
    expect(chipOf(threadOf([c({ resolved: true, resolvedAt: 900 })], 'k_1'), undefined, 'me')).toEqual({ count: 0, unread: false });
    expect(chipOf(threadOf([], 'k_1'), undefined, 'me')).toEqual({ count: 0, unread: false });
  });
});

describe('who may resolve and delete', () => {
  const t = threadOf([c({ author: 'bob' })], 'k_1');
  it('resolve: editors any thread; commenters only one they started; viewers none', () => {
    expect(canResolve('edit', t, 'cat')).toBe(true);
    expect(canResolve('comment', t, 'bob')).toBe(true);
    expect(canResolve('comment', t, 'cat')).toBe(false);
    expect(canResolve('view', t, 'bob')).toBe(false);
    expect(canResolve('edit', threadOf([], 'k_1'), 'cat')).toBe(false);
  });
  it('delete: its author, or the person who shared the board', () => {
    expect(canDelete(c({ author: 'bob' }), 'bob', false)).toBe(true);
    expect(canDelete(c({ author: 'bob' }), 'cat', false)).toBe(false);
    expect(canDelete(c({ author: 'bob' }), 'alice', true)).toBe(true);
  });
});

describe('sinceLabel', () => {
  const now = new Date(2026, 9, 22, 15, 0).getTime();
  it('just now, minutes, hours, yesterday, then the date', () => {
    expect(sinceLabel(now - 20_000, now)).toBe('Just now');
    expect(sinceLabel(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(sinceLabel(now - 2 * 3600_000, now)).toBe('2 h ago');
    expect(sinceLabel(new Date(2026, 9, 21, 9, 0).getTime(), now)).toBe('Yesterday');
    expect(sinceLabel(new Date(2026, 9, 12, 9, 0).getTime(), now)).toBe('12 Oct');
    // A clock a little ahead of this device's: still "Just now".
    expect(sinceLabel(now + 5000, now)).toBe('Just now');
  });
});

describe('threadPlace', () => {
  const screen = { width: 1280, height: 760 };
  const size = { width: 330, height: 400 };
  it('right of the card, level with its top', () => {
    expect(threadPlace({ left: 40, right: 280, top: 150 }, size, screen, 64)).toEqual({ left: 296, top: 150 });
  });
  it('left of it when there is no room on the right; inside the window when neither fits', () => {
    expect(threadPlace({ left: 900, right: 1140, top: 150 }, size, screen, 64)).toEqual({ left: 554, top: 150 });
    expect(threadPlace({ left: 100, right: 1200, top: 150 }, size, screen, 64).left).toBe(screen.width - 8 - size.width);
  });
  it('kept below the toolbar and above the window’s bottom', () => {
    expect(threadPlace({ left: 40, right: 280, top: 10 }, size, screen, 64).top).toBe(72);
    expect(threadPlace({ left: 40, right: 280, top: 700 }, size, screen, 64).top).toBe(screen.height - 8 - size.height);
  });
});
