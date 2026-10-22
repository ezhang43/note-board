import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The browser's own pop-ups are replaced by the app's questions and the note banner (job 170).
// Only the local-testing Sign out note in main.tsx (never on the published site) is left.

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

describe('no browser pop-ups', () => {
  it('nothing in the app calls confirm, alert or prompt', () => {
    const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
    const found = files('src').filter((f) => !f.endsWith('main.tsx') && /\b(confirm|alert|prompt)\(/.test(code(f)));
    expect(found).toEqual([]);
  });
});
