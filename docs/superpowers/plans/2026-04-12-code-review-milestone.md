# Code Review April 12 Milestone

**Context:** Retrospective code review of commits `caa30cc..9eae2dc` (April 5 – April 12, 128 commits, ~37k LOC). Review found 7 real issues across correctness, rule compliance, and UX categories.

**Goal:** Close every issue surfaced by the April 12 review with tests-first fixes, landed in three small bundles so each ships independently.

**Milestone split:**

0. **Bundle 0 — Prevention (Claude config)** — `2026-04-12-cr-bundle0-prevention.md`
   - New `.claude/rules/*.md` sections: immutable turn processing, diplomacy lifecycle, no dead return fields, spawn occupancy, cities[0] extended, privacy/discovery masking, no silent destructive UI
   - PostToolUse hook: `.claude/hooks/check-src-edit.sh`
   - PreToolUse hook: `.claude/hooks/pre-push-review-reminder.sh`
   - Committed `.claude/settings.json`
   - Back-test against the April 12 bugs

1. **Bundle 1 — Correctness** — `2026-04-12-cr-bundle1-correctness.md`
   - Issue 2: Direct state mutation in faction/minor-civ/save-manager
   - Issue 3: Breakaway diplomacy wiring + reabsorb dangling refs
   - Issue 5: `turn-summary.sciencePerTurn` always 0

2. **Bundle 2 — Rule compliance & UX** — `2026-04-12-cr-bundle2-rule-compliance.md`
   - Issue 1: `cities[0]` patterns in advisor and council
   - Issue 4: `startLegendaryWonderBuild` silently wipes production queue

3. **Bundle 3 — Hardening** — `2026-04-12-cr-bundle3-hardening.md`
   - Issue 6: Rebel spawn occupancy check
   - Issue 7: Minor-civ presentation color leak

**Execution order:** Bundle 0 first (guardrails in place before any src changes). Bundle 1 second (data-integrity wins). Bundle 2 third (user-visible). Bundle 3 last (latent-trap hardening).

**Out of scope:** Anything not on the review list — no drive-by cleanup, no new features. If a fix uncovers adjacent rot, file a follow-up rather than expanding scope.
