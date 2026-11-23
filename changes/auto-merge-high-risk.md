## Coordinator can merge clean high-risk pull requests without waiting (2026-11-23)

- Once `/check-pr` and all GitHub tests pass cleanly on a `high-risk` pull request, the crew coordinator now merges it and publishes `main` without waiting for the owner's yes (owner decision). Workers still never merge `high-risk` pull requests themselves, and any real bug, clash, or data-loss concern still stops for fixes or owner approval.
