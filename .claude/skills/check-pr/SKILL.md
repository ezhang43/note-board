---
name: check-pr
description: Check another session's pull request into build/v1 for the owner (CLAUDE.md rule 9) - combine it with the latest build/v1, run all tests, review it, and report in plain words whether it is safe to merge. Never merges.
argument-hint: <pull request number>
---

# Check pull request #$ARGUMENTS

Only the main session does this, for the owner. It reports; it does not merge, and it does not fix what it finds unless the owner says so.

## 1. Look at it

```
git fetch origin
gh pr view $ARGUMENTS --json number,title,body,headRefName,baseRefName,labels,files,statusCheckRollup
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

The browser tests need port 5173; if another dev server holds it, stop that first or say why the browser tests could not run.

## 4. Review

```
node scripts/claude-hooks.mjs level origin/build/v1
```

Run the `code-review` skill on the pull request: `high` if that says high or the pull request has the `high-risk` label, else `medium`. Also use the `spec-checker` subagent on the merged result.

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
cd C:/Users/ezhan/Projects/note-board
git worktree remove .claude/worktrees/check-pr-$ARGUMENTS --force
git branch -D check-pr-$ARGUMENTS
```
