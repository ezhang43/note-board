import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script, no types
import { foldChanges } from './fold-changes.mjs';

// Each pull request writes its changelog entry to changes/<branch>.md (and its decisions to
// changes/<branch>.decisions.md) instead of editing CHANGELOG.md / docs/decisions.md, so two open
// pull requests never touch the same lines and GitHub never shows "merge conflicts" (job #171).
// scripts/fold-changes.mjs, run by the crew coordinator at publish time, folds them in.

const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const BASE_LOG = '# Changelog\n\n## Old entry (2026-10-01)\n\n- old\n';
const BASE_DEC = '# Decisions\n\n- 2026-10-01 old decision.\n';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'fold-'));
  roots.push(dir);
  mkdirSync(join(dir, 'changes'));
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'CHANGELOG.md'), BASE_LOG);
  writeFileSync(join(dir, 'docs', 'decisions.md'), BASE_DEC);
  writeFileSync(join(dir, 'changes', 'README.md'), 'How fragments work.\n');
  return dir;
}
const read = (dir: string, f: string) => readFileSync(join(dir, f), 'utf8');

describe('foldChanges', () => {
  it('puts a fragment at the top of the changelog, under the heading, and deletes it', () => {
    const dir = repo();
    writeFileSync(join(dir, 'changes', 'fix-dots.md'), '## Dots fixed (2026-10-21)\n\n- The dots are round.\n');
    const done = foldChanges(dir);
    expect(read(dir, 'CHANGELOG.md')).toBe(
      '# Changelog\n\n## Dots fixed (2026-10-21)\n\n- The dots are round.\n\n## Old entry (2026-10-01)\n\n- old\n',
    );
    expect(existsSync(join(dir, 'changes', 'fix-dots.md'))).toBe(false);
    expect(done).toEqual(['fix-dots.md']);
  });

  it('appends decision fragments to the end of docs/decisions.md', () => {
    const dir = repo();
    writeFileSync(join(dir, 'changes', 'a.decisions.md'), '- 2026-10-21 (job a) call a.\n\n');
    writeFileSync(join(dir, 'changes', 'b.decisions.md'), '- 2026-10-21 (job b) call b.');
    foldChanges(dir);
    expect(read(dir, 'docs/decisions.md')).toBe(
      BASE_DEC + '- 2026-10-21 (job a) call a.\n- 2026-10-21 (job b) call b.\n',
    );
    expect(read(dir, 'CHANGELOG.md')).toBe(BASE_LOG);
    expect(readdirSync(join(dir, 'changes'))).toEqual(['README.md']);
  });

  it('folds several fragments in name order, keeping README.md and every entry', () => {
    const dir = repo();
    writeFileSync(join(dir, 'changes', 'b.md'), '## B (2026-10-21)\n\n- b\n');
    writeFileSync(join(dir, 'changes', 'a.md'), '## A (2026-10-21)\n\n- a\n');
    foldChanges(dir);
    const log = read(dir, 'CHANGELOG.md');
    expect(log.indexOf('## A')).toBeLessThan(log.indexOf('## B'));
    expect(log.indexOf('## B')).toBeLessThan(log.indexOf('## Old entry'));
    expect(log.startsWith('# Changelog\n\n')).toBe(true);
    expect(existsSync(join(dir, 'changes', 'README.md'))).toBe(true);
  });

  it('does nothing when there are no fragments, and is safe to run twice', () => {
    const dir = repo();
    expect(foldChanges(dir)).toEqual([]);
    writeFileSync(join(dir, 'changes', 'x.md'), '## X\n\n- x\n');
    foldChanges(dir);
    const once = read(dir, 'CHANGELOG.md');
    expect(foldChanges(dir)).toEqual([]);
    expect(read(dir, 'CHANGELOG.md')).toBe(once);
  });

  it('ignores empty fragments but still removes them', () => {
    const dir = repo();
    writeFileSync(join(dir, 'changes', 'empty.md'), '\n');
    foldChanges(dir);
    expect(read(dir, 'CHANGELOG.md')).toBe(BASE_LOG);
    expect(existsSync(join(dir, 'changes', 'empty.md'))).toBe(false);
  });

  it('runs from the command line on the folder it is given', () => {
    const dir = repo();
    writeFileSync(join(dir, 'changes', 'cli.md'), '## Cli (2026-10-21)\n\n- cli\n');
    const out = spawnSync('node', [join(__dirname, 'fold-changes.mjs'), dir], { encoding: 'utf8' });
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout).toContain('cli.md');
    expect(read(dir, 'CHANGELOG.md')).toContain('## Cli');
  });
});

describe('two branches that each add a fragment', () => {
  /** A throwaway repo: base has the files, branches a and b each add their own fragment; returns the merge. */
  function mergeTwoBranches() {
    const dir = repo();
    const git = (...args: string[]) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    git('init', '-q', '-b', 'base');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    for (const name of ['a', 'b']) {
      git('switch', '-q', '-c', name, 'base');
      writeFileSync(join(dir, 'changes', `${name}.md`), `## Entry ${name} (2026-10-21)\n\n- ${name}\n`);
      writeFileSync(join(dir, 'changes', `${name}.decisions.md`), `- 2026-10-21 decision ${name}.\n`);
      git('add', '-A');
      git('commit', '-q', '-m', name);
    }
    git('switch', '-q', 'a');
    return { dir, merge: git('merge', '--no-edit', 'b') };
  }

  it('merge with no conflict, with no .gitattributes help, and fold into both files', () => {
    const { dir, merge } = mergeTwoBranches();
    expect(merge.status, merge.stdout + merge.stderr).toBe(0);
    foldChanges(dir);
    const log = read(dir, 'CHANGELOG.md');
    expect(log).toContain('## Entry a');
    expect(log).toContain('## Entry b');
    expect(log).not.toContain('<<<<<<<');
    const dec = read(dir, 'docs/decisions.md');
    expect(dec).toContain('decision a.');
    expect(dec).toContain('decision b.');
  });
});
