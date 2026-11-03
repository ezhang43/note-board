## One tap rule on phones, and a pinch is never a tap (2026-11-03)

- Fixed: on a phone, a two-finger pinch that started on a checklist tick box (while typing in the same list) could tick the box when the fingers lifted. A second finger now cancels the tap.
- A tap on a tick box now uses the same limits as every other tap: lifted within 0.45 seconds and within 5 pixels of where the finger came down (it was 0.5 seconds and 10 pixels). A very wobbly tap that used to tick may now need a second try.
- The tap rule is now written in the spec (Phone layout).
