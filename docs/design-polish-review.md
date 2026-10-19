# Design polish review (2026-10-19)

Owner request: "include Emil Kowalski's design skill and incorporate it throughout", with "Rule + apply all fixes".
Method: the whole UI was read against `emil-design-eng` (its Review Checklist and animation framework), `review-animations`,
`animation-performance` and `mobile-native`: `src/styles.css`, every component that sets a transition or animation, `src/main.tsx`,
and the website (`src/site.css`, `about/`, `faq/`, `terms/`, `privacy/`, `delete-account/`). `SPEC.md` "Look and feel" colours
and sizes and every decision in `docs/decisions.md` were kept. Nothing in saving, sync, undo or deleting was changed
(`node scripts/claude-hooks.mjs level` says no risky files).

Checked from code and with browser tests; nothing here could be checked on a real phone, and a few rows below say so.

## What the app had already (nothing to fix)

- `prefers-reduced-motion` already switched off the block glide, the landing outline and the tour (and the store skips the tick animation).
- Only `transform` and `opacity` were animated for the tick; the card buttons' hover fade is 120ms.
- No `transition: all`, no `scale(0)`, no spring or Framer Motion, no animation on typing, no `will-change`.
- Touch: 16px text boxes, 44px targets, `touch-action: none` on the bars, `overscroll-behavior: none`, `(hover: none)` handling for the checklist row buttons, theme colour kept in step with dark mode.

## Applied

| # | Before | After | Why |
| --- | --- | --- | --- |
| 1 | Curves written by hand (`ease`, `ease-out`) in each rule | Two strong curves defined once on `:root`: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` (site has its own `--ease-out`) | Built-in curves lack punch; one place to tune (`styles.css` `:root`) |
| 2 | Ticked item left with `animation: item-leave 280ms ease-in` (`styles.css`, `.todo-item.leaving`) | `var(--ease-out)`, same 280ms | `ease-in` delays the first movement, the moment the eye is on it |
| 3 | Arrival tint `450ms ease-out` | `var(--ease-out)`, same 450ms | Curve only; the 450ms is owner decision 2026-10-02 (see held H1) |
| 4 | Block glide `160ms ease-out` on left/top/width, landing outline `90ms ease-out` | Same times with `var(--ease-out)` | Stronger ease-out; times are in SPEC and `extras-smooth.spec.ts` |
| 5 | Welcome tour spotlight and card `0.2s ease` | `200ms var(--ease-in-out)` | They move across the screen, so ease-in-out (and still off for reduced motion) |
| 6 | Collapse arrow: inline `transition: transform 150ms ease` (`icons.tsx`), ran with reduced motion | Class `collapse-arrow`; `150ms var(--ease-out)` only when motion is allowed | Reduced motion was ignored; inline style could not be gated |
| 7 | Buttons, tools, swatches, toolbar controls had no pressed state (phone bar had none either) | `transform: scale(0.97)` on `:active`, 100ms ease-out, for tb-button, tool, help, icon, zoom, phone-bar, item-bar, phone Add, confirm, tour, swatch, format-bar, Completed buttons, item trash and arrows; faded / disabled ones stay still | "Buttons must feel responsive"; press feedback is the one animation that earns its place at any frequency |
| 8 | Menus and panels popped in (File, Arrange, Boards, font menu, Share panel, shortcuts panel, phone Add / ⋯ sheet) with `transform-origin: center` | Fade and grow from 96% in 150ms, `transform-origin` at the opening button's corner (top left; Share top right; phone sheet bottom centre) | Popovers grow from their trigger, never from nothing; closing stays instant, so exit is faster than enter |
| 9 | Colour menu popped in | Fade only (150ms) | The board is panned by the menu's box at the moment it opens (`Toolbar.tsx`), so the box must not be scaled |
| 10 | Side panels, Search bar and delete confirmations appeared at once | Fade in, sliding 16px (side panels) or a few px (Search, confirm), 150ms | Occasional, pointer-opened things should not just blink in |
| 11 | Everything above and the glide ran when a key started it (arrow-key moves, undo, Enter on a button, Ctrl+F, `?`) | `html[data-input='keys']`, set in `main.tsx` on the first real key press and cleared on any pointer press, switches that motion off; the glide, the collapse arrow and all the new fades check it | "Never animate keyboard-initiated actions": 100+ times a day, so animation only makes them feel slow |
| 12 | Ctrl+Enter (and the keyboard on the Done box) ticked with the 280ms fade-out first | Ticks at once (`keyboardInitiated()` in `store/env.ts`, used in `actions/checklist.ts`); clicking or tapping Done still eases out | Same rule as 11. Same end result and same single undo step; the item just doesn't wait |
| 13 | Website: Start / Open buttons and fold arrows had no motion; arrow jumped (its margin changed) | Start and Open shrink to 97% when pressed (120ms); fold arrow turns over in 200ms, using a `translateY` in place of the margin change so it is `transform` only | Feedback on the big call-to-action; layout property removed from the arrow; both off with reduced motion |
| 14 | 23 `:hover` rules (buttons, tints, resize handles, calendar, the website's links) applied on touch too | Wrapped in `@media (hover: hover)` (mixed hover / focus rules split so keyboard focus still shows) | After a tap a phone kept the button tinted until the next tap (mobile-native 1). The checklist row buttons keep their old rules: hidden on touch by decision 2026-10-04 |
| 15 | Grey flash on every tap; a wait for a possible double-tap on buttons | `-webkit-tap-highlight-color: transparent` on `html`; `touch-action: manipulation` on buttons, links, folds, labels | The loudest "this is a website" tells (mobile-native 2, 5); the canvas keeps `touch-action: none` |
| 16 | A long press on a button could select its label | `user-select: none` and no touch callout on `button` only (not body text, notes or items) | Controls aren't content (mobile-native 8) |
| 17 | Phone bottom bar: no pressed look at all | `:active` tint at once (not on the accent + button or an open one) | Feedback the moment a finger lands, also with reduced motion |
| 18 | `70vh` / `100vh - 32px` / `60vh` for the ⋯ sheet, the shortcuts panel, the Boards list | The same with a `dvh` line after the old one as a fallback | `vh` is the height with the address bar hidden, so tall panels ran under it (mobile-native 3) |

Tests (written first, `e2e/design-polish.spec.ts`; the website ones were added right after the CSS): press shrink and that a faded button stays still, menu `transition-duration` and `transform-origin` (click versus Enter), Share origin, glide off after an arrow key and back on after a click, Ctrl+Enter ticks at once while the Done box still eases out, the collapse arrow, no `:hover` rule outside `@media (hover: hover)` (app and website), reduced motion turns it all off, and on a phone: tap highlight, `touch-action`, `user-select`, `dvh`, the pressed bar button, the ⋯ sheet origin.

## Held (not applied)

| # | Idea | Why it is held |
| --- | --- | --- |
| H1 | Arrival tint 450ms to 150-250ms; ease the leave time down too | Held: conflicts with decision 2026-10-02 and SPEC (280ms leave, 450ms tint, in the store as `COMPLETE_LEAVE_MS` / `COMPLETE_ARRIVE_MS`; the store file is a saving / undo file). Only the curve was changed |
| H2 | Block glide on `transform` instead of `left` / `top` / `width` | Held: blocks are placed with `left` / `top`; moving to transforms would change how dragging, snapping and resizing are measured. SPEC fixes the 160ms glide. It is a short move of a few blocks, off for keyboard and reduced motion |
| H3 | Welcome tour spotlight on `transform` instead of `left` / `top` / `width` / `height` | Held: rare, first-visit only, one fixed element; the rewrite is not worth the risk |
| H4 | `viewport-fit=cover` with `env(safe-area-inset-top / left / right)` on the top bar | Held: changes what the owner sees on a notched phone (and the installed app) and can only be judged on a real phone. The bottom bar already uses `env(safe-area-inset-bottom)` |
| H5 | `interactive-widget=resizes-content` in the viewport meta | Held: changes how the keyboard resizes the layout, which the item bar and the "keep the cursor in view" code (SPEC, Phone layout) were tuned around; needs real hardware |
| H6 | Exit animations for menus and panels | Held: React removes them at once; an exit needs state kept for 100ms in many components. Instant exit is faster than the 150ms enter, which the guidance prefers |
| H7 | Animated open / close of the website's folds (`<details>`) | Held: the page must print open and stay native `<details>` (decision 2026-10-16); an animation needs `::details-content` height tricks that aren't in every browser yet |
| H8 | Paint the app edge to edge under the status bar (theme colour per `prefers-color-scheme`) | Held: the theme colour follows the dark-mode button, not the computer's setting, by owner decision (2026-10-16) |

## Left alone on purpose

| Item | Why it stays |
| --- | --- |
| Hover tints do not fade (no `transition` on background) | Hover is seen tens of times a day: the skill says drop or drastically reduce. A fade also would play across every button when dark mode is switched |
| `opacity 120ms` fade of the card header buttons, checklist grip / trash / arrows | Already short, only on hover, stops them flickering as the pointer crosses a list |
| Keyframes for the tick leave / arrive | Once per tick; an interrupting tick or Ctrl+Z applies the pending change first (`flushPendingTick`), so nothing restarts from zero |
| Format bar (above selected text) has no entry motion | Appears on every selection: far too frequent |
| Keyboard Space on a focused button still shrinks it for as long as Space is held | The browser applies `:active` for Space; a 100ms 3% shrink is harmless |
| Dragged block, resize, pan, zoom, selection box | Follow the pointer exactly by design |
| The ant-hill / Completed panel, calendar, timer panel layouts | No motion; only the shared side-panel fade applies |

## Impeccable critique

Impeccable's critique runs through a launcher that downloads a program the first time it runs, and its detector and live
browser overlay need that program plus two sub-agents. This job was told not to install or fetch anything, so **its critique was
not run** and nothing in this document comes from its detector. What was done instead, in Impeccable's terms, was a by-hand
look at the main screens (board with cards, containers and a checklist; the File and Color menus; the phone bottom bar and ⋯ sheet;
the About page) for the look only. No visual-design changes were made: the Honey Workshop colours, sizes and layout are owner
decisions (2026-10-16) and SPEC "Look and feel" wins. See the end of this file for what that look turned up.

What that look turned up (none applied: all are about layout or look, which Impeccable and the owner's decisions lead on):

| Screen | Seen | Left because |
| --- | --- | --- |
| Board, local-only build (no Share / Sign out) | The File menu opens at the button's left edge and runs past the right edge of a 1440px window ("Download backup" is cut off). Signed in, the Share and Sign out buttons leave room and it fits | Not seen on the published layout; a layout change (anchor right when near the edge) is for the owner to decide |
| Phone Add sheet | Four text-only rows (Note, Checklist, Container, Sub-board), while the desktop buttons have an icon each | Would change what the owner sees; SPEC (Phone layout) describes the rows as they are |
| Phone ⋯ sheet | Five tiles leave an empty slot in the second row | The tile grid is an owner decision (job 74, option B) |
| About page | Hierarchy, contrast and the honey block read clearly; nothing to change | n/a |
