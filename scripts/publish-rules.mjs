// @ts-check
// Auto-publish for low-risk pull requests (owner chose this on 2026-10-05, build rule 9): which
// commits on build/v1 may go live without the owner saying "publish". Pure: auto-publish.mjs
// gathers the facts from GitHub and git, this decides.

/** Files where a bug can lose the owner's data: saving, sync, undo, deleting (rule 10's `high` level). */
const RISKY = [
  /^src\/sync\//,
  /^src\/store\/core\.ts$/,
  /^src\/store\/sync\.ts$/,
  /^src\/store\/versions\.ts$/,
  /^src\/store\/actions\/boards\.ts$/,
  /^src\/model\/persist\.ts$/,
  /^src\/model\/history\.ts$/,
  /^src\/model\/versions\.ts$/,
  /^src\/model\/workspace\.ts$/,
  /^firestore\.rules$/,
  // The Claude connector changes the owner's saved boards.
  /^mcp\//,
];

/** Test files never count: they change nothing on the live site. */
const isTest = (/** @type {string} */ f) => /\.test\.[cm]?[jt]sx?$/.test(f) || f.startsWith('e2e/');

/** @param {string} file a path from the repository's root */
export function isRiskyFile(file) {
  return !isTest(file) && RISKY.some((r) => r.test(file));
}

/**
 * @typedef {{ number: number, base: string, merged: boolean, labels: string[], files: string[] }} PullRequest
 * @typedef {{ sha: string, pr: PullRequest | null }} Commit one commit on build/v1's own line (its first parents), with the pull request it merged, if any
 */

/**
 * Whether to publish: every commit build/v1 has that main hasn't must be the merge of a pull
 * request into build/v1 that isn't labelled `high-risk` and changes no risky file. One that fails
 * holds everything back, since publishing a later commit would take it live too.
 *
 * @param {{ isAhead: boolean, commits: Commit[] }} facts `isAhead`: main is behind (a fast-forward
 *   to the commit is possible); `commits`: the commits main lacks, oldest first
 * @returns {{ publish: boolean, reason: string }}
 */
export function decide({ isAhead, commits }) {
  if (!isAhead) return { publish: false, reason: 'main is not behind this commit (already newer, or moved elsewhere)' };
  if (!commits.length) return { publish: false, reason: 'already live' };
  for (const { sha, pr } of commits) {
    if (!pr || !pr.merged || pr.base !== 'build/v1') return { publish: false, reason: `${sha.slice(0, 7)} pushed straight to build/v1 (not a merged pull request): waits for "publish"` };
    if (pr.labels.includes('high-risk')) return { publish: false, reason: `#${pr.number} is labelled high-risk: waits for "publish"` };
    const risky = pr.files.filter(isRiskyFile);
    if (risky.length) return { publish: false, reason: `#${pr.number} changes ${risky.join(', ')}: waits for "publish"` };
  }
  return { publish: true, reason: `pull requests ${commits.map((c) => `#${c.pr?.number}`).join(', ')} are low-risk` };
}
