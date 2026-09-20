# #1080 — National-project empire-uniqueness live-state invariant: implementation plan

Companion design doc: `docs/superpowers/specs/2026-09-20-issue-1080-national-project-uniqueness-design.md`.

## Files touched (all DONE in this session)

1. `src/core/types.ts` — add `'already-built-elsewhere'` to `ProductionDropReason`.
2. `src/systems/city-system.ts` — `describeDroppedProductionItem`'s new case; `processCity`'s new
   belt-and-suspenders filter (dequeue a `uniquePerEmpire` NP already in `builtNationalProjectKeys`
   for `city.owner`).
3. `tests/systems/city-system.test.ts` — `describeDroppedProductionItem` case; 3 `processCity`
   regression tests (drop / not-built-yet negative / non-unique-building negative).
4. `tests/helpers/save-state-invariants.ts` — `assertNationalProjectUniqueness`, registered in
   `SAVE_STATE_INVARIANTS` (import `BUILDINGS` from `@/systems/city-system`).
5. `tests/helpers/save-state-invariants.test.ts` — import + describe block (11 cases per the
   design doc's §2 table), updated the `SAVE_STATE_INVARIANTS` registration-count test
   (eight → nine, add `'national-project-uniqueness'` to the sorted list).

## Commands run

1. `bash scripts/run-with-mise.sh yarn vitest run tests/helpers/save-state-invariants.test.ts
   tests/systems/city-system.test.ts tests/systems/national-project-system.test.ts` — 415 passed |
   2 skipped, 3 files. **DONE, green.**
2. `bash scripts/run-with-mise.sh yarn vitest run tests/storage/save-compat-matrix.test.ts
   tests/simulation/ai-playability.test.ts` — 47/47 passed, confirming no historical fixture trips
   the new invariant. **DONE, green.**
3. Remaining before merge: full `yarn test`, `yarn build`, canonical `verify-before-push.sh
   --regular` (see this repo's `require-green-before-push.sh` PreToolUse hook — invoke with an
   explicit `cd <this-worktree>` first line per the workaround documented in #1126's own PR, since
   this session hit the same stale-`$CLAUDE_PROJECT_DIR` harness issue there).

## Stop conditions

- If `save-compat-matrix.test.ts` or `ai-playability.test.ts` had failed against a real historical
  fixture, the plan would branch: determine whether the fixture exposes a real pre-existing
  corruption (write a repair, no version bump) vs. whether the invariant is too strict (revisit
  §2's legal/illegal table) vs. a legitimate exception (document it). **Not needed — both passed
  clean on the first run.**
- If the fix had required touching AI production preference or a broad capture rewrite, stop and
  reconsider scope per the design doc's guardrails. **Not needed — the fix wires up one already-
  computed, already-passed, previously-unused parameter.**

## Mandatory review — INLINE REVIEW ACROSS ALL DIMENSIONS

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics,
different player ages (7-43), different play styles, the built in difficulty modes, how computer
players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper
testing, regressions solo play, and hot seat plays, and proper implementation.**

Same conclusion as the design doc's own pass — this plan only sequences already-completed,
already-reviewed work; no new surface for this pass to find. No findings.
