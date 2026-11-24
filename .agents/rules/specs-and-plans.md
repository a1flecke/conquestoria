---
trigger: glob
globs: "**/docs/superpowers/**, **/docs/docs-lifecycle-manifest.json"
description: "Canonical Conquestoria spec fidelity, plan lifecycle, and incremental MR rules."
---

Before editing specs, plans, or the docs lifecycle manifest, read:
- `.claude/rules/spec-fidelity.md` — spec conjunctions, visible-UI contracts, and Plan & Spec Lifecycle (`docs/docs-lifecycle-manifest.json`).
- `.claude/rules/incremental-mr-completion.md` — partial-MR requirements.
- `docs/superpowers/plans/README.md` — required guardrail sections for interactive UI, queueing, or recommendation plans.

Run `./scripts/dev.sh verify-impact` to confirm required docs-lifecycle verification.
