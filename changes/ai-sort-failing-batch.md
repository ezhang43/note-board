## Sort with AI: a batch that fails the same way is not billed again (2026-11-15)

- When Claude declines a batch of finished items, runs out of room, or answers in the wrong shape, those items are now remembered as asked (with no label, so they keep their built-in categories). Before, nothing was remembered, so every time the Visualizer opened, Sort automatically sent the same 50 items again, costing a use each time, and the items behind them were never sorted.
- The sort stops at that batch and says so in plain words, for example "Claude declined to sort 50 finished items, so they keep their built-in categories." The next sort sends the items behind it.
- Failures that may pass next time (no connection, a time-out, too many requests, a spend limit, a key problem, Anthropic busy) still save nothing, so those items are tried again later.
- Picking another model, or Forget key, asks about those items again, as for any item with no label.
