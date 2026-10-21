// @ts-check
// Folds pull-request fragments into the two shared logs (job #171). A pull request never edits
// CHANGELOG.md or docs/decisions.md itself (two open ones would conflict on GitHub, which ignores
// .gitattributes); it adds changes/<branch>.md (changelog entry) and, if it made calls,
// changes/<branch>.decisions.md. The crew coordinator runs `node scripts/fold-changes.mjs` when the
// owner says "publish", and commits the result.
//   changes/<name>.md            -> top of CHANGELOG.md, under the "# Changelog" heading
//   changes/<name>.decisions.md  -> end of docs/decisions.md
// Fragments are used in name order and deleted. changes/README.md stays.
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} root the repository's root folder
 * @returns {string[]} the fragment files folded, in the order used
 */
export function foldChanges(root) {
  const dir = join(root, 'changes');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
  const text = (/** @type {string} */ f) => readFileSync(join(dir, f), 'utf8').trim();
  const pick = (/** @type {boolean} */ decisions) =>
    files.filter((f) => f.endsWith('.decisions.md') === decisions).map(text).filter(Boolean);

  const entries = pick(false);
  if (entries.length) {
    const log = join(root, 'CHANGELOG.md');
    const old = readFileSync(log, 'utf8');
    const at = old.indexOf('\n') + 1; // just after the "# Changelog" heading line
    const rest = old.slice(at).replace(/^\n+/, '');
    writeFileSync(log, `${old.slice(0, at)}\n${entries.join('\n\n')}\n\n${rest}`);
  }
  const calls = pick(true);
  if (calls.length) {
    const file = join(root, 'docs', 'decisions.md');
    writeFileSync(file, `${readFileSync(file, 'utf8').trimEnd()}\n${calls.join('\n')}\n`);
  }
  files.forEach((f) => rmSync(join(dir, f)));
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? join(fileURLToPath(import.meta.url), '..', '..');
  const done = foldChanges(root);
  console.log(done.length ? `Folded ${done.length} fragment(s): ${done.join(', ')}` : 'No fragments to fold.');
}
