## Tapping a tick box on an iPhone ticks it again (2026-10-29)

- Fixed: on an iPhone, tapping a checklist tick box while typing in the same list could leave the box unticked (the cursor stayed in the text, but the tap did nothing). The tap now ticks the box and still keeps the cursor and the on-screen keyboard in the text. Other phones and computers work as before.
- The browser tests now also run this tap check in Safari's engine (WebKit) on an iPhone 14 profile, so it is checked on every change. It is an emulation: it checks the tick and where the cursor stays, not how a real iPhone keyboard looks or feels.
