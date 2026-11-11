import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BUILD_ONLY, DEV_ONLY, cspPolicy, inlineScripts, scriptHash, withCsp } from './csp';
import { goatcounterLoader } from './goatcounter';
import { AUTH_DOMAIN } from '../src/sync/firebaseProject';

// Job 11: the Content Security Policy on every page.

const parse = (policy: string) =>
  Object.fromEntries(policy.split('; ').map((d) => {
    const [name, ...sources] = d.split(' ');
    return [name, sources];
  }));

describe('Content Security Policy', () => {
  const built = parse(cspPolicy({ dev: false, inline: [goatcounterLoader] }));
  const dev = parse(cspPolicy({ dev: true, inline: [goatcounterLoader] }));

  it('never lets the built site run inline or eval-made scripts, except the ones it was built with (by hash)', () => {
    expect(built['script-src']).not.toContain("'unsafe-inline'");
    expect(built['script-src']).not.toContain("'unsafe-eval'");
    expect(dev['script-src']).not.toContain("'unsafe-eval'");
    expect(built['script-src']).toContain(scriptHash(goatcounterLoader));
    expect(built['script-src'].filter((s: string) => s.startsWith("'sha256-"))).toHaveLength(1);
  });

  it('allows no script host by wildcard or whole scheme, and no plugins or base changes', () => {
    for (const p of [built, dev]) {
      expect(p['script-src'].some((s: string) => s === 'https:' || s === '*' || s.includes('*'))).toBe(false);
      expect(p['connect-src'].some((s: string) => s === 'https:' || s === '*')).toBe(false);
      expect(p['object-src']).toEqual(["'none'"]);
      expect(p['base-uri']).toEqual(["'self'"]);
      expect(p['default-src']).toEqual(["'self'"]);
    }
  });

  it('allows what sign-in, sync, the calendar, the fonts and the Anthropic API use', () => {
    expect(built['script-src']).toEqual(
      expect.arrayContaining(['https://apis.google.com/js/api.js', 'https://apis.google.com/_/scs/', 'https://accounts.google.com/gsi/client']),
    );
    // Not the whole of Google's shared hosts (their other scripts and endpoints could run or be reached).
    expect(built['script-src']).not.toContain('https://apis.google.com');
    expect(built['connect-src']).not.toContain('https://www.googleapis.com');
    expect(built['connect-src']).toEqual(
      expect.arrayContaining([
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
        'https://firestore.googleapis.com',
        'https://www.googleapis.com/calendar/v3/',
        'https://api.anthropic.com',
        'https://fonts.googleapis.com',
        'https://fonts.gstatic.com',
      ]),
    );
    expect(built['frame-src']).toContain('https://note-board-a672a.firebaseapp.com');
  });

  it('the sign-in frame is the Firebase project the app signs in with (one place sets it)', () => {
    expect(built['frame-src']).toContain(`https://${AUTH_DOMAIN}`);
    expect(readFileSync('src/sync/firebase.ts', 'utf8')).toMatch(/authDomain: AUTH_DOMAIN\b/);
  });

  it('the built policy is the dev one without the dev-only sources and with the build-only ones', () => {
    for (const name of Object.keys(built)) {
      const devMinus = dev[name].filter((s: string) => !(DEV_ONLY[name] ?? []).includes(s));
      const builtMinus = built[name].filter((s: string) => !(BUILD_ONLY[name] ?? []).includes(s) && !s.startsWith("'sha256-"));
      expect(builtMinus, name).toEqual(devMinus);
    }
    expect(Object.keys(dev)).toEqual(Object.keys(built));
  });

  it('puts the tag right after <meta charset>, before any script or stylesheet, with the page’s inline scripts hashed', () => {
    const html = '<html><head><meta charset="utf-8" /><link rel="stylesheet" href="x.css"><script>a()</script></head><body><script type="module" src="/m.js"></script></body></html>';
    expect(inlineScripts(html)).toEqual(['a()']);
    // Only a real src attribute makes a script external, not data-src.
    expect(inlineScripts('<script data-src="x">b()</script><script async src="y.js"></script>')).toEqual(['b()']);
    const out = withCsp(html, false);
    const at = out.indexOf('http-equiv="Content-Security-Policy"');
    expect(at).toBeGreaterThan(out.indexOf('<meta charset'));
    expect(at).toBeLessThan(out.indexOf('<link'));
    expect(out).toContain(scriptHash('a()'));
    expect(() => withCsp('<html><head></head></html>', false)).toThrow();
  });

  it('hashes an inline script as the browser reads it: a Windows (CRLF) checkout gives the same hash', () => {
    // The HTML parser turns CRLF and a lone CR into LF before the script's text is hashed.
    const lf = '<meta charset="utf-8" /><script>\n  a();\n  b();\n</script>';
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(withCsp(crlf, false)).toContain(scriptHash('\n  a();\n  b();\n'));
    expect(withCsp(lf.replace(/\n/g, '\r'), false)).toContain(scriptHash('\n  a();\n  b();\n'));
  });

  it('keeps GoatCounter out of `npm run dev`', () => {
    expect(JSON.stringify(dev)).not.toMatch(/gc\.zgo\.at|goatcounter/);
    expect(built['script-src']).toContain('https://gc.zgo.at/count.js');
  });
});
