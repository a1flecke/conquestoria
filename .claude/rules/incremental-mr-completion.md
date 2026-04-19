---
paths:
  - "src/**"
  - "docs/superpowers/**"
---

# Incremental MR Completion

When implementing only a subset of an MR plan's tasks:
- The PR title MUST reflect the subset (e.g. "MR1 Tasks 1+2" not "MR1").
- The PR body MUST list the omitted tasks under an "Out of scope" heading.
- The PR body MUST include a "Why this is safe to merge partial" paragraph that names every player-visible surface introduced by the included tasks and confirms it does not produce dead-end UX.
- If any included task introduces a player-visible action (button, queue entry, panel item) whose follow-up wiring lives in an omitted task, EITHER:
  1. Finish the omitted task, OR
  2. Hide the surface behind a feature flag until the follow-up ships.
- Shipping a player-facing button/queue entry that does nothing — or that links to a half-built system — is not "incremental delivery"; it is shipping a bug.
