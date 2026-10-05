import { describe, expect, it } from 'vitest';
import { testPorts } from './test-ports.mjs';

// Browser tests in parallel (the /crew coordinator, 2026-10-05): each git worktree on this
// computer gets its own ports, so one worker's tests never run against another worker's app.

describe('browser test ports', () => {
  it('the main folder and CI keep the usual ports', () => {
    expect(testPorts({ isWorktree: false, folder: 'C:/Users/ezhan/Projects/note-board', env: {} })).toEqual({ dev: 5173, preview: 4173 });
  });

  it('a worktree gets its own ports, the same every run', () => {
    const a = testPorts({ isWorktree: true, folder: 'C:/Users/ezhan/Projects/note-board-crew', env: {} });
    expect(a).toEqual(testPorts({ isWorktree: true, folder: 'C:/Users/ezhan/Projects/note-board-crew', env: {} }));
    expect(a.dev).not.toBe(5173);
    expect(a.preview).not.toBe(4173);
    expect(a.dev).toBeGreaterThanOrEqual(5200);
    expect(a.dev).toBeLessThan(5500);
    expect(a.preview - 4200).toBe(a.dev - 5200);
  });

  it('different worktrees get different ports', () => {
    const folders = ['note-board-crew', 'note-board-anthill', 'note-board-collab', 'note-board-arrowdots', '.claude/worktrees/agent-1', '.claude/worktrees/agent-2'];
    const ports = folders.map((f) => testPorts({ isWorktree: true, folder: `C:/Users/ezhan/Projects/${f}`, env: {} }).dev);
    expect(new Set(ports).size).toBe(folders.length);
  });

  it('E2E_DEV_PORT and E2E_PREVIEW_PORT override', () => {
    expect(testPorts({ isWorktree: true, folder: 'x', env: { E2E_DEV_PORT: '6001', E2E_PREVIEW_PORT: '6002' } })).toEqual({ dev: 6001, preview: 6002 });
  });
});
