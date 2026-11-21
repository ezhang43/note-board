## Steadier test for hover buttons (2026-11-21)

- A browser test from the paint fix sometimes failed on GitHub because it checked a card's buttons a moment too early after pointing at the card. It now waits for them. Nothing in the app changed.
