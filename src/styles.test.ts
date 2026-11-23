import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import postcss from 'postcss';
import { expect, test } from 'vitest';

/** Reads src/styles.css and every stylesheet it @imports, in cascade order. */
function loadStylesheets(entry = 'src/styles.css'): { file: string; css: string }[] {
  const dir = dirname(entry);
  const text = readFileSync(entry, 'utf8');
  const sheets: { file: string; css: string }[] = [];
  for (const match of text.matchAll(/^@import\s+['"]([^'"]+)['"];/gm)) {
    const file = join(dir, match[1]);
    sheets.push({ file, css: readFileSync(file, 'utf8') });
  }
  return sheets.length > 0 ? sheets : [{ file: entry, css: text }];
}

test('src/styles.css imports every partial in src/styles/', () => {
  const imported = loadStylesheets().map((s) => s.file.replace(/\\/g, '/'));
  const onDisk = readdirSync('src/styles')
    .filter((f) => f.endsWith('.css'))
    .map((f) => `src/styles/${f}`);
  expect(imported.length).toBeGreaterThan(0);
  expect([...imported].sort()).toEqual([...onDisk].sort());
});

// A rule written inside another rule, without `&`, means "a descendant of the parent": a hover rule like
// `.tb-button { .tb-button:hover {...} }` becomes `.tb-button .tb-button:hover` and never matches anything.
test('every rule nested in another rule starts with &', () => {
  const bad: string[] = [];
  let rulesChecked = 0;
  for (const { file, css } of loadStylesheets()) {
    const root = postcss.parse(css);
    root.walkRules((rule) => {
      rulesChecked++;
      if (rule.parent?.type === 'rule' && !rule.selector.trimStart().startsWith('&')) {
        bad.push(`${file}:${rule.source?.start?.line}: ${rule.selector}`);
      }
    });
  }
  expect(rulesChecked).toBeGreaterThan(0);
  expect(bad).toEqual([]);
});

// Build rule 6: every color is a CSS variable. The find highlights used to hold their colors directly.
test('the find highlight rules use color variables, not literal colors', () => {
  const bad: string[] = [];
  let findDeclsChecked = 0;
  for (const { file, css } of loadStylesheets()) {
    const root = postcss.parse(css);
    root.walkDecls((decl) => {
      const rule = decl.parent;
      if (rule?.type !== 'rule' || !/find-(mark|target|current)/.test((rule as postcss.Rule).selector)) return;
      findDeclsChecked++;
      if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(decl.value)) bad.push(`${file}:${decl.source?.start?.line}: ${decl.prop}: ${decl.value}`);
    });
  }
  expect(findDeclsChecked).toBeGreaterThan(0);
  expect(bad).toEqual([]);
});

