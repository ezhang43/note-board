import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SignInScreen } from './SignInScreen';

// Invite-only (owner request, 2026-10-05): each invited Google account gets its own board; others
// are told it's invite-only.

const screen = (status: 'signed-out' | 'no-access') =>
  renderToStaticMarkup(createElement(SignInScreen, { status, error: '', onSignIn: () => {}, onSignOut: () => {} }));

describe('who can use BusyAnts', () => {
  it('an account that is not invited is told BusyAnts is invite-only, and what to do', () => {
    const html = screen('no-access');
    expect(html).toContain('invite-only');
    expect(html).toContain('Sign out');
    expect(html).not.toContain('owns it');
  });

  it('the online rules let in exactly the invited accounts, each to their own board only', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain('request.auth.uid == uid');
    expect(rules).toContain('email_verified == true');
    const invited = [...rules.matchAll(/"([^"\s]+@[^"\s]+)"/g)].map((m) => m[1]).sort();
    expect(invited).toEqual(['erikazhu95@gmail.com', 'ezhang43@gmail.com']);
  });
});
