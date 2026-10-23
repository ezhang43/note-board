## Checklist centering guard (2026-10-23)

- A new browser test now checks, in the real app, that every checklist tick box stays centered on its item's first line (the same slightly-low spot as before), with the same gap to the text. It covers every text size, every text style and font, open and ticked items, sub-items, wrapped items, light and dark, and the phone layout. If a later change moves the centering, the test fails and names the case.
- Nothing looks different: the test found the centering already correct everywhere.
