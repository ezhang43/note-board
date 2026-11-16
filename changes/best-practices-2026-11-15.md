## Claude Code best-practices check (2026-11-15)
- Weekly check of Anthropic's Claude Code best-practices pages: the advice is the same as on 2026-11-08, so nothing in the setup changed.
- The checklist document now shows the new check date, the new page fingerprints, and two small facts it records from the pages (`/context all` shows loaded files, and an environment variable can raise the Stop-hook block limit).
- Two new questions for the owner are written down in the checklist (whether the push guard should also cover Windows PowerShell, and whether security review can stall a background worker).
- Nothing about the app or saved boards changed.
- Owner answers (2026-11-16): the push guard now also watches Windows PowerShell commands, not only Bash, so a blocked push stays blocked on the Windows computer. Security review stays as it is for now.
