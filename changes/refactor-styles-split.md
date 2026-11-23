## Stylesheet split into focused files (2026-11-23)

- Behind the scenes: split the single 4,275-line stylesheet (`src/styles.css`) into 16 smaller feature-scoped CSS files under `src/styles/` (`tokens.css`, `base.css`, `toolbar.css`, `canvas.css`, `cards.css`, `checklists.css`, `overlays.css`, `panels.css`, `menus.css`, `comments.css`, `journal.css`, `habits.css`, `calendar.css`, `motion.css`, `phone.css`, and `visualizer.css`), imported in the exact same order.
- Updated the stylesheet and theme unit tests to read the imported files and verify that every partial in `src/styles/` is included.
- Nothing changes in how the app looks or behaves.
