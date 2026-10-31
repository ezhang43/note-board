## A browser test no longer fails near midnight (2026-10-31)

- The Version history test that restores the Journal's writing failed when it ran in the last 11 minutes before midnight: it skips the clock ahead 11 minutes, which landed on the next day, whose journal note is empty. Its clock now starts at a fixed midday. Only the test changed; the app is unchanged.
