import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SignInScreen } from './SignInScreen';

// Open to the public (owner request, 2026-10-05; replaces invite-only): any Google account can sign
// in and gets its own private board. The online rules keep boards apart and cap their size.

const screen = (status: 'signed-out' | 'no-access') =>
  renderToStaticMarkup(createElement(SignInScreen, { status, error: '', onSignIn: () => {}, onSignOut: () => {} }));

const rules = readFileSync('firestore.rules', 'utf8');

describe('who can use BusyAnts', () => {
  it('the sign-in screen says the board is private to your Google account', () => {
    const html = screen('signed-out');
    expect(html).toContain('Sign in with Google');
    expect(html).toMatch(/only you can see it/i);
  });

  it('an account the rules turn away is not told it is invite-only, and can sign out', () => {
    const html = screen('no-access');
    expect(html).not.toContain('invite');
    expect(html).toContain('Sign out');
  });

  it('the sign-in screen is a card: logo, the About page’s pitch, Google’s own button, a note, and About, Privacy and Terms links (job #165b)', () => {
    const html = screen('signed-out');
    expect(html).toContain('busyants-icon.svg');
    expect(html).toContain('Free, with no limits. Your notes stay safe.');
    // Google's standard button: the unmodified four-color G, then "Sign in with Google" (Google's branding guidelines).
    expect(html).toMatch(/<button[^>]*class="google-button"[^>]*>.*#EA4335.*#4285F4.*#FBBC05.*#34A853.*<span>Sign in with Google<\/span><\/button>/);
    expect(html).toMatch(/only you can see it/i);
    for (const [name, path] of [['About', 'about/'], ['Privacy', 'privacy/'], ['Terms', 'terms/']]) expect(html).toContain(`<a href="/${path}">${name}</a>`);
  });

  it('the pitch and the Google button show only where there is something to sign in to', () => {
    const checking = renderToStaticMarkup(createElement(SignInScreen, { status: 'checking', error: '', onSignIn: () => {}, onSignOut: () => {} }));
    expect(checking).toContain('Opening your board');
    for (const html of [checking, screen('no-access')]) {
      expect(html).not.toContain('Free, with no limits');
      expect(html).not.toContain('google-button');
    }
    expect(screen('no-access')).toContain('Sign out');
  });

  it('a share link adds "Sign in to open the board shared with you." above the button; an error shows under it', () => {
    const global = globalThis as { location?: unknown };
    const had = global.location;
    global.location = { search: '?join=abc.def' };
    try {
      expect(screen('signed-out')).toContain('Sign in to open the board shared with you.');
    } finally {
      global.location = had;
    }
    expect(screen('signed-out')).not.toContain('shared with you');
    const bad = renderToStaticMarkup(createElement(SignInScreen, { status: 'signed-out', error: 'Sign-in failed', onSignIn: () => {}, onSignOut: () => {} }));
    expect(bad).toContain('role="alert"');
    expect(bad).toContain('Sign-in failed');
  });

  it('the online rules let any verified Google account in, each to its own board only', () => {
    expect(rules).toContain('request.auth.uid == uid');
    expect(rules).toContain('email_verified == true');
    expect(rules).not.toMatch(/@gmail\.com/);
  });

  it('the online rules cap what can be saved: a board or version under 900,000 characters, only the fields the app writes', () => {
    expect(rules).toContain('text.size() <= 900000');
    // The board, a version's board, and a shared board (owner request: editing together).
    expect(rules.match(/boardText\(request\.resource\.data\.data\)/g)?.length).toBe(3);
    expect(rules).toContain("hasOnly(['data', 'client', 'updatedAt'])");
    expect(rules).toContain("hasOnly(['data'])");
    expect(rules).toContain("hasOnly(['savedAt', 'cards', 'columns', 'boards', 'hash', 'kind'])");
    expect(rules).toContain("(!('kind' in request.resource.data) || request.resource.data.kind == 'outside')");
  });

  it('a shared board is read and changed only by the people it is shared with; joining needs the current link', () => {
    expect(rules).toContain('allow read: if isMember();');
    expect(rules).toContain('request.resource.data.key == share().link');
    expect(rules).toContain('request.resource.data.rev == resource.data.rev + 1');
    expect(rules).toContain('allow delete: if signedIn() && resource.data.owner == request.auth.uid;');
    // A member's photo is only ever a secure web address (review fix).
    expect(rules).toContain("request.resource.data.photo.matches('https://.*')");
  });

  it('after deleting an account, the sign-in screen says so (job #63)', () => {
    const html = renderToStaticMarkup(createElement(SignInScreen, { status: 'signed-out', error: '', deleted: true, onSignIn: () => {}, onSignOut: () => {} }));
    expect(html).toContain('Your account and data were deleted.');
    expect(screen('signed-out')).not.toContain('were deleted');
  });

  it('the online rules let a person delete everything of theirs, so deleting an account needs no new rules (job #63)', () => {
    // Their boards, version history (list and boards) and list of shares.
    expect(rules.match(/allow read, delete: if isOwner\(uid\);/g)?.length).toBe(4);
    // The boards they shared, everyone's records on those, and their own record on anyone's.
    expect(rules).toContain('allow delete: if signedIn() && resource.data.owner == request.auth.uid;');
    expect(rules).toContain('(request.auth.uid == uid || get(/databases/$(database)/documents/shared/$(sid)).data.owner == request.auth.uid)');
  });

  it('feedback (job #69): only a verified signed-in person can send it, as themselves, and no one can read, change or delete it from the app', () => {
    const start = rules.indexOf('match /feedback/{id} {');
    expect(start).toBeGreaterThan(-1);
    const rule = rules.slice(start, rules.indexOf('\n    }', start));
    expect(rule.match(/allow /g)?.length).toBe(1);
    expect(rule).toContain('allow create: if signedIn()');
    expect(rule).toContain("request.resource.data.keys().hasOnly(['text', 'uid', 'email', 'sentAt'])");
    expect(rule).toContain('request.resource.data.uid == request.auth.uid');
    expect(rule).toContain('request.resource.data.email == request.auth.token.email');
    expect(rule).toContain('request.resource.data.text is string');
    expect(rule).toContain('request.resource.data.text.size() >= 1');
    expect(rule).toContain('request.resource.data.text.size() <= 1000');
    expect(rule).toContain('request.resource.data.sentAt == request.time');
    // signedIn() is the verified-account check the shared-board rules use.
    expect(rules).toContain('return request.auth != null && request.auth.token.email_verified == true;');
  });
});
