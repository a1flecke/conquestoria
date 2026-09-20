# #1083 — Trade-route/marketplace civ-reference live-state invariant: implementation plan

Companion design doc: `docs/superpowers/specs/2026-09-20-issue-1083-marketplace-references-design.md`.

## Files touched (all DONE in this session)

1. `tests/helpers/save-state-invariants.ts` — `assertMarketplaceReferences`, registered in
   `SAVE_STATE_INVARIANTS` (reuses the existing `ownerKind` helper, no new import needed beyond
   what the file already has).
2. `tests/helpers/save-state-invariants.test.ts` — import + `marketState` lightweight fixture
   builder + 10-case describe block; updated the `SAVE_STATE_INVARIANTS` registration-count test
   (nine → ten, add `'marketplace-references'` to the sorted list).

## Commands run

1. `bash scripts/run-with-mise.sh yarn vitest run tests/helpers/save-state-invariants.test.ts` —
   88/88 passed. **DONE, green.**
2. `bash scripts/run-with-mise.sh yarn vitest run tests/storage/save-compat-matrix.test.ts
   tests/simulation/ai-playability.test.ts` — 47/47 passed, no historical fixture trips the new
   invariant. **DONE, green.**
3. Remaining before merge: full `yarn test`, `yarn build`, push (now unblocked — #1133's host
   orchestration fix landed on `main`).

## Stop conditions

- If the matrix/playability run had failed against a real fixture: same branch as #1080's plan
  (real corruption to repair vs. invariant too strict vs. legitimate exception). **Not needed —
  clean on first run.**
- If reachability tracing (design doc §2) had found a real dangling-reference bug: fix the
  earliest causal writer, same as #1080. **Not needed — no demonstrated break, matching the
  issue's own framing.**

## Mandatory review — INLINE REVIEW ACROSS ALL DIMENSIONS

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics,
different player ages (7-43), different play styles, the built in difficulty modes, how computer
players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper
testing, regressions solo play, and hot seat plays, and proper implementation.**

Same conclusion as the design doc's own pass — no new surface for this plan to find. No findings.
