# Claude Code best practices: what we follow

Owner request, 2026-10-29: follow Anthropic's Claude Code best-practices pages, and when a page
changes, apply the change that day.

- **Last checked: 2026-10-29** (every URL below was fetched that day, with Claude Code 2.1.312 installed).
- Paraphrased, not quoted. Section names are the page's own headings, so the daily check can find them.
- Anthropic's older engineering post, `https://www.anthropic.com/engineering/claude-code-best-practices`
  ("Claude Code: Best practices for agentic coding"), now answers with a permanent redirect (HTTP 308) to
  page 1 below. It has no separate content to follow any more.

## How the daily check works

1. Fetch each `.md` URL below (add `.md` to the page address for plain markdown; `curl` works).
2. Compare with this file: first the **fingerprint** (first 12 characters of the SHA-256 of the fetched
   `.md`; if it matches, the page is unchanged and you are done), then the **headings** and the
   **recommendations** in each summary. A new, removed or reworded recommendation, a new default, a
   renamed setting or a new heading is a change.
3. Also skim `https://code.claude.com/docs/en/changelog.md` for entries about CLAUDE.md, skills, hooks,
   subagents, settings or permissions.
4. For each change: apply it the same day if it is safe, then update the summary, the status and the
   fingerprint here. If it touches saving, sync, sharing, security, permissions or pushing to
   `build/v1` / `main`, or contradicts a rule in `CLAUDE.md` or `docs/decisions.md`, do not apply it:
   put it to the owner as a question with a recommended answer.
5. Use a branch and a pull request as usual (`CLAUDE.md` rule 9). The check itself needs no code review
   (documents only) unless it changes `.claude/settings.json` or `scripts/claude-hooks.mjs`.

## Pages checked

| # | Page | URL | Fingerprint |
| - | - | - | - |
| 1 | Best practices for Claude Code | https://code.claude.com/docs/en/best-practices.md | 3a737bc6ffa8 |
| 2 | How Claude remembers your project (CLAUDE.md, rules, memory) | https://code.claude.com/docs/en/memory.md | f19bb5aa909f |
| 3 | Extend Claude with skills | https://code.claude.com/docs/en/skills.md | 0a5e9e2e7602 |
| 4 | Create custom subagents | https://code.claude.com/docs/en/sub-agents.md | c6af4f0b650d |
| 5 | Automate actions with hooks (guide) | https://code.claude.com/docs/en/hooks-guide.md | 0449c1803dce |
| 6 | Hooks reference | https://code.claude.com/docs/en/hooks.md | ffc7195446eb |
| 7 | Settings files and precedence | https://code.claude.com/docs/en/settings.md | 70064d76e67c |
| 8 | Configure permissions | https://code.claude.com/docs/en/permissions.md | a72bafb46a55 |
| 9 | Manage costs effectively | https://code.claude.com/docs/en/costs.md | 68019dc152b7 |
| 10 | Common workflows | https://code.claude.com/docs/en/common-workflows.md | 5a5584f7189b |

Index of all pages (to spot new ones): https://code.claude.com/docs/llms.txt. Pages 6 and 8 are large
reference pages; this first pass read their headings and the sections that give advice (hook security,
permission rules, project allow rules), not every field. Their fingerprints still catch any change.

---

## 1. Best practices for Claude Code

**Headings (all of them):** Deterministic and non-deterministic instructions; Tell Claude what it can't
see (Write a specific prompt; Brainstorm with Claude first; Keep CLAUDE.md short; Scope rules to one part
of the codebase; Put team procedures in skills; Connect the tools Claude needs); Give Claude a check to
run (Review against your spec; Enforce the check with a Stop hook); Enforce the rules that can't have
exceptions (Enforce steps with hooks; Limit access with permission rules and the sandbox; Choose who a
rule applies to); Change a default (Change the permission mode; Change the model and effort; Know what
subagents cost; Keep cost and context down); Steer the session; Let Claude run without you (Run Claude
from a script; Start runs on a schedule or an event; Run sessions in parallel); What you can stop doing;
Related resources.

**Summary of the advice**

- Two kinds of instruction: ones the model may or may not follow (prompt, CLAUDE.md, skills) and ones the
  harness always applies (hooks, deny rules, managed settings). Let Claude decide by default. Anything
  with zero exceptions becomes a hook or deny rule; if you keep adding emphasis to a CLAUDE.md line,
  it belongs in a hook. Delete hooks that only encode preferences.
- Write down only what Claude can't find by reading the repo, or would waste time rediscovering each
  session. Test: could it find this by reading the code, and would it actually look? If yes to both,
  leave it out.
- Specific prompts (name the file, the symptom, what "fixed" looks like); hand over files with `@`,
  screenshots, piped output. "Think hard" style phrases are ordinary text; effort level is the real
  control. `be ambitious` still helps for scope. For vague ideas, ask Claude to interview you and write a
  `SPEC.md`, then build from it in a fresh session.
- Keep CLAUDE.md short (the memory page says under 200 lines): exact commands to check work and run one
  test file, misleading places in the code, decisions not in the repo, anything corrected twice. Check
  loading with `/context`. `/init` drafts one; `/doctor` suggests cuts; `/doctor prompt-audit` flags stale
  or contradicting instructions. Personal notes go in `CLAUDE.local.md`, which is gitignored. Adding
  IMPORTANT does not fix an ignored line.
- Rules that only matter in one area go in `.claude/rules/` with a `paths:` filter.
- Team procedures go in skills (name and description always listed, body loaded on use). Use
  `disable-model-invocation: true` for skills with side effects (such as a release) so only the person
  starts them. The same "only what Claude can't find" test applies.
- Connect tools: prefer a CLI (`gh`) over MCP; disable MCP servers you don't use (their tool names ride
  along in context); code-intelligence plugins help typed languages.
- Give Claude a pass/fail check (tests, build, linter, screenshot) and ask for evidence (command and
  output), not "all tests pass". Strength ladder: the prompt, `/goal`, a `Stop` hook (exit code 2 sends
  Claude back to work; capped at eight blocked stops in a row), or a fresh-context reviewer
  (`/code-review`, or a subagent told to review against the spec and skip style). `/verify` runs the real
  app.
- Hooks (shell, HTTP, MCP tool, prompt or agent): only `command`/`http` are deterministic; add
  `onFailure: "block"` when a crashing hook should also stop the action. Example hooks: format after
  edit, block edits to protected folders. Don't overdo it; keep the enforced set small (forty is a smell).
- Permissions: `deny` rules hold in every mode, including auto and `bypassPermissions` (the `.env`
  example). A `Read` deny catches `cat .env` but not a script that opens it. The sandbox (`/sandbox`) is
  the OS-level limit. Where a rule lives decides who gets it: `settings.local.json` and
  `~/.claude/settings.json` are personal; committed `.claude/settings.json` is the team's (its allow rules
  wait for the trust dialog); managed settings are the organization's.
- Defaults: auto mode (a classifier reviews risky actions; deny rules and `PreToolUse` hooks run first;
  `autoMode` config only works in `~/.claude/settings.json`, keep `"$defaults"` in each list). Effort:
  `medium` default; raise to `high`/`xhigh` for subtle bugs, lower for quick back-and-forth, `max` rarely,
  `ultrathink` for one prompt. Subagents cost tokens and can be slower; use them for parallel work, noisy
  output, an independent reviewer, or fewer tools. Use `model: haiku` for simple ones, `tools:
  Read, Grep, Glob` for a read-only reviewer. Use `/usage`, `/clear` between unrelated tasks, `/compact`
  with a focus.
- Steer: `Esc` to stop, `/rewind` (checkpoints cover only files Claude's file tools edited, not Bash
  changes), `/clear` after two failed corrections, `/btw`, `/rename` plus `--resume`.
- Unattended runs, five questions: does it know what done looks like; can it check its own work; what may
  it touch; what stops it (`--max-turns`, `--max-budget-usd`, spend limit); where does the result go and
  who signs off. Scripts: `claude -p` with `--bare`, `--allowedTools`, `--permission-mode dontAsk`.
  Scheduled work: `/loop` in-session, `/schedule` cloud tasks (protect `main` with a branch rule the task
  cannot bypass). Parallel work: one worktree per session (`claude -w`), `.worktreeinclude` for needed
  gitignored files, keep the install command in CLAUDE.md for new checkouts, `/batch` for big mechanical
  changes, a second session as independent reviewer.
- Things to stop doing: managing context aggressively, emphasis words, subagents just to protect context
  or "for a better answer", "think hard" phrases, "keep going, don't be lazy" lines, and describing
  architecture and file layout in CLAUDE.md.

**What we do**

| Recommendation | Status | Notes |
| - | - | - |
| Hard rules as hooks/deny rules, not prose | Followed | `scripts/claude-hooks.mjs`: refuse `pkill`/`killall`, force pushes and pushes to `main`/`build/v1` (`bash`), type check after edits (`typecheck`, exit 2), a reminder before editing risky files (`risky`). Three hooks only. Credential folders of the connector are in `permissions.deny`. |
| Only what Claude can't see; short CLAUDE.md | Followed, one open question | 71 lines, no emphasis words, trimmed 2026-10-29 (PR 215). The "Code layout" section is mostly findable in the repo: see question Q1. |
| Exact check commands, and how to run one test file | Gap, fixed here | `CLAUDE.md` Commands now names the three checks and the one-file forms of Vitest and Playwright. |
| Install command for new worktrees | Gap, fixed here | `CLAUDE.md` Commands: `npm ci` first in a fresh checkout or worktree. |
| `CLAUDE.local.md` gitignored | Gap, fixed here | Added to `.gitignore`, with `.claude/settings.local.json` (the page says to ignore it yourself when created by hand). |
| Compaction focus (from the costs page) | Gap, fixed here | New "When compacting" section in `CLAUDE.md`. |
| Brainstorm/interview before a spec | Followed | `/grill-with-docs` writes answers into `SPEC.md` and `docs/decisions.md`. |
| Procedures in skills; manual-only for side effects | Followed, one open question | `finish-step`, `check-pr`, `crew`, `spec-check` are skills. `grill-with-docs`, `review-animations`, `improve-codebase-architecture` are manual-only. See Q3. |
| Tools via CLI | Followed | `gh` for GitHub; no project MCP servers committed. |
| A pass/fail check and evidence | Followed | Rule 3 (unit and browser tests, tests written first), CI check "All tests", reports must say what ran. |
| Independent reviewer, skip style | Followed | Rule 10 (`code-review` at a level by risk), `spec-check` skill and `spec-checker` agent. |
| `Stop` hook to enforce a check | Not followed | Question Q4. |
| Path-scoped `.claude/rules/` | Not followed | Question Q2. |
| Deny rules for secrets | Followed | The repo holds no secrets (`.env.production` has public client IDs only); the connector's local credential folders are denied. See Q5 for an optional extra. |
| Sandbox, auto mode, effort, model, `/clear`, steering | Not applicable | Per-person or per-session choices, not repo files. (`autoMode` is ignored in project settings anyway.) |
| Subagent cost controls | Partly followed | `spec-checker` has a limited tool list. No `model` set: Q6. |
| Unattended-run checklist (done, check, touch, stop, sign-off) | Mostly followed | Done = spec and tests; check = finish-step and CI; touch = worktrees plus the bash guard; sign-off = PR, CI, owner for high-risk. No turn or spend cap is visible in the repo: Q7. |
| Worktree per parallel session | Followed | The crew runs one worktree per job, each on its own test ports. No `.worktreeinclude` needed: nothing gitignored is required to build. |
| Protect `main` with a branch rule | Cannot verify from the repo | GitHub setting: Q8. |
| Run `/doctor prompt-audit` | Not done yet | Needs an interactive session: Q9. |

## 2. How Claude remembers your project

**Headings:** CLAUDE.md vs auto memory; CLAUDE.md files (When to add; Choose where to put; Set up a
project CLAUDE.md; Write effective instructions; Import additional files; How CLAUDE.md files load;
Organize rules with `.claude/rules/`; Manage CLAUDE.md for large teams); AGENTS.md; Auto memory; View and
edit with `/memory`; Troubleshoot memory issues.

**Summary**

- Add to CLAUDE.md when Claude repeats a mistake, a review catches something it should have known, or you
  retype the same correction. Keep it to facts held every session; multi-step procedures and
  single-area rules move to skills or path-scoped rules.
- Project file at `./CLAUDE.md` or `./.claude/CLAUDE.md`; personal `./CLAUDE.local.md` (gitignore it);
  files above the working directory load at launch, subdirectory ones on demand. Confirm with `/context`.
- Write concrete, checkable instructions; under 200 lines per file (longer files cost context and reduce
  adherence); group under headers and bullets; remove contradictions (Claude may pick one arbitrarily).
  `@path` imports organize but do not save context. `/doctor` proposes trims of content derivable from the
  code (directory layouts, dependency lists, architecture overviews); keep pitfalls, rationale and unusual
  conventions. `/doctor prompt-audit` (v2.1.283+) audits instructions, skills and agents.
- Block-level HTML comments in CLAUDE.md are stripped before loading: free maintainer notes.
- Per-file size caps for on-demand files (40,000 characters on a 200K window; 150,000 on a 1M window on
  newer models).
- CLAUDE.md is context, not enforcement; must-run steps belong in hooks. If CLAUDE.md sets commit or PR
  rules, turn off the built-in ones with `includeGitInstructions` and set `attribution`.
- After `/compact` the root CLAUDE.md is re-read from disk; conversation-only instructions are lost.
- `AGENTS.md` is read only when no CLAUDE.md exists (unless configured); auto memory is the model's own
  notes, browsable with `/memory`.

**What we do:** root `CLAUDE.md` of 71 lines in headed sections, concrete rules, no imports, no
`AGENTS.md`, no auto-memory reliance (project rules live in `CLAUDE.md` and `docs/decisions.md`). Gaps
fixed here: `CLAUDE.local.md` ignored, compaction note. Open: Q1, Q2, Q9. Not applicable: `CLAUDE.md`
doesn't set commit-message rules, so `includeGitInstructions`/`attribution` stay untouched.

## 3. Extend Claude with skills

**Headings:** Bundled skills (`/doctor`, `/verify`, `/run`, `/simplify`, run-your-checks-before-commit);
Getting started; Choose where skills load; Configure skills (Types of skill content; Frontmatter
reference; Add supporting files); Control who invokes a skill; Skill content lifecycle; Pre-approve
tools; Pass arguments; Advanced patterns (dynamic context, run in a subagent); Find unused skills;
Evaluate and iterate; Share skills; Troubleshooting.

**Summary**

- Make a skill when you keep pasting the same procedure, or a CLAUDE.md section became a procedure.
- Frontmatter is optional but `description` is recommended: say what it does and when to use it, key use
  first; description plus `when_to_use` is cut at 1,536 characters; many skills share a listing budget of
  1% of the context window (low-use skills lose descriptions first). Field names must match exactly or
  they are silently ignored. Angle brackets in a description display as `&lt;`/`&gt;`.
- Keep `SKILL.md` under 500 lines; move detail into supporting files linked from it. Once loaded, a skill
  stays in context, so keep the body concise; after compaction only the start is kept, so put the key
  instructions first.
- `disable-model-invocation: true` for side-effect workflows; `user-invocable: false` for background
  knowledge; `allowed-tools`, `context: fork`, `paths`, `hooks`, `model`, `effort` are available.
  A rule that must hold every time belongs in a hook (can live in the skill's `hooks` frontmatter).
- `claude plugin validate .claude/skills` finds frontmatter that doesn't parse; `/skill-doctor` finds
  unused skills; `skill-creator` runs evals. A project skill named `verify` or `simplify` is run before
  each commit by the built-in commit instructions (not for docs or tests).

**What we do:** 12 project skills in `.claude/skills/`. Checked today: frontmatter validates
(`claude plugin validate .claude/skills` passed), every description is under 830 characters, none holds
angle brackets. Only `emil-design-eng` (674 lines) is over 500; it is a third-party skill we vendor
unchanged (MIT license file kept), see Q10. Not done: `/skill-doctor`, and `paths` scoping for the
design skills (optional, would change when they load).

## 4. Create custom subagents

**Headings:** Built-in subagents; Quickstart; Configure subagents (scope, files, frontmatter reference,
model, effort, capabilities and tools, hooks); Work with subagents (automatic delegation, explicit
invocation, foreground/background, common patterns, subagents vs main conversation, nesting, concurrent
limit, context); Fork the current conversation; Example subagents.

**Summary:** only `name` and `description` are required; the description drives automatic delegation;
the body is the whole system prompt. Give each agent only the tools it needs (a read-only reviewer gets
`Read, Grep, Glob`); `model: haiku` for simple jobs; `isolation: worktree` for an isolated copy. Use the
main conversation for iterative or latency-sensitive work; subagents for verbose output, tool limits, or
self-contained tasks that return a summary. Claude Code watches `.claude/agents/` and picks up edits
within seconds (new `agents` directory needs a restart).

**What we do:** one agent, `spec-checker`, read-only by design (`Read, Grep, Glob, Bash`; Bash is needed
for git diffs), with a clear "use after tests pass" description. The same checklist exists as the
`spec-check` skill because background workers cannot start subagents; both files say to keep them
identical. Open: Q6.

## 5. Automate actions with hooks (guide) and 6. Hooks reference

**Headings (guide):** Set up your first hook; What you can automate (notifications, auto-format, block
edits to protected files, re-inject context after compaction, audit config changes, reload environment,
auto-approve prompts); How hooks work; Prompt-based, agent-based and HTTP hooks; Limitations and
troubleshooting (hook not firing, Stop hook block cap, JSON has no effect). **Reference headings:** Hook
lifecycle; Configuration; Hook input and output; Hook events; Prompt-based hooks; Agent-based hooks; Run
hooks in the background; Security considerations; Windows PowerShell tool; Debug hooks.

**Summary:** command hooks talk through stdin JSON, stdout, stderr and exit codes; exit code 2 blocks and
sends stderr back to Claude. `PreToolUse` runs before permission checks and a `deny` holds in every mode.
Default command timeout is 10 minutes; set `timeout` per hook. `Stop` fires whenever Claude finishes
responding, with a block cap. Interactive sessions hold back all settings hooks until the folder is
trusted; `-p` and SDK sessions treat the folder as trusted. Security practices: validate input, quote
shell variables, block path traversal, use absolute paths, skip sensitive files. `/hooks` lists hooks;
`--debug-file` logs them.

**What we do:** Followed: our three hooks use exit 2 with a stderr reason, set explicit timeouts (10 s,
10 s, 60 s), use `"$CLAUDE_PROJECT_DIR"` quoted, parse stdin defensively, and keep decision logic in
pure, unit-tested functions (`scripts/claude-hooks.test.ts`). One deliberate difference: a hook that
cannot read its input exits 0 (fails open) so a hook bug never blocks all work. Q11 covers
`onFailure: "block"`.

## 7. Settings files and precedence

**Headings:** Settings files and who they affect; Change a setting; Settings precedence (lists merge);
Troubleshoot a setting that doesn't apply; Settings in cloud sessions.

**Summary:** commit `.claude/settings.json` so everyone gets the same permissions, hooks and plugins;
personal overrides go in `.claude/settings.local.json` (Claude Code adds it to your global git excludes
when it writes it; ignore it yourself if you create it by hand). Precedence: managed, then command line,
local, project, user; list settings merge. A few keys (such as `autoMode`) are ignored from a project
file. Cloud sessions read the committed file only.

**What we do:** Followed: shared hooks, deny rules and plugin list are committed, so cloud and local
sessions match (`CLAUDE.md` "Claude Code setup" section and the plugins rule). Gap fixed here:
`.claude/settings.local.json` added to `.gitignore`.

## 8. Configure permissions

**Headings:** Permission system; Manage permissions; Permission modes; Permission rule syntax; Tool-specific
rules (Bash, Read and Edit, WebFetch, MCP, Agent, Cd); Extend permissions with hooks; Working directories;
Sandboxing; Managed settings; Settings precedence; Project allow rules and workspace trust; Example
configurations.

**Summary:** rules are `allow`, `ask`, `deny`, checked deny first; specifiers and wildcards narrow a rule;
a `Read` deny also covers common file-reading commands but not arbitrary scripts; project `allow` rules
wait for workspace trust; a hook's `deny` beats an `allow`.

**What we do:** `permissions.deny` covers the connector's local credential folders. We add no `allow` or
`ask` rules (session choices are left to each person). Any change here is excluded from automatic
changes (see the check procedure); Q5 and Q12 are the open ones.

## 9. Manage costs effectively

**Headings:** Track your costs (`/usage`); Manage costs for your organization; Reduce token usage
(Manage context proactively; Choose the right model; Reduce MCP server overhead; Code intelligence
plugins; Offload processing to hooks and skills; Move instructions from CLAUDE.md to skills; Adjust
extended thinking; Delegate verbose operations to subagents; Agent team costs; Write specific prompts; Work
efficiently on complex tasks); Background token usage; Why usage climbs in a long session.

**Summary:** `/clear` between tasks; add a `# Compact instructions` section to CLAUDE.md or run
`/compact` with a focus; Sonnet for most work, Opus for hard problems, Haiku for simple subagents; prefer
CLI tools over MCP and turn off unused servers; hooks can pre-filter noisy output; move specialized
instructions from CLAUDE.md to skills; agent teams cost about 7x; use plan mode for complex tasks,
`Esc`/`/rewind` early, give verification targets, test incrementally.

**What we do:** Followed: workflows live in skills (`finish-step`, `crew`, `check-pr`), `gh` instead of
MCP, review level matched to risk (rule 10) to keep token use down. Gap fixed here: the "When compacting"
section. The rest are per-session habits, not repo files.

## 10. Common workflows

**Headings:** Prompt recipes (understand a codebase; fix bugs; refactor; work with tests; create pull
requests; documentation; images; reference files; run on a schedule; ask about capabilities); Resume
previous conversations; Run parallel sessions with worktrees; Plan before editing; Delegate research to
subagents; Pipe Claude into scripts.

**Summary:** recipes for everyday tasks; one worktree per parallel session; plan mode
(`--permission-mode plan` or `Shift+Tab`) for changes you want to review before edits; delegate wide
exploration to a subagent.

**What we do:** Followed: worktree per job (crew skill), tests-first bug fixes (rule 3), PRs through
`finish-step`. Plan mode and resume are per-session habits, not repo files.

---

## Questions for the owner (not applied; each has a recommendation)

- **Q1. Trim "Code layout" in `CLAUDE.md`?** Page 1 ("What you can stop doing", "Keep CLAUDE.md short")
  and page 2 (`/doctor` cuts directory layouts) say Claude finds file layout itself. Recommend: shrink
  it to the few non-obvious rules (`src/model/` has no React or DOM; components never hold geometry or
  rules logic; the store is the only way to change board data) and drop the folder list. The owner just
  trimmed `CLAUDE.md` and kept this section, so this is the owner's call.
- **Q2. Move UI-only rules into `.claude/rules/ui.md` with a `paths:` filter** (rule 6 look, rule 7
  keyboard, rule 12 design and motion)? Recommend: not yet. `CLAUDE.md` is small (71 lines), and a
  path-scoped rule would not load while planning or reviewing without opening a UI file, which could
  silently skip an owner rule.
- **Q3. Make `crew` and `check-pr` manual-only (`disable-model-invocation: true`)?** The page does this
  for skills with side effects. Recommend: no. `crew` is meant to start when the owner says "crew: ...",
  and workers call `finish-step`, which manual-only would block. `check-pr` only reads and reports.
- **Q4. Add a `Stop` hook that runs `npm run typecheck`?** Recommend: no. The `typecheck` hook already
  runs after every `.ts`/`.tsx` edit and rule 3 plus CI cover the full tests; a second check at the end of
  every reply adds delay and the risk of a stop loop for little gain. It changes how every session ends,
  so it is the owner's call.
- **Q5. Add `deny` rules for `.env*` and `secrets/`?** Recommend: no for now. `.env.production` is
  committed and holds only public client IDs, and the repo has no other secret files. Revisit if a real
  secret file ever appears locally. Excluded from automatic changes: it is a permissions change.
- **Q6. Set `model: sonnet` (or similar) on `spec-checker` to save tokens?** Recommend: leave it. The
  check needs judgment against the spec, and the page suggests a smaller model only for simple lookups.
- **Q7. Do crew workers run with a turn or spend cap?** Page 1 asks "what stops it?". The repo shows
  none. Recommend: the coordinator sets a generous cap when it starts a worker, and the owner sets a
  spend limit in their Claude account, if not already set. Nothing in the repo needs to change.
- **Q8. Is `main` protected by a GitHub branch rule that scheduled or cloud tasks cannot bypass?**
  Page 1 recommends it for unattended runs. Cannot be seen from the repo; check Settings, Branches on
  GitHub. Recommend: protect `main` and require the "All tests" check on pull requests into `build/v1`
  (rule 9 says merging is blocked until it passes, so this may already be on). The coordinator pushes
  `build/v1` and `main` directly by design, so the rule must allow it. Needs a change outside the code.
- **Q9. Run `/doctor prompt-audit` once** in a local interactive session and look at what it proposes
  for `CLAUDE.md`, the skills and the agent. It needs Claude Code 2.1.283 or later (2.1.312 is
  installed here) and an interactive session, which a background worker does not have. Recommend: yes,
  once, by the coordinator after this lands.
- **Q10. Shorten the vendored `emil-design-eng` skill (674 lines; the page says keep skills under 500)?**
  Recommend: no. It is Emil Kowalski's text under his license, chosen by the owner (rule 12); trimming
  it means maintaining our own fork.
- **Q11. Make the `bash` guard fail closed (`onFailure: "block"`)?** Page 1 suggests it for hooks that
  protect something. Recommend: no. If the guard script crashed or timed out, every Bash command for
  every worker would stop. It changes how pushing is protected, so it is excluded from automatic
  changes either way.
- **Q12. Add an `ask` rule for `git push *`?** Page 1 shows it as an example. Recommend: no. The guard
  hook already refuses pushes to `build/v1` and `main` for everyone but the coordinator, and workers
  must push their own branches without being asked. Excluded: it changes how pushing works.
