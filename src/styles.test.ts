import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { expect, test } from 'vitest';

// A rule written inside another rule, without `&`, means "a descendant of the parent": a hover rule like
// `.tb-button { .tb-button:hover {...} }` becomes `.tb-button .tb-button:hover` and never matches anything.
test('every rule nested in another rule starts with &', () => {
  const root = postcss.parse(readFileSync('src/styles.css', 'utf8'));
  const bad: string[] = [];
  root.walkRules((rule) => {
    if (rule.parent?.type === 'rule' && !rule.selector.trimStart().startsWith('&')) {
      bad.push(`line ${rule.source?.start?.line}: ${rule.selector}`);
    }
  });
  expect(bad).toEqual([]);
});
