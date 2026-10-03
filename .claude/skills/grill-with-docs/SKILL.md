---
name: grill-with-docs
description: A thorough interview to settle a bigger Note Board feature before building it, recording each answer in SPEC.md and the Decisions list in CLAUDE.md as it is settled.
disable-model-invocation: true
---

# Grill with docs (Note Board version)

Adapted from Matt Pocock's `grill-with-docs` / `grilling` / `domain-modeling` skills
(https://github.com/mattpocock/skills, MIT licence). Changed for this project: decisions and terms go
into `SPEC.md` and the "Decisions" list in `CLAUDE.md`, not a separate glossary or ADR folder, and the
questions are written for an owner who reads code at a beginner level.

## The interview

Interview the owner until you both fully agree on how the feature should work. Map it as a
**decision tree**: every decision branches into the decisions that depend on it.

Work in **rounds**. The **frontier** is every decision whose prerequisites are already settled, so
it can be asked now without guessing at answers you haven't heard yet. Ask the whole frontier in one
round: number each question, describe the choices in plain words (what the owner would see or click,
not code), and give your recommended answer. Then wait for the answers.

Format a round like this:

```
❓ **Q1** - **<short title>**: <the question, with the choices described as what happens on screen>

➡️ <your recommended answer, and why in one line>

---

❓ **Q2** - **<short title>**: <...>

➡️ <...>
```

Each round's answers move the frontier outward. A question whose answer depends on another question
still open in the same round belongs to a later round.

Finding **facts** is your job, never the owner's: read `SPEC.md`, `CLAUDE.md` and the code yourself
instead of asking how something currently works. **Decisions** are the owner's: put each one to
them and wait.

## Keep the words and the facts straight

- **Check against the spec.** If the owner uses a word differently from `SPEC.md` (for example "item"
  for a card, when the spec's item is a checklist item), say so at once and ask which they mean.
- **Sharpen vague words.** Offer the spec's exact term ("to-do list card", "column", "checklist item",
  "loose card", "Completed card") and ask the owner to confirm.
- **Try concrete cases.** Make up specific edge cases ("what if the card is inside a collapsed
  column?", "what happens on undo?", "and on a second device?") so the boundaries are clear.
- **Check the code agrees.** When the owner says how something works today, check the code. If it
  disagrees, show them: "the app currently does X, but you described Y. Which should it be?"

## Record answers as they are settled

Don't save them up until the end. As each decision is settled:

- Update `SPEC.md` so it describes the agreed behaviour (it is the source of truth; build rule 8).
- Add a line under "Decisions" in `CLAUDE.md`, marked with today's date and "owner request" or
  "my call", the same way as the existing entries.

Write in plain English with no code. Only record what was actually decided. Don't add anything the
owner didn't agree to.

## Finishing

The interview is done when the frontier is empty: every branch has been visited and nothing has been
quietly assumed. Summarise the agreed design in a short list and ask the owner to confirm it. Do not
start building until they do. Building then follows the project rules: tests first (written and seen
to fail), then the code, then both test suites, the changelog and a commit.
