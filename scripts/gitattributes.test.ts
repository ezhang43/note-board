import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// .gitattributes: two pull requests that each add a new entry at the top of CHANGELOG.md or
// docs/decisions.md merge cleanly, keeping both entries (job #153).

const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** A throwaway repo whose two branches each add a different first entry to `file`; returns the merge. */
function mergeTwoTopEntries(file: string, withAttributes: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'union-'));
  roots.push(dir);
  const git = (...args: string[]) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'base');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  if (withAttributes) copyFileSync(join(__dirname, '..', '.gitattributes'), join(dir, '.gitattributes'));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  const write = (text: string) => writeFileSync(join(dir, file), text);
  write('# Log\n\n## Old entry\n\n- old\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  for (const name of ['a', 'b']) {
    git('switch', '-q', '-c', name, 'base');
    write(`# Log\n\n## New entry ${name}\n\n- ${name}\n\n## Old entry\n\n- old\n`);
    git('commit', '-q', '-am', name);
  }
  git('switch', '-q', 'a');
  const merge = git('merge', '--no-edit', 'b');
  return { merge, text: readFileSync(join(dir, file), 'utf8') };
}

describe.each(['CHANGELOG.md', 'docs/decisions.md'])('union merge of %s', (file) => {
  it('keeps both new entries and does not stop on a conflict', () => {
    const { merge, text } = mergeTwoTopEntries(file, true);
    expect(merge.status, merge.stdout + merge.stderr).toBe(0);
    expect(text).toContain('## New entry a');
    expect(text).toContain('## New entry b');
    expect(text.match(/## Old entry/g)).toHaveLength(1);
    expect(text).not.toContain('<<<<<<<');
  });

  it('would conflict without the .gitattributes lines (so this test can fail)', () => {
    expect(mergeTwoTopEntries(file, false).merge.status).not.toBe(0);
  });
});
