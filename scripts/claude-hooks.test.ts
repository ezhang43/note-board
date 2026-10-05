import { describe, expect, it } from 'vitest';
import { riskyChanges, riskyEditHook, typecheckHook } from './claude-hooks.mjs';

// Claude Code hooks (.claude/settings.json): a warning before Claude edits a file where a bug can
// lose the owner's data, and a type check after it edits a TypeScript file.

const project = 'C:\\Users\\ezhan\\Projects\\note-board';
const edit = (file_path: string) => ({ tool_name: 'Edit', tool_input: { file_path } });

describe('risky-edit hook', () => {
  it('warns before editing a saving, sync, undo or deleting file', () => {
    const out = riskyEditHook(edit(`${project}\\src\\sync\\firebase.ts`), project);
    expect(out?.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(out?.hookSpecificOutput.additionalContext).toContain('src/sync/firebase.ts');
    expect(out?.hookSpecificOutput.additionalContext).toContain('high-risk');
  });

  it('works with forward slashes, a different drive-letter case and relative paths', () => {
    expect(riskyEditHook(edit('c:/Users/ezhan/Projects/note-board/src/store/core.ts'), project)).not.toBeNull();
    expect(riskyEditHook(edit('src/model/persist.ts'), project)).not.toBeNull();
    expect(riskyEditHook(edit('/home/me/note-board/firestore.rules'), '/home/me/note-board')).not.toBeNull();
  });

  it('stays quiet for ordinary files, test files and files outside the project', () => {
    expect(riskyEditHook(edit(`${project}\\src\\components\\Card.tsx`), project)).toBeNull();
    expect(riskyEditHook(edit(`${project}\\src\\store\\sync.test.ts`), project)).toBeNull();
    expect(riskyEditHook(edit('C:\\elsewhere\\src\\sync\\firebase.ts'), project)).toBeNull();
    expect(riskyEditHook(edit(`${project}-copy\\src\\sync\\firebase.ts`), project)).toBeNull();
    expect(riskyEditHook({ tool_name: 'Edit', tool_input: {} }, project)).toBeNull();
  });
});

describe('risky changes (for picking the review level)', () => {
  it('lists the risky files among the changed ones, once each and ignoring blank lines', () => {
    const changed = 'src/App.tsx\nsrc/store/core.ts\r\n\nsrc/store/core.ts\nsrc/store/core.test.ts\nfirestore.rules\n';
    expect(riskyChanges(changed)).toEqual(['src/store/core.ts', 'firestore.rules']);
  });

  it('is empty when nothing risky changed', () => {
    expect(riskyChanges('src/components/Card.tsx\nCHANGELOG.md\n')).toEqual([]);
    expect(riskyChanges('')).toEqual([]);
  });
});

describe('typecheck hook', () => {
  const passes = () => ({ ok: true, output: '' });
  const fails = () => ({ ok: false, output: Array.from({ length: 100 }, (_, i) => `error ${i}`).join('\n') });

  it('type-checks after a TypeScript file in the project changes', () => {
    let ran = 0;
    const run = () => (ran++, passes());
    expect(typecheckHook(edit(`${project}\\src\\App.tsx`), project, run)).toEqual({ code: 0, message: '' });
    expect(typecheckHook(edit(`${project}\\src\\model\\types.ts`), project, run).code).toBe(0);
    expect(ran).toBe(2);
  });

  it('reports errors back to Claude (exit code 2), cut to a readable length', () => {
    const res = typecheckHook(edit(`${project}\\src\\App.tsx`), project, fails);
    expect(res.code).toBe(2);
    expect(res.message).toContain('npm run typecheck');
    expect(res.message).toContain('error 0');
    expect(res.message).not.toContain('error 99');
  });

  it('skips other files, node_modules and files outside the project', () => {
    const run = () => {
      throw new Error('should not run');
    };
    for (const f of [
      `${project}\\SPEC.md`,
      `${project}\\src\\styles.css`,
      `${project}\\scripts\\publish-rules.mjs`,
      `${project}\\node_modules\\x\\index.d.ts`,
      'C:\\Temp\\scratch.ts',
    ]) {
      expect(typecheckHook(edit(f), project, run)).toEqual({ code: 0, message: '' });
    }
  });
});
