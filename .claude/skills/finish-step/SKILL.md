---
name: finish-step
description: The end-of-step routine for a Note Board change - tests, review at the right level, spec check, changelog, commit or pull request, and the owner's report. Use when a build step, owner request or fix is implemented and its tests are written.
---

# Finish a step

Follow CLAUDE.md; this is its end-of-step rules in order. Do every step; say in the report if one was skipped and why.

## 1. Up to date

`git fetch`. Note which session this is: the **main session** is the one on the owner's Windows computer in `C:\Users\ezhan\Projects\note-board`; any other session (cloud, worktree, another computer) works on its own branch (rule 9).

## 2. Tests pass

Run, and fix until all three pass:

```
npm run typecheck
npm test
npm run test:e2e
```

A failure means fixing the code (or a wrong test, saying why), never deleting a test to get green.

## 3. Review at the right level (rule 10)

Find out whether the change touches saving, sync, undo or deleting:

```
node scripts/claude-hooks.mjs level
```

- Says `high` → run the `code-review` skill at `high`.
- A normal feature → `medium`. A tiny fix (style tweak, one small behaviour) → `low` or none.
- Only wording or documents → skip.

Fix what the review confirms, tests first (write the failing test, see it fail, fix), then rerun step 2.

## 4. Spec check

Use the `spec-checker` subagent on the change. Fix anything it lists, or say in the report why it is fine as it is.

## 5. Documents

- `CHANGELOG.md`: a short plain-English entry at the top, in the style of the ones below it (rule 5).
- `SPEC.md`: updated so it describes the app as built (rule 8).
- `docs/decisions.md`: any call made while building (rule 4's exception), added to the end with today's date.

## 6. Land it

- **Main session:** commit on `build/v1`, fetch again, push. A commit pushed straight to `build/v1` holds auto-publish back until the owner says "publish"; for a change that should go live by itself, use a branch and a low-risk pull request instead.
- **Any other session:** commit on the job's branch, push, open a pull request into `build/v1`. If step 3 said `high`, add `--label high-risk` and do not merge: give the owner the link. Otherwise watch "All tests", fix it if it fails, and merge (merge commit) once it passes.

## 7. Report to the owner

Plain words, short, no code. The owner reads code at a beginner level.

- **What was built**: one or two sentences.
- **How to run it**: `npm run dev`, then http://localhost:5173 (or the live site, once published).
- **What to click**: numbered steps that show it working, and what they should see.
- **Calls I made**: any decisions taken without asking, as recorded in docs/decisions.md.
- **Review**: which level ran, what it found, what was fixed or left alone, and why.
- **Where it is**: committed on build/v1, or the pull request link and whether it is merged.
