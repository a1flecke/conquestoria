# #1089 — Non-Major Actor Archetypes (Implementation Plan)

See design doc: `docs/superpowers/specs/2026-09-22-issue-1089-nonmajor-archetypes-design.md`.

## Files touched

- `src/systems/simulation-rng.ts` — add `createStableIdentityRng(state, key)` sibling export.
- `src/systems/barbarian-archetype.ts` (**new**) — `BarbarianArchetype` type, `resolveBarbarianArchetype`,
  `getBarbarianArchetypeDefinition`, `BARBARIAN_ARCHETYPE_DEFINITIONS` table, and the archetype-aware
  target-selection helpers (`findPredatorHuntTarget`, `isMobilizedForAssault`) that
  `barbarian-system.ts` calls into. Kept in its own file so the non-major decision grammar stays
  structurally separate from the orchestrator, per the design's "keep the grammar separate" goal.
- `src/systems/barbarian-system.ts` — `processPurposefulBarbarians`'s candidate-plan ladder gains
  archetype gating; new `RAIDER_RECOVERY_TURNS` cooldown tracked via the existing plan's
  `lastProgressTurn`/`reconsiderAfterTurn` fields (no new persisted field — see below).
- `src/systems/barbarian-force-composer.ts` — `BarbarianForceCompositionContext`/
  `BarbarianReinforcementContext` gain required `roleWeightMultipliers`; `composeBarbarianForce`/
  `selectBarbarianReinforcement` apply it to the final weight only.
- `src/core/types.ts` — `AIPlanReason` gains `'predator-hunt'` and `'warlord-mobilizing'`.
- `src/systems/faction-system.ts` — one doc comment at the rebel-spawn site pointing at the design
  doc's deferred grammar (§6). No behavior change.
- No `src/core/types.ts` change to `BarbarianCamp`, no `src/storage/**` change — zero persisted
  state added (design §"Identity: derived, not persisted").

## Recovery cooldown without new persisted state

Raider's recovery cooldown needs a "don't re-engage for N turns after returning" memory. Rather
than adding a new field, this reuses the **existing** `AIStrategicPlan.reconsiderAfterTurn` (already
persisted as part of the plan record every camp already carries): when a Raider's raid plan
transitions to `'withdrawing'` and later completes (unit back at camp), the *next* plan constructed
for that camp sets `reconsiderAfterTurn: state.turn + RAIDER_RECOVERY_TURNS` on a low-commitment
`'homeland-secure'` holding plan, and the existing `existingValid` check
(`state.turn <= existing.expiresAfterTurn`) plus a new, narrower check (`state.turn <
existing.reconsiderAfterTurn` blocks only *new raid/hunt selection*, not camp-defense, which
stays first-priority regardless) enforces the cooldown. This reuses a field every plan already has
instead of adding a camp-level counter.

## TDD order

1. **`createStableIdentityRng`** — RED: a test in `tests/systems/simulation-rng.test.ts` asserting
   two calls with the same `gameId`/key but different `turn` values on the input `state` produce
   the identical stream (proving turn-independence), and that it differs from
   `createSimulationRng`'s stream for the same key. Implement → green.
2. **`resolveBarbarianArchetype` + `BARBARIAN_ARCHETYPE_DEFINITIONS`** — RED: a test in a new
   `tests/systems/barbarian-archetype.test.ts` asserting (a) the same camp id + gameId always
   resolves to the same archetype regardless of `state.turn`, (b) different camp ids across a
   reasonable sample distribute across all 3 archetypes (not everything collapsing to one), (c)
   save/reload (rebuild an equivalent state object) resolves identically. Implement → green.
3. **Force-composition wiring** — RED: a test in `tests/systems/barbarian-force-composer.test.ts`
   asserting two calls to `composeBarbarianForce`/`selectBarbarianReinforcement`, identical except
   `roleWeightMultipliers`, produce measurably different role-slot distributions over many seeds
   (statistical sampling, per `strategy-game-mechanics.md`'s own convention), while cap/exclusion
   legality (existing tests) stays green unmodified. Implement → green.
4. **Predator hunt-target selection** — RED: a deterministic fixture with one wounded isolated
   enemy unit and one healthy escorted enemy unit within camp sensing range; assert Predator's plan
   targets the wounded/isolated one, Raider/Warlord's plans do not pick it via the hunt path at all
   (Raider ignores it entirely — no hunt logic; Warlord ignores it too — city-only). Implement →
   green.
5. **Predator avoids cities; Raider/Warlord differ** — RED: a fixture with only a weak, raidable
   city sensed (no worker/caravan/resource/wounded-unit target at all); assert Predator's plan is
   the patrol/homeland-secure fallback (never targets the city), while the same fixture under
   Raider or Warlord's ladder does consider the city. Implement → green.
6. **Warlord mobilization gate** — RED: a fixture with a raidable city sensed but assigned force
   size below `mobilizationThreshold`; assert Warlord's plan is `phase: 'mobilizing'` and the
   turn's move orders do **not** move assigned units toward the city (they may still respond to a
   simultaneous camp-defense threat). A second fixture with force size at/above threshold asserts
   the plan phase advances and move orders do target the city. Implement → green.
7. **Raider recovery cooldown** — RED: a fixture where a Raider camp just completed a raid
   (plan phase `'withdrawing'`, unit back at camp position); assert the next turn's plan is a
   low-commitment holding plan with `reconsiderAfterTurn` in the future, and that a *new* sensed
   raid opportunity is **not** picked up again until that turn passes — while camp-defense still
   fires immediately if a threat appears during the cooldown. Implement → green.
8. **Universal camp-defense invariant** — RED: for all three archetypes, an identical
   camp-threatening fixture produces the identical `'defend'`/`'camp-defense'` plan and identical
   move/attack orders, regardless of archetype. This is the direct analogue of #1087's
   tactical-parity regression, applied to archetype instead of personality. Implement (should
   already hold structurally since camp-defense is unconditional and first in the ladder) → green,
   pinning the invariant rather than fixing a violation.
9. **Hidden-information differential test** — RED: two otherwise-identical states differing only
   in an enemy unit's health/position *outside* the camp's sensing radius; assert the resulting
   plan is byte-identical. A second pair where the change is *inside* sensing range must be
   allowed to (and does) differ — proving the differential test itself isn't vacuous.
10. **Save/reload plan + archetype continuity** — RED: run one turn, save (serialize/deserialize
    equivalent), continue one more turn; assert archetype and plan continuity match an uninterrupted
    two-turn run (mirrors the existing `processPurposefulBarbarians` save/reload test in
    `barbarian-system.test.ts`, extended for archetype).
11. **`AIPlanReason` new codes wired end-to-end** — confirm `'predator-hunt'`/`'warlord-mobilizing'`
    actually appear in a real plan's `reasonCodes` under the fixtures above (not just declared in
    the type union with nothing producing them — the exact "dead reason code" failure mode the
    arc brief calls out by name).

## Verification commands

```
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn vitest run tests/systems/simulation-rng.test.ts tests/systems/barbarian-archetype.test.ts tests/systems/barbarian-system.test.ts tests/systems/barbarian-force-composer.test.ts
scripts/check-src-rule-violations.sh src/systems/simulation-rng.ts src/systems/barbarian-archetype.ts src/systems/barbarian-system.ts src/systems/barbarian-force-composer.ts src/core/types.ts src/systems/faction-system.ts
bash scripts/run-with-mise.sh yarn test
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
```

This MR changes real simulation/strategic-decision semantics (barbarian target selection, force
composition, plan lifecycle), so long-horizon verification is required per the arc brief:

```
bash scripts/run-with-mise.sh yarn verify:local:status   # check coordination state first
bash scripts/run-with-mise.sh yarn test:ai-long
# fallback (established playbook from the #1086/#1087 session) if the wrapper stalls:
bash scripts/run-with-mise.sh yarn vitest run --config vitest.long-horizon.config.ts -t <seed>
```

Prefer extending an existing long-horizon scenario's assertions (barbarian pressure is already
present in every scenario via ordinary map generation) over adding a 10th scenario. Add detection
for: barbarian unit-count runaway (population never unboundedly grows — likely already covered by
existing campaign-analysis envelope checks, confirm rather than assume), camps permanently stuck
with no plan progress, and archetype/plan thrash (a camp should not flip target every single turn
under a stable local situation). Extend `campaign-analysis.ts`'s existing detector set rather than
inventing a parallel one; add a `known-campaign-gaps.ts` entry only if a genuine, currently-real
finding appears — never widen a threshold to silence a real finding.

## Mandatory pre-PR review checklist (Stage 5)

Performed as an active fault-finding pass on the real diff, not paperwork — see the PR body's own
"Mandatory review findings" section for what was actually found and fixed.

## MR boundaries

- In scope: barbarian archetypes (Raider/Predator/Warlord), force-composition wiring, the two new
  `AIPlanReason` codes, the stable-identity RNG primitive, the pirate-grammar audit finding
  (documentation only), the rebel-grammar deferral (documentation only).
- Out of scope, explicitly: any rebel behavior change, any pirate behavior change, Scavenger/
  Settled archetypes, beast-system changes, any #1090 UI/translation work, any barbarian economy/
  diplomacy/tech, any major-civ planner change.
