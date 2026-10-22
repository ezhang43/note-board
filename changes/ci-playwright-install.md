## Steadier automatic tests on GitHub (2026-10-22)

- Fixed the automatic tests getting stuck for half an hour while installing the test browsers' system packages (a slow download mirror), which cancelled the run and held back the automatic publish. A stalled download now gives up quickly and retries, each install try is capped at 6 minutes with one second try, and the test browsers are kept between runs.
