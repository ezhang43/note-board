import { describe, expect, it } from 'vitest';
import { bashGuardHook, riskyChanges, riskyEditHook, typecheckHook } from './claude-hooks.mjs';

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

// Bash guard (owner "go" 2026-10-21, job #153): refuses the commands that hurt other crew sessions.
describe('bash guard hook', () => {
  const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } });
  const worker = {};
  const coordinator = { CREW_COORDINATOR: '1' };
  const refused = (command: string, env: Record<string, string | undefined> = worker) => {
    const res = bashGuardHook(bash(command), env);
    expect(res.code, command).toBe(2);
    expect(res.message, command).not.toBe('');
    return res.message;
  };
  const allowed = (command: string, env: Record<string, string | undefined> = worker) =>
    expect(bashGuardHook(bash(command), env), command).toEqual({ code: 0, message: '' });

  it('refuses broad pkill and killall, however they are reached', () => {
    expect(refused('pkill -f playwright')).toContain('kill <pid>');
    refused('killall node');
    refused('pkill vite');
    refused('npm test; pkill -f chromium');
    refused('cd x && killall -9 node');
    refused('sudo pkill node');
    refused('npm run dev & sleep 1 && pkill -f vite', coordinator); // the coordinator is no exception
  });

  it('allows killing one process by the PID this session started', () => {
    allowed('kill 1234');
    allowed('kill $DEV_PID');
    allowed('echo pkill is not allowed');
    allowed('git commit -m "ban pkill"');
  });

  it('refuses a force push to build/v1 or main, for everyone', () => {
    refused('git push --force origin build/v1');
    refused('git push -f origin main');
    refused('git push origin main --force-with-lease');
    refused('git push --force-with-lease=main origin build/v1', coordinator);
    refused('git push -fu origin build/v1');
    refused('git push origin +build/v1:main', coordinator);
    refused('git -C /x push origin HEAD:refs/heads/main --force', coordinator);
  });

  it('refuses pushing onto main or build/v1 unless this is the crew coordinator', () => {
    for (const cmd of [
      'git push origin build/v1:main',
      'git push origin HEAD:main',
      'git push origin 1949b37abc:main',
      'git push origin :main',
      'git push origin HEAD:refs/heads/main',
      'git push origin main',
      'git push origin build/v1',
      'git push origin HEAD:build/v1',
      'npm test && git push origin build/v1:main',
    ]) {
      expect(refused(cmd)).toContain('crew coordinator');
      allowed(cmd, coordinator);
    }
  });

  it('allows an ordinary push of a work branch, for workers and the coordinator', () => {
    for (const cmd of [
      'git push -u origin crew-guard-rails',
      'git push origin HEAD',
      'git push origin crew-guard-rails:crew-guard-rails',
      'git push',
      'git push --force-with-lease origin crew-guard-rails',
      'git push origin main-menu',
      'git fetch origin main',
      'git merge origin/build/v1',
    ]) {
      allowed(cmd);
      allowed(cmd, coordinator);
    }
  });

  it('ignores other tools and calls with no command', () => {
    expect(bashGuardHook({ tool_name: 'Edit', tool_input: { file_path: 'pkill' } }, worker)).toEqual({ code: 0, message: '' });
    expect(bashGuardHook({ tool_name: 'Bash', tool_input: {} }, worker)).toEqual({ code: 0, message: '' });
  });
});
