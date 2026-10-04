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

  it('the online rules let any verified Google account in, each to its own board only', () => {
    expect(rules).toContain('request.auth.uid == uid');
    expect(rules).toContain('email_verified == true');
    expect(rules).not.toMatch(/@gmail\.com/);
  });

  it('the online rules cap what can be saved: a board or version under 900,000 characters, only the fields the app writes', () => {
    expect(rules).toContain('text.size() <= 900000');
    expect(rules.match(/boardText\(request\.resource\.data\.data\)/g)?.length).toBe(2); // the board, and a version's board
    expect(rules).toContain("hasOnly(['data', 'client', 'updatedAt'])");
    expect(rules).toContain("hasOnly(['data'])");
    expect(rules).toContain("hasOnly(['savedAt', 'cards', 'columns', 'hash'])");
  });
});
