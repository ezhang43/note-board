// Ports for the browser tests (playwright.config.ts). The main folder and CI keep 5173 / 4173.
// Each git worktree gets its own pair, worked out from its folder, so workers running tests at
// the same time on this computer never share (or reuse) another worktree's dev server.
import { execSync } from 'node:child_process';

const SLOTS = 300;

export function testPorts({ isWorktree, folder, env }) {
  if (env.E2E_DEV_PORT || env.E2E_PREVIEW_PORT)
    return { dev: Number(env.E2E_DEV_PORT ?? 5173), preview: Number(env.E2E_PREVIEW_PORT ?? 4173) };
  if (!isWorktree) return { dev: 5173, preview: 4173 };
  // FNV-1a hash of the folder, so the same worktree gets the same ports every run.
  let h = 0x811c9dc5;
  for (const c of folder.replace(/\\/g, '/').toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  const slot = h % SLOTS;
  return { dev: 5200 + slot, preview: 4200 + slot };
}

// A linked worktree has its own git folder, separate from the shared one.
export function isGitWorktree() {
  try {
    const git = (a) => execSync(`git rev-parse ${a}`, { encoding: 'utf8' }).trim();
    return git('--path-format=absolute --git-dir') !== git('--path-format=absolute --git-common-dir');
  } catch {
    return false;
  }
}
