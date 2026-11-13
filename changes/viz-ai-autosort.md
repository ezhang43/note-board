## Sort with AI runs by itself (2026-11-13)

- **The Visualizer sorts with AI on its own** when you have an Anthropic key saved: open it on By category and the finished items that have no AI category yet are sorted straight away, the same way as pressing Sort with AI.
- A new **Sort automatically** box next to the button turns this off. It is on by default and remembered on this device. With it off, nothing is sent until you press the button, as before.
- It sorts at most once each time you open the Visualizer for each range, so a failure is shown and not retried by itself. The button stays for the rest past 200 and for another try.
- The hint, AI settings and the Privacy policy now say that the Visualizer can send item texts by itself.
- An item Claude could not sort is remembered on this device, so it is not sent (and paid for) again.
- **Sub-items are sorted with their parent in mind.** A finished sub-item now goes to Claude with the text of the item it sits under (for example "Beat the boss" under "Elden Ring"), so the sub-items of one topic land in one category. A parent like "Today" is skipped, and items that are only a time word are never sent. The hint, AI settings and the Privacy policy say so.
- **Never paid for twice.** If this device can't save the sorted labels (storage blocked or full), Sort automatically sends nothing and says "Can't save sorted labels on this device, so Sort automatically is paused." Pressing Sort with AI still works, and any sort stops at the first batch it can't save. Once 2,000 labels are kept, Sort automatically pauses instead of dropping older ones (which would then be sent again).
- Switching to By board while a sort runs, and back, no longer sends that batch again. Unticking Sort automatically stops a sort it started, like Cancel.
- The Play Store data-safety notes now say the Visualizer can send item texts by itself, with a sub-item's parent text.
