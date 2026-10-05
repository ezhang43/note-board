---
name: improve-codebase-architecture
description: Scan the Note Board codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one the owner picks.
disable-model-invocation: true
---

# Improve Codebase Architecture (Note Board version)

Adapted from Matt Pocock's `improve-codebase-architecture` skill (https://github.com/mattpocock/skills,
MIT licence). Changed for this project: the domain language is `SPEC.md` (not `GLOSSARY.md`), past
decisions are `docs/decisions.md` (not `docs/adr/`), and the grilling step uses this
project's `grill-with-docs` skill. Write for an owner who reads code at a beginner level.

Surface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This command is _informed_ by the project's domain model and built on a shared design vocabulary:

- Call the Skill tool with "codebase-design" for the architecture vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion, and don't drift into "component," "service," "API," or "boundary."
- The domain language in `SPEC.md` gives names to good seams (card, column, checklist item, Completed card, settle, snap…). `docs/decisions.md` records decisions this command should not re-litigate.
- `CLAUDE.md`'s code layout is a given: pure rules in `src/model/`, one store in `src/store/`, display-only components in `src/components/`. Prefer candidates that move rules into `src/model/` where they can be unit tested.

## Process

### 1. Explore

**Scope before you scan: YAGNI.** Deepening a module pays off by making future changes to it easier, so put extra weight on the parts of the codebase that have recently changed. Decide *where* to look before you look:

- If the owner named a direction (a module, a subsystem, a pain point), take it, and skip the inference below.
- Otherwise, walk back a good stretch of the commit history (`git log --oneline`) to find the codebase's hot spots, the files and areas that keep coming up, and let those paths pull your attention first. If the changes are scattered with no clear hot spot, widen the net.

Read `SPEC.md` and `docs/decisions.md` for the area you're touching first.

Then spawn a sub-agent to walk the codebase. Don't follow rigid heuristics; explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow**, with an interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to the session scratchpad directory (or the OS temp directory) so nothing lands in the repo, named `architecture-review-<timestamp>.html`. Open it for the owner (`start <path>` on Windows) and tell them the absolute path.

The report uses **Tailwind via CDN** for layout and styling, and **Mermaid via CDN** for diagrams where a graph/flow/sequence reliably communicates the structure. Mix Mermaid with hand-crafted CSS/SVG visuals: use Mermaid when relationships are graph-shaped (call graphs, dependencies, sequences), and hand-built divs/SVG when you want something more editorial (mass diagrams, cross-sections, collapse animations). Each candidate gets a **before/after visualisation**. Be visual.

For each candidate, render a card with:

- **Files**: which files/modules are involved
- **Problem**: why the current architecture is causing friction
- **Solution**: plain English description of what would change
- **Benefits**: explained in terms of locality and leverage, and how tests would improve
- **Before / After diagram**: side-by-side, custom-drawn, illustrating the shallowness and the deepening
- **Recommendation strength**: one of `Strong`, `Worth exploring`, `Speculative`, rendered as a badge

End the report with a **Top recommendation** section: which candidate you'd tackle first and why.

**Use SPEC.md vocabulary for the domain, and the `/codebase-design` vocabulary for the architecture.** Talk about "the checklist module" or "the settle module," not "the FooBarHandler."

**Decision conflicts**: if a candidate contradicts an entry in `docs/decisions.md`, only surface it when the friction is real enough to warrant revisiting it. Mark it clearly in the card (e.g. a warning callout: _"contradicts the 2026-10-02 decision on …, but worth reopening because…"_). Don't list every theoretical refactor a decision forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance (where it says GLOSSARY.md or ADR, read SPEC.md or `docs/decisions.md`).

Do NOT propose interfaces yet. After the file is written, ask the owner: "Which of these would you like to explore?"

### 3. Grilling loop

Once the owner picks a candidate, call the Skill tool with "grill-with-docs" to walk the decision tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in `SPEC.md`?** Add the term to `SPEC.md` if the owner would see it; otherwise a code comment is enough.
- **Owner rejects the candidate with a load-bearing reason?** Offer to record it in `docs/decisions.md`, so future architecture reviews don't re-suggest it. Only offer when a future reviewer would need the reason; skip ephemeral ones ("not worth it right now").
- **Want to explore alternative interfaces for the deepened module?** Call the Skill tool with "codebase-design" and use its design-it-twice parallel sub-agent pattern.
- Any refactor that follows still obeys CLAUDE.md: tests first, `npm test` and `npm run test:e2e` pass, a CHANGELOG entry, one step at a time.
