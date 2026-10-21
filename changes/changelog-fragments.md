## Fewer merge conflicts on pull requests (2026-10-21)

- Pull requests no longer edit `CHANGELOG.md` or `docs/decisions.md` directly. Each one adds its own small file under `changes/`, so two open pull requests can't clash on those files and GitHub stops showing "merge conflicts". A new script, `node scripts/fold-changes.mjs`, which the coordinator runs when you say "publish", folds those files into the two logs.
- Nothing in the app, in saving or in saved boards changed.
