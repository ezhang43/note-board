## Big boards: cards coming into view are drawn in batches while panning (2026-11-21, trial)

- While you pan a big board, cards coming near are drawn in batches (about every tenth of a second) instead of one at a time on nearly every frame, and cards left behind are put away once the pan pauses.
- Cards are now drawn when they come within two screens (was one); one that gets within a screen before its batch is drawn at once, so you never see a card blank.
- Measured on the 345-card test board (computer slowed down 4 times): no clear gain. Panning stayed at about 8 to 11 frames a second, within the noise either way. The slow part of each pan frame is redrawing the board itself, not drawing the cards that come near.
- Saved boards are unchanged.
