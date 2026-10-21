---
name: finish-step
description: The end-of-step routine for a Note Board change - tests, review at the right level, security check when it applies, spec check, changelog, commit or pull request, and the owner's report. Use when a build step, owner request or fix is implemented and its tests are written.
---

# Finish a step

Follow CLAUDE.md; this is its end-of-step rules in order. Do every step; say in the report if one was skipped and why.

## 1. Up to date

`git fetch`. Note which session this is: the **crew coordinator** is the session named in the Crew Board's `meta/crew` (on the owner's Windows computer or a cloud session the owner is talking to); any other session (a worker, a worktree, another chat) works on its own branch (rule 9).

## 2. Tests pass

Run, and fix until all three pass:

```
npm run typecheck
npm test
npm run test:e2e
```

A failure means fixing the code (or a wrong test, saying why), never deleting a test to get green.

Three browser failures are known to happen only in the cloud sandbox and are not real; ignore them and say so in the report: `published-iphone` (no WebKit there), quick-wins "Ctrl+click on a web address" (no internet), and backup.spec "a file that isn't a BusyAnts backup". Any other failure: re-run that spec on its own before believing it (other workers share the machine), and treat GitHub's "All tests" as the final word. Each worktree tests on its own ports (`scripts/test-ports.mjs`). Stop only a process you started, with `kill <pid>`; never a broad process-name kill of Playwright, node or vite (a hook refuses it).

## 3. Review at the right level (rule 10)

Find out whether the change touches saving, sync, undo or deleting:

```
node scripts/claude-hooks.mjs level
```

- Says `high` → run the `code-review` skill at `high`.
- A normal feature → `medium`. A tiny fix (style tweak, one small behavior) → `low` or none.
- Only wording or documents → skip.

Fix what the review confirms, tests first (write the failing test, see it fail, fix), then rerun step 2.

**If the `code-review` skill can't run in this session** (a background crew worker has no Agent tool, and the review runs as a background agent): do not skip it and do not improvise one. Say so in the report as `REVIEW: needs coordinator review at <level>`, open the pull request, and do not merge it (step 7), even if low-risk. The crew coordinator runs `/code-review <level> <PR>` on the pull request, sends findings back, and merges once clean (crew skill, section 3). If the level above is "skip", there is nothing to wait for.

## 4. Security check (when it applies)

Run the `security-review` skill as well when the change touches any of these (owner asked 2026-10-05):

- **Sign-in and sync**: `src/sync/`, `src/store/sync.ts`, `SignInScreen`, anything that reads or writes Firebase.
- **Who can see what**: `firestore.rules`, sharing, invites, collaboration.
- **Outside data coming in**: importing or restoring a board, backups, pasted content, anything read from a file or URL.
- **Links and shown text**: `src/model/links.ts`, `TextLinks.tsx`, formatting, `href`, `window.open`, `target="_blank"`, `innerHTML` / `dangerouslySetInnerHTML`.
- **What runs on the site**: new packages in `package.json`, `index.html`, `.github/workflows/`.

Otherwise skip it and say so in the report. Fix what it confirms the same way as step 3, then rerun step 2.

## 5. Spec check

Run the `spec-check` skill on the change (a worker has no Agent tool and runs the skill itself; a session that can start subagents may use the `spec-checker` agent instead, which has the same list). Fix anything it lists, or say in the report why it is fine as it is.

## 5b. Design check (UI changes only)

If the change touches `src/components/`, `src/styles.css` or any page's look, do a light `emil-design-eng` check (rule 12) of the changed UI using its Review Checklist: exact `transition` properties (never `all`), `ease-out` not `ease-in`, under 300ms, no animation on keyboard actions, hover effects inside `@media (hover: hover)`, `prefers-reduced-motion` respected, popovers growing from their trigger. If it touches the phone layout or touch handling, also check it against `mobile-native` (hover gated by `@media (hover: hover)`, 16px text boxes, `dvh` and safe areas, no `user-scalable=no`, tap feedback on `:active`). `SPEC.md` and `docs/decisions.md` win over the skills, and Impeccable leads on the look (rule 12). Fix what it finds (tests first where checkable), or say in the report why it is fine. Skip for changes with no UI and say so.

## 6. Documents

- `changes/<branch>.md` (a new file): a short plain-English changelog entry, in the style of the top ones in `CHANGELOG.md`: a `## Title (date)` heading and bullets (rule 5). Never edit `CHANGELOG.md` itself: two open pull requests that both do show "merge conflicts" on GitHub. `<branch>` is the job's branch name (slashes become `-`).
- `SPEC.md`: updated so it describes the app as built (rule 8).
- `changes/<branch>.decisions.md` (a new file, only if you made calls): any call made while building (rule 4's exception), one `- <today's date> ...` bullet each, in the style of the end of `docs/decisions.md`. Never edit `docs/decisions.md` itself; the coordinator folds it in at publish time.

## 7. Land it

- **Crew coordinator:** commit on `build/v1`, fetch again, push (a change of your own also writes its fragments under `changes/`; folding them is the publish step in the crew skill). A commit pushed straight to `build/v1` holds auto-publish back until the owner says "publish"; for a change that should go live by itself, use a branch and a low-risk pull request instead.
- **Any other session:** commit on the job's branch, push, open a pull request into `build/v1`. If step 3 said `high`, add `--label high-risk` and do not merge: give the owner the link. Otherwise watch "All tests", fix it if it fails, and merge (merge commit) once it passes (unless step 3 handed the review to the coordinator: then stop at `pr-open`).
- **In a cloud session `gh pr ...` is blocked** (GitHub GraphQL; `HTTP 403`). Use the GitHub MCP tools if loaded, or the `gh api` REST routes in the crew skill's "GitHub in a cloud session" section: open the pull request, add the label, read the "All tests" check-run (`subscribe_pr_activity` or polling, not `gh pr checks --watch`), and merge. On the owner's Windows computer `gh pr ...` works as written.

## 8. Report to the owner

Plain words, short, no code. The owner reads code at a beginner level. Pick the size from step 3's review level (owner request, 2026-10-05):

**Small** (review was `low`, none, or skipped for wording/documents): a few lines, no headings.

- What changed, in one sentence.
- One thing to click to see it (skip for documents only).
- Any call made without asking, if there was one.
- Where it is.

Mention tests, review or security only if something failed, was found or was skipped for an unusual reason.

**Standard** (review was `medium`): the full list below.

**Full** (review was `high`): the full list below, plus:

- **Saved boards**: what happens to boards already saved (on this computer and synced), whether anything could be lost, and how to undo it if it goes wrong.

The full list:

- **What was built**: one or two sentences.
- **How to run it**: `npm run dev`, then http://localhost:5173 (or the live site, once published).
- **What to click**: numbered steps that show it working, and what they should see.
- **Calls I made**: any decisions taken without asking, as recorded in `changes/<branch>.decisions.md`.
- **Review**: which level ran, what it found, what was fixed or left alone, and why.
- **Security check**: ran or skipped (and why), what it found, what was fixed.
- **Where it is**: committed on build/v1, or the pull request link and whether it is merged.
