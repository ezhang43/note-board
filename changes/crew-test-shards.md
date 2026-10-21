## Faster checks on GitHub (2026-10-22)

- The browser tests now run on GitHub in 4 parts at the same time, so "All tests" should finish in roughly 5 minutes instead of about 12.
- "All tests" is still the one check that must pass; it now turns green only when the typecheck, the unit tests and all 4 browser parts passed. Publishing works as before.
- Crew workers now run only the browser tests for their own area on the shared machine; GitHub runs the full set.
