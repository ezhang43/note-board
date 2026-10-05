// @ts-check
// Claude Code hooks for this project (wired up in .claude/settings.json; owner asked 2026-10-05).
//   node scripts/claude-hooks.mjs risky      before an edit: remind Claude when the file is risky
//   node scripts/claude-hooks.mjs typecheck  after an edit: type-check when a .ts/.tsx file changed
//   node scripts/claude-hooks.mjs level [base]  by hand: does this change touch a risky file?
// Claude Code passes the tool call as JSON on stdin. The decisions are pure and tested in
// claude-hooks.test.ts; only the bottom of this file touches stdin, stdout and npm.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isRiskyFile } from './publish-rules.mjs';

/** Longest type-check report passed back to Claude, in lines. */
const MAX_LINES = 40;

/**
 * The file's path from the project root with forward slashes, or null when it lies outside the
 * project. Done by hand rather than with node:path so Windows paths behave the same on any computer.
 * @param {unknown} filePath
 * @param {string} projectDir
 */
function projectPath(filePath, projectDir) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  const file = filePath.replace(/\\/g, '/');
  const root = projectDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const isAbsolute = file.startsWith('/') || /^[a-z]:\//i.test(file);
  if (!isAbsolute) return file.replace(/^\.\//, '');
  // Windows ignores letter case in paths; matching case-insensitively is harmless elsewhere.
  if (!file.toLowerCase().startsWith(root.toLowerCase() + '/')) return null;
  return file.slice(root.length + 1);
}

/**
 * @typedef {{ tool_name?: string, tool_input?: { file_path?: unknown } }} HookInput
 */

/**
 * Before an edit: a reminder for Claude when the file is one where a bug can lose the owner's data
 * (the same list auto-publish uses), else null.
 * @param {HookInput} input
 * @param {string} projectDir
 */
export function riskyEditHook(input, projectDir) {
  const file = projectPath(input.tool_input?.file_path, projectDir);
  if (file === null || !isRiskyFile(file)) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        `${file} is a high-risk file (saving, sync, undo or deleting; scripts/publish-rules.mjs). ` +
        'CLAUDE.md rules 9 and 10: review this change at the `high` level, and a pull request ' +
        'carrying it gets the `high-risk` label and waits for the owner.',
    },
  };
}

/**
 * The risky files in a list of changed files (one per line, as git prints them), each once.
 * Any at all means the change gets the `high` review and the `high-risk` label.
 * @param {string} changedFiles
 */
export function riskyChanges(changedFiles) {
  const files = changedFiles.split(/\r?\n/).map((f) => f.trim()).filter(Boolean);
  return [...new Set(files.filter(isRiskyFile))];
}

/**
 * After an edit: when a TypeScript file in the project changed, run the type check and, if it
 * fails, hand the errors back to Claude (exit code 2). Otherwise exit code 0 and no message.
 * @param {HookInput} input
 * @param {string} projectDir
 * @param {() => { ok: boolean, output: string }} runTypecheck
 */
export function typecheckHook(input, projectDir, runTypecheck) {
  const file = projectPath(input.tool_input?.file_path, projectDir);
  if (file === null || !/\.tsx?$/.test(file) || file.startsWith('node_modules/')) return { code: 0, message: '' };
  const { ok, output } = runTypecheck();
  if (ok) return { code: 0, message: '' };
  const lines = output.trim().split(/\r?\n/);
  const shown = lines.slice(0, MAX_LINES).join('\n');
  const more = lines.length > MAX_LINES ? `\n…and ${lines.length - MAX_LINES} more lines.` : '';
  return { code: 2, message: `npm run typecheck failed after editing ${file}:\n${shown}${more}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (mode === 'level') {
    // Not a hook: run by hand from the project folder. Everything that differs from the base
    // (default origin/build/v1): commits, uncommitted edits and new files.
    const base = process.argv[3] || 'origin/build/v1';
    const git = (/** @type {string[]} */ args) => (spawnSync('git', args, { encoding: 'utf8' }).stdout ?? '').trim();
    // From where this branch left the base, so later changes on the base are not counted as ours.
    const from = git(['merge-base', base, 'HEAD']) || base;
    const risky = riskyChanges(git(['diff', '--name-only', from]) + '\n' + git(['ls-files', '--others', '--exclude-standard']));
    console.log(risky.length ? `high: risky files changed: ${risky.join(', ')}` : 'no risky files changed');
    process.exit(0);
  }
  /** @type {HookInput} */
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0); // nothing usable on stdin: never block Claude over a hook problem
  }
  if (mode === 'risky') {
    const out = riskyEditHook(input, projectDir);
    if (out) process.stdout.write(JSON.stringify(out));
  } else if (mode === 'typecheck') {
    const res = typecheckHook(input, projectDir, () => {
      const r = spawnSync('npm', ['run', '--silent', 'typecheck'], { cwd: projectDir, encoding: 'utf8', shell: true });
      return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    });
    if (res.message) process.stderr.write(res.message + '\n');
    process.exit(res.code);
  }
}
