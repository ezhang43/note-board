// @ts-check
// Claude Code hooks for this project (wired up in .claude/settings.json; owner asked 2026-10-05).
//   node scripts/claude-hooks.mjs risky      before an edit: remind Claude when the file is risky
//   node scripts/claude-hooks.mjs bash       before a Bash command: refuse broad pkill/killall and pushes to main/build/v1
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
 * @typedef {{ tool_name?: string, tool_input?: { file_path?: unknown, command?: unknown } }} HookInput
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

const LIVE_BRANCHES = ['main', 'build/v1'];

/**
 * Before a Bash command: refuse what hurts the other crew sessions sharing this machine and repo
 * (owner "go" 2026-10-21, job #153). Exit code 2 with the reason, else 0.
 *   - pkill / killall: kills other workers' browsers and servers; stop only a PID you started.
 *   - a force push to main or build/v1: never, for anyone.
 *   - any push onto main or build/v1 (`git push origin <sha>:main`, `build/v1:main`, `HEAD:main`):
 *     only the crew coordinator, whose Claude Code is started with CREW_COORDINATOR=1.
 * simple: looks at each command's words, not at the shell. Quoted text that looks like a command
 * (`echo "x; pkill y"`) is refused too, a bare `git push --force` with no branch named is not caught
 * (it pushes the current branch), and a coordinator-only variable set inside the command itself is
 * ignored on purpose. Upgrade if a real mix-up gets through.
 * @param {HookInput} input
 * @param {Record<string, string | undefined>} env
 */
export function bashGuardHook(input, env) {
  const command = input.tool_name === 'Bash' ? input.tool_input?.command : undefined;
  if (typeof command !== 'string') return { code: 0, message: '' };
  const refuse = (/** @type {string} */ why) => ({ code: 2, message: `Blocked: ${why}` });
  for (const segment of command.split(/[;&|\n]/)) {
    let words = segment.trim().split(/\s+/).map((w) => w.replace(/^['"]|['"]$/g, ''));
    while (words.length && /^(\w+=\S*|sudo|env|command|nohup|time|xargs)$/.test(words[0])) words = words.slice(1);
    const program = (words[0] ?? '').replace(/^.*[\\/]/, '').replace(/\.exe$/i, '');
    if (program === 'pkill' || program === 'killall') {
      return refuse(
        `${program} can kill other sessions' browsers and servers on this machine. ` +
          'Stop only a process you started yourself, by its PID: kill <pid>.',
      );
    }
    const push = program === 'git' ? words.indexOf('push') : -1;
    if (push < 0) continue;
    const args = words.slice(push + 1);
    const forced = args.some((a) => /^--force(-with-lease|-if-includes)?(=.*)?$/.test(a) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a));
    const refs = args.filter((a) => !a.startsWith('-') && a !== '');
    const live = refs.filter((r) => LIVE_BRANCHES.includes(r.replace(/^\+/, '').replace(/^.*:/, '').replace(/^refs\/heads\//, '')));
    if (!live.length) continue;
    if (forced || live.some((r) => r.startsWith('+'))) {
      return refuse(`never force-push to ${live.join(', ')}. Merge origin/build/v1 into your branch instead (CLAUDE.md rule 9).`);
    }
    if (env.CREW_COORDINATOR !== '1') {
      return refuse(
        `only the crew coordinator pushes to ${live.join(', ')} (CLAUDE.md rule 9). ` +
          'Push your own work branch and open a pull request into build/v1.',
      );
    }
  }
  return { code: 0, message: '' };
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
  } else if (mode === 'bash') {
    const res = bashGuardHook(input, process.env);
    if (res.message) process.stderr.write(res.message + '\n');
    process.exit(res.code);
  } else if (mode === 'typecheck') {
    const res = typecheckHook(input, projectDir, () => {
      const r = spawnSync('npm', ['run', '--silent', 'typecheck'], { cwd: projectDir, encoding: 'utf8', shell: true });
      return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    });
    if (res.message) process.stderr.write(res.message + '\n');
    process.exit(res.code);
  }
}
