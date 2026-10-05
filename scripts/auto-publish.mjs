// @ts-check
// Run by the "Publish" job in .github/workflows/checks.yml after "All tests" passes on a push to
// build/v1: gathers what main lacks from git and GitHub, asks publish-rules.mjs, and writes
// publish=true|false and the reason to the job's outputs. Anything it can't find out means "don't".
//
//   node scripts/auto-publish.mjs <commit sha>     (needs GH_TOKEN, and origin/main fetched)

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { decide } from './publish-rules.mjs';

const repo = process.env.GITHUB_REPOSITORY ?? 'ezhang43/note-board';
/** What is live: origin/main (another ref only for a dry run, e.g. BASE_REF=<old commit>). */
const base = process.env.BASE_REF ?? 'origin/main';
const sha = process.argv[2];

const run = (/** @type {string} */ cmd, /** @type {string[]} */ args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const api = (/** @type {string} */ path, /** @type {string[]} */ extra = []) => run('gh', ['api', ...extra, `repos/${repo}/${path}`]);

/** The merged pull request into build/v1 whose merge made `commit`, with its labels and files; else null. */
function pullRequestOf(/** @type {string} */ commit) {
  /** @type {any[]} */
  const prs = JSON.parse(api(`commits/${commit}/pulls`));
  const pr = prs.find((p) => p.merge_commit_sha === commit && p.merged_at && p.base?.ref === 'build/v1');
  if (!pr) return null;
  const files = api(`pulls/${pr.number}/files`, ['--paginate', '--jq', '.[].filename']).split('\n').filter(Boolean);
  return { number: pr.number, base: pr.base.ref, merged: true, labels: pr.labels.map((/** @type {any} */ l) => l.name), files };
}

function facts() {
  let isAhead = true;
  try {
    run('git', ['merge-base', '--is-ancestor', base, sha]);
  } catch {
    isAhead = false;
  }
  if (!isAhead) return { isAhead, commits: [] };
  const shas = run('git', ['rev-list', '--first-parent', '--reverse', `${base}..${sha}`]).split('\n').filter(Boolean);
  return { isAhead, commits: shas.map((c) => ({ sha: c, pr: pullRequestOf(c) })) };
}

let result;
try {
  if (!sha) throw new Error('no commit given');
  result = decide(facts());
} catch (err) {
  result = { publish: false, reason: `couldn't check (${err instanceof Error ? err.message : String(err)}): waits for "publish"` };
  console.log(`::warning::${result.reason}`);
}

console.log(`${result.publish ? 'Publishing' : 'Not publishing'}: ${result.reason}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${result.publish}\nreason=${result.reason.replace(/\n/g, ' ')}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `**${result.publish ? 'Published' : 'Not published'}**: ${result.reason}\n`);
