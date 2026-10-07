import { describe, expect, it } from 'vitest';
import { decide, isRiskyFile } from './publish-rules.mjs';

// Auto-publish for low-risk pull requests (owner chose this on 2026-10-05): which commits on
// build/v1 may go live without the owner saying "publish".

const pr = (number: number, files: string[], labels: string[] = []) => ({ number, base: 'build/v1', merged: true, labels, files });

describe('risky files', () => {
  it('saving, sync, undo and deleting files are risky', () => {
    for (const f of [
      'src/sync/firebase.ts',
      'src/store/core.ts',
      'src/store/sync.ts',
      'src/store/versions.ts',
      'src/store/actions/boards.ts',
      'src/model/persist.ts',
      'src/model/history.ts',
      'src/model/versions.ts',
      'src/model/workspace.ts',
      'firestore.rules',
      'mcp/save.ts',
      'mcp/server.ts',
      'mcp/login/login.ts',
    ])
      expect(isRiskyFile(f), f).toBe(true);
  });

  it('test files never count, and other files are low-risk', () => {
    for (const f of ['src/model/persist.test.ts', 'src/sync/pageHide.test.ts', 'src/store/sync.test.ts', 'e2e/sync.spec.ts', 'src/components/Toolbar.tsx', 'src/model/arrows.ts', 'CHANGELOG.md', 'src/store/actions/blocks.ts', 'mcp/save.test.ts'])
      expect(isRiskyFile(f), f).toBe(false);
  });
});

describe('deciding whether to publish', () => {
  it('publishes when every unpublished commit is a merged, low-risk pull request', () => {
    const d = decide({ isAhead: true, commits: [{ sha: 'a1', pr: pr(9, ['src/components/Toolbar.tsx', 'src/model/persist.test.ts']) }, { sha: 'b2', pr: pr(10, ['CHANGELOG.md']) }] });
    expect(d).toEqual({ publish: true, reason: 'pull requests #9, #10 are low-risk' });
  });

  it('waits when a pull request is labelled high-risk', () => {
    const d = decide({ isAhead: true, commits: [{ sha: 'a1', pr: pr(9, ['src/components/Toolbar.tsx'], ['high-risk']) }] });
    expect(d.publish).toBe(false);
    expect(d.reason).toContain('#9 is labelled high-risk');
  });

  it('waits when a pull request touches saving, sync, undo or deleting', () => {
    const d = decide({ isAhead: true, commits: [{ sha: 'a1', pr: pr(9, ['src/store/core.ts', 'src/components/Toolbar.tsx']) }] });
    expect(d.publish).toBe(false);
    expect(d.reason).toContain('#9 changes src/store/core.ts');
  });

  it('waits for "publish" when a commit was pushed straight to build/v1 (no pull request)', () => {
    const d = decide({ isAhead: true, commits: [{ sha: 'a1', pr: pr(9, ['README.md']) }, { sha: 'c3c3c3c3c3', pr: null }] });
    expect(d.publish).toBe(false);
    expect(d.reason).toContain('c3c3c3c pushed straight to build/v1');
  });

  it('an earlier risky merge not yet published holds back a later low-risk one (it would go live with it)', () => {
    const d = decide({ isAhead: true, commits: [{ sha: 'a1', pr: pr(8, ['src/sync/firebase.ts']) }, { sha: 'b2', pr: pr(9, ['README.md']) }] });
    expect(d.publish).toBe(false);
    expect(d.reason).toContain('#8');
  });

  it('a pull request into another branch, or not merged, does not count', () => {
    expect(decide({ isAhead: true, commits: [{ sha: 'a1', pr: { ...pr(9, ['README.md']), base: 'main' } }] }).publish).toBe(false);
    expect(decide({ isAhead: true, commits: [{ sha: 'a1', pr: { ...pr(9, ['README.md']), merged: false } }] }).publish).toBe(false);
  });

  it('nothing to do when main already has it, or main has moved somewhere build/v1 is not', () => {
    expect(decide({ isAhead: true, commits: [] })).toEqual({ publish: false, reason: 'already live' });
    expect(decide({ isAhead: false, commits: [] }).reason).toContain('main is not behind');
  });
});
