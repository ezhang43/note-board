# Changelog and decision fragments

A pull request never edits `CHANGELOG.md` or `docs/decisions.md`: when two open pull requests both
add a line there, GitHub shows "merge conflicts" on the second (GitHub's merge button ignores
`.gitattributes`). Instead each pull request adds its own new file here, which can never clash:

- `changes/<branch>.md`: the changelog entry (a `## Title (date)` heading and plain-English bullets).
- `changes/<branch>.decisions.md`: only if you made calls while building; one `- <date> ...` bullet each.

`<branch>` is the pull request's branch name (slashes become `-`).

When the owner says "publish", the crew coordinator runs `node scripts/fold-changes.mjs`: it puts
the entries at the top of `CHANGELOG.md`, the decisions at the end of `docs/decisions.md`, deletes
the fragments and commits the result. This file stays.
