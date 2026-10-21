---
name: check-pr
description: Check another session's pull request into build/v1 for the owner (CLAUDE.md rule 9) - combine it with the latest build/v1, run all tests, review it, and report in plain words whether it is safe to merge. Never merges.
argument-hint: <pull request number>
---

# Check pull request #$ARGUMENTS

Only the crew coordinator (CLAUDE.md rule 9) does this, for the owner. It reports; it does not merge, and it does not fix what it finds unless the owner says so.

## 1. Look at it

```
git fetch origin
gh pr view $ARGUMENTS --json number,title,body,headRefName,baseRefName,labels,files,statusCheckRollup
```

In a cloud session `gh pr ...` is blocked (GitHub GraphQL, `HTTP 403`). Use the GitHub MCP tools (`pull_request_read`) if loaded, or the REST form (more in the crew skill's "GitHub in a cloud session" section):

```
gh api repos/ezhang43/note-board/pulls/$ARGUMENTS --jq '{title, body, base: .base.ref, head: .head.ref, sha: .head.sha, labels: [.labels[].name]}'
gh api "repos/ezhang43/note-board/pulls/$ARGUMENTS/files?per_page=100" --jq '.[].filename'
gh api repos/ezhang43/note-board/commits/<head sha>/check-runs --jq '.check_runs[] | [.name, .status, .conclusion] | @tsv'
```

Check the base is `build/v1`. Note its labels and the "All tests" result.

## 2. Combine it with the latest build/v1, away from the owner's copy

Work in a throwaway worktree so the main folder is not touched:

```
git fetch origin pull/$ARGUMENTS/head:check-pr-$ARGUMENTS
git worktree add .claude/worktrees/check-pr-$ARGUMENTS origin/build/v1
cd .claude/worktrees/check-pr-$ARGUMENTS
git merge --no-ff --no-edit check-pr-$ARGUMENTS
```

If the merge stops on a conflict, note which files and what clashes, `git merge --abort`, and go to step 5.

## 3. Run everything

```
npm ci
npm run typecheck
npm test
npm run test:e2e
```

The browser tests run on this worktree's own ports (`scripts/test-ports.mjs`), so another session's dev server doesn't get in the way. If they still report a port in use, set `E2E_DEV_PORT` / `E2E_PREVIEW_PORT` to free ports, or say why they could not run. The known sandbox-only failures in /finish-step step 2 are not real.

## 4. Review

```
node scripts/claude-hooks.mjs level origin/build/v1
```

Run the `code-review` skill on the pull request: `high` if that says high or the pull request has the `high-risk` label, else `medium`. Also run the `spec-check` skill (or the `spec-checker` agent) on the merged result.

## 5. Report to the owner

Plain words, no code:

- **What it changes**: what the owner would notice, and which risky parts (saving, sync, undo, deleting) it touches, if any.
- **Clashes**: does it combine cleanly with the latest build/v1?
- **Tests**: typecheck, unit and browser tests on the combined result: passed, or what failed.
- **Review**: the level that ran and what it found, most serious first.
- **Verdict**: safe to merge, safe after named fixes, or not safe, and why.

Then ask the owner whether to merge. Merge only when they say so.

## 6. Clean up

```
cd ../../..   # back to the project folder
git worktree remove .claude/worktrees/check-pr-$ARGUMENTS --force
git branch -D check-pr-$ARGUMENTS
```
