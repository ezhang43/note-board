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

// Build rule 6: every color is a CSS variable. The find highlights used to hold their colors directly.
test('the find highlight rules use color variables, not literal colors', () => {
  const root = postcss.parse(readFileSync('src/styles.css', 'utf8'));
  const bad: string[] = [];
  root.walkDecls((decl) => {
    const rule = decl.parent;
    if (rule?.type !== 'rule' || !/find-(mark|target|current)/.test((rule as postcss.Rule).selector)) return;
    if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(decl.value)) bad.push(`line ${decl.source?.start?.line}: ${decl.prop}: ${decl.value}`);
  });
  expect(bad).toEqual([]);
});
