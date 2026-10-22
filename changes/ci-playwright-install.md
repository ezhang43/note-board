## Steadier automatic tests on GitHub (2026-10-22)

- Fixed the automatic tests getting stuck for half an hour while installing the test browsers' system packages (the download mirror is sometimes very slow), which cancelled the run and held back the automatic publish. The browsers and those packages are now kept between runs, a stalled download gives up and retries quickly, and each install try is capped at 6 minutes with a second try.
