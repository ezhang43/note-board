## Claude Code best-practices check (2026-10-29)

- New `docs/claude-best-practices.md`: which Anthropic Claude Code pages we follow (the best-practices page and the ones on CLAUDE.md, skills, subagents, hooks, settings, permissions, costs and workflows), what each one recommends, and what we do about it. A daily check compares it with the live pages.
- `CLAUDE.md` now says how to start in a fresh worktree (`npm ci`), how to run a single test file, and what to keep when a long session is compacted. It also points to the new file.
- `CLAUDE.local.md` and `.claude/settings.local.json` are now ignored by git, so personal notes and settings can't be committed by accident.
- No app changes. Twelve questions for the owner are listed at the end of the new file.
