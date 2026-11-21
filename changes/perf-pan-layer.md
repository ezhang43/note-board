## Board layer hint while panning and zooming (2026-11-21)

- While you pan or zoom the board (scroll wheel, trackpad pinch, two-finger pinch, or dragging empty board), the browser is told the board layer is moving, and about 150 ms after you stop it is told again that it is still, so text is drawn sharp at the new zoom.
- Measured on a 345-card board, this made no clear difference to smoothness; see the pull request.
