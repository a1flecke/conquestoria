---
trigger: glob
globs: "**/src/**"
description: "Canonical Conquestoria source-code rules for any edit under src/."
---

Before editing files under `src/`, read the applicable canonical rules:
- `.claude/rules/end-to-end-wiring.md` — every computed gameplay value must be wired to live UI/rendering.
- `.claude/rules/caller-discipline.md` — prefer structural invariants over "caller must remember" contracts.
- `.claude/rules/spec-fidelity.md` — preserve spec conjunctions, gating, and visible-UI contracts.
- `.claude/rules/incremental-mr-completion.md` — avoid dead-end UX and follow partial-MR conventions when slicing work.

After editing `src/`, run `./scripts/dev.sh verify-impact` to see all required verification (including `scripts/check-src-rule-violations.sh` and mirrored tests).
