# #1089 — Non-Major Actor Archetypes (Design)

Base SHA: `ed10ee0dc39d26c399ccc4fd082c30af2471a318` (origin/main at prompt time, confirmed
current via `git fetch origin main` before starting).

## Stage 0 — drift / duplicate-work audit

- `gh issue view 1089`: state OPEN, body unchanged since creation (`createdAt === updatedAt`).
- `gh pr list --search "1089"` / `"archetype"` / `"barbarian archetype"`: no PR implements this
  issue. The only "archetype" hits are unrelated (crisis-event archetypes #507/#509/#600, sprite
  migration #768, Great General docs #934/#935). **Confirmed: genuinely unstarted.**
- Read in full: `src/systems/barbarian-system.ts` (774 lines — the real orchestrator),
  `barbarian-force-composer.ts`, `barbarian-pressure.ts`, `barbarian-roster.ts`, `pirate-state.ts`
  (types), `pirate-behavior.ts`'s exported function surface, `owner-kind.ts`, `simulation-rng.ts`,
  `seeded-lcg.ts`. Grepped `rebel`/`rebels` across `src/`.

### What already exists (do not rebuild)

- **`processPurposefulBarbarians`** (`barbarian-system.ts`) is the live orchestrator (confirmed —
  `turn-manager.ts:968` is its only production caller). It already has: camp-local sensing
  (`sensedByCamp`, radius 7), home-camp assignment (`barbarianHomeCampByUnitId`), persistent
  `AIStrategicPlan` records per camp (`opponentAI.barbarianCamps`), reason codes (`camp-defense`,
  `opportunistic-raid`, `nearby-opportunity`, `homeland-secure`), pressure-aware reinforcement
  (`barbarian-pressure.ts`'s armor/air observation memory), data-driven force composition
  (`barbarian-force-composer.ts`'s role-capped weighted picker over
  `BARBARIAN_ELIGIBILITY_BY_UNIT`), and challenge-scaled pillage aggressiveness/retreat health via
  `OPPONENT_CHALLENGE_PROFILES`. **This is the system to extend, not replace.**
- **`processBarbarians`** (same file, lines 623-773) is a second, older function. Its camp
  cooldown/spawn logic (lines 638-656) is still live, called internally by
  `processPurposefulBarbarians` for `campTick`. Its unit-movement logic (lines 658-773, the
  "move toward nearest target" the issue explicitly warns against) is **dead in production** —
  `turn-manager.ts` only ever calls `processPurposefulBarbarians`, which calls
  `processBarbarians(camps, state.map, [], seed)` with an **empty** player-units array and no
  `barbarianUnits` argument, so the movement branch never executes live. It is exercised only by
  its own direct unit tests. Not touched in this MR — removing dead code is not this issue's scope
  and it isn't in the way of the new work.
- **Pirates already have a mature, distinct behavioral grammar** — confirmed by reading
  `pirate-behavior.ts`'s exported surface and `pirate-state.ts`'s types:
  `PirateBehavior = 'patrolling' | 'raiding' | 'blockading' | 'besieging'`,
  `PirateIntentState.mode: 'engage' | 'withdraw'`, `PirateHeadquarters` (coastal-enclave vs.
  deep-sea-flotilla), relocation planning, tribute/contracts, notoriety, maritime-stage
  progression, `shouldPirateFleetWithdraw`, `choosePersistentPirateIntent`. This **already
  satisfies** the issue's own illustrative pirate grammar ("plunder → evade → recover →
  return/blockade") almost verbatim — `raiding`→plunder, `mode: 'withdraw'`→evade/recover,
  `blockading`/`besieging`→return/blockade. **No new pirate code is needed for #1089's acceptance
  criterion; this MR documents the finding instead of manufacturing redundant work**, per the
  arc's "don't trust stale issues... if your work incidentally proves another open issue obsolete,
  record the evidence" rule.
- **Rebels have zero behavioral grammar today.** Grepped every `'rebels'` reference in `src/`:
  they spawn near a besieged city (`faction-system.ts`'s revolt handling) and are never touched
  again by any turn-processing loop — confirmed by grep, `turn-manager.ts` has no `rebel`
  reference at all. No movement, no AI, no `resetUnitTurn` call, nothing. They are inert hostile
  decoration that the player must clear to resolve a revolt. This is the "staged implementation"
  case the issue explicitly allows for: **giving rebels a real per-turn decision loop is a
  separate, comparably-sized feature to the barbarian archetype work** (they have no movement
  path today at all — this would be new turn-processing wiring, not an archetype layered onto an
  existing planner). Implementing it inside this MR would blow past "one focused issue, one
  reviewable PR." This MR documents the full intended grammar and the honest deferral (see §6)
  rather than claiming an unimplemented stage exists.
- **Beasts already have their own distinct system** (`beast-system.ts`'s `processBeasts`,
  territory/lair/concealment/hoard mechanics) — found during the audit, not required by the
  acceptance criteria (only barbarians/pirates/rebels are named there), noted for completeness and
  not touched further.

## Stage 1 — independent confirmation of the gap

The actual gap, confirmed by reading the code rather than trusting the issue's framing: every
barbarian camp runs through **exactly one** decision ladder in
`processPurposefulBarbarians` (camp-defense → raid-unit-or-resource → raid-weak-city →
patrol-fallback), with **zero** per-camp differentiation beyond the shared challenge profile and
locally-observed pressure. Two camps at the same era, same challenge, same local situation are
behaviorally identical today — this is exactly the "weaker version of a major civilization... or
reusing move-toward-nearest-target" flatness the issue names, just at the *camp* level (not, as
the issue's title over-broadly implies, missing entirely — the ladder itself is already fairly
sophisticated; it just doesn't branch by archetype).

## Stage 2 — design

### Archetype set: Raider, Predator, Warlord (3, not the issue's illustrative 5)

The issue's acceptance criterion is "at least 3 meaningfully different archetypes," and explicitly
warns against many tiny weighting differences over a few strongly legible ones. Scavenger and
Settled/Migrant are deferred (documented in §6, not silently dropped) — they map onto weaker
extensions of behavior already covered by Raider (scavenger ≈ opportunistic raider biased toward
recently-contested tiles) and Warlord (settled/migrant ≈ a defensive-leaning warlord variant), and
adding them now would dilute rather than sharpen legibility for a first pass.

Each archetype changes **five** behavioral dimensions, reusing existing primitives:

| Dimension | Raider | Predator | Warlord |
|---|---|---|---|
| Target selection | Existing raid-unit (worker/caravan) + raid-resource ladder, unchanged priority | **New**: hunts any sensed hostile combat unit that is wounded (`health < 50`) or isolated (no other sensed unit sharing its owner within 2 hexes) — the isolation check uses only the camp's own already-locally-sensed unit set, never a global scan | Skips raiding entirely; only ever targets a city (existing `nearby-opportunity` city ladder) |
| Fortified-city willingness | Same as today (weak-enough-HP city, unchanged threshold) | **Never** targets a city, regardless of HP | Only target is a city; requires local force `>= mobilizationThreshold` before advancing |
| Commitment / mobilization | `commitment: 0.7` (unchanged) | `commitment: 0.85` (locks onto a wounded/isolated target harder than the base raid) | `commitment: 1.0`; plan `phase: 'mobilizing'` (existing `AIPlanPhase` value) while under-strength — assigned units do not move out, only camp-defense still fires |
| Retreat / recovery | Withdraws after one successful raid (existing), then a **new** camp-local recovery cooldown (no new raid/hunt plan for `RAIDER_RECOVERY_TURNS` after returning) | Re-engages the next isolated/wounded target immediately if one is sensed — lower recovery tendency, reflecting an active predator, not a one-shot raider | After a resolved assault (success or failure), returns to camp and remobilizes rather than dispersing |
| Force composition | Mobile-biased weight multiplier fed into `selectBarbarianReinforcement`/`composeBarbarianForce`; near-zero siege weight | Mobile-and-frontline-biased, lowest siege weight of the three (siege is useless against units) | Frontline-and-siege-biased, highest of the three — a deliberate assault force |

Camp-defense (`campThreat` → `defend` plan) stays the **universal top-priority branch for every
archetype**, unmodified — this is the "defend the camp while mobilizing" requirement from the
Warlord example, generalized: every archetype remains competent at camp defense regardless of its
current motive, the same "recovery/emergency competence" invariant #1087 established for major-civ
personalities, applied here to non-major archetypes.

### Identity: derived, not persisted

Per the issue's explicit instruction to evaluate derivation before persistence: `BarbarianCamp.id`
(`camp-${counters.nextCampId++}`) is already stable and already persisted as part of
`state.barbarianCamps`; `state.gameId` is already stable for the campaign's lifetime. Archetype
identity therefore needs **no new field on `BarbarianCamp`, no migration, no save-shape change** —
it is a pure function `resolveBarbarianArchetype(state, campId): BarbarianArchetype`, deterministic
from already-persisted, already-stable inputs. Same campaign + same camp id ⇒ same archetype,
before and after any number of save/reload cycles, with zero extra bytes on disk.

`createSimulationRng` (the canonical per-draw RNG helper) is the wrong primitive here on purpose —
it folds `state.turn` into every seed, which would make a camp's archetype flicker turn to turn.
This needs a **stable-identity** derivation instead: a new sibling export,
`createStableIdentityRng(state: Pick<GameState, 'gameId'>, key)`, added to `simulation-rng.ts`
itself (reusing its existing `hashToSeed`/`seededLcg` machinery rather than hand-rolling a fourth
copy of the same rolling-hash pattern the module's own doc comment already documents three
pre-existing instances of). Its contract: deliberately excludes `turn`, for identity that must
stay fixed for an entity's entire lifetime (this archetype assignment; potentially other
stable-per-entity derivations later, e.g. a future cosmetic trait). `createSimulationRng` remains
the only choice for anything that should legitimately vary by turn.

`getBarbarianArchetypeDefinition(archetype)` returns a typed row (mirroring #1086/#1087's own
`NATIONAL_INTENT_POSTURE`-style "one typed row per key" convention) with the concrete per-archetype
parameters from the table above: `mobilizationThreshold`, `avoidsCities`, `huntsIsolatedWounded`,
`recoveryCooldownTurns`, `roleWeightMultipliers` (a `Record<BarbarianRoleSlot, number>`).

### Force composition wiring

`BarbarianForceCompositionContext`/`BarbarianReinforcementContext` gain a required
`roleWeightMultipliers: Record<BarbarianRoleSlot, number>` field (required, not optional — same
"a required parameter is a compile error until considered" reasoning #1087 already used for
`posture`). `canAddCandidate`'s existing cap/exclusion logic is **untouched** — only the final
`weightedPick` weight is multiplied by `roleWeightMultipliers[candidate.eligibility.roleSlot]`
before selection. This is deliberately the smallest possible change to a function every existing
composition test already pins exact behavior against: caps, exclusions, and eligibility windows
stay byte-identical; only *which eligible candidate wins the weighted roll* shifts.

### New `AIPlanReason` codes

Two additions to the existing typed union (never a raw string): `'predator-hunt'` (predator's
isolated/wounded-unit target selection) and `'warlord-mobilizing'` (warlord accumulating force
before committing). Camp-defense keeps `'camp-defense'` for every archetype; Raider's existing
raid/patrol path keeps its existing codes unchanged.

### Traceability

`resolveBarbarianArchetype` is itself the stable, typed, cheaply-recomputable "trace" surface
#1090 will consume later — it needs no new persisted trace record, mirroring how the camp's own
`AIStrategicPlan` (with its `reasonCodes`) already serves as the queryable "current motive/plan"
for barbarians. No player-facing prose is written in AI code; #1090 owns translating
`BarbarianArchetype` + `AIPlanReason` into player copy, exactly as the arc brief requires.

## Inline critique (performed before implementation, per Stage 2's own requirement)

- **Is it solving the root problem?** Yes — camps become behaviorally distinguishable across five
  real dimensions, not a damage-number reskin.
- **Is any proposed state unnecessary?** The first draft considered persisting `archetype` on
  `BarbarianCamp` (mirroring `banditLordName`'s precedent). Rejected: `banditLordName` is
  *player-facing flavor text* chosen once from a name pool — there's no way to derive a name from
  an id. Archetype is a *closed, small enum* — deriving it from already-stable inputs is strictly
  simpler and costs nothing. No new persisted state ships in this MR.
- **Are we duplicating an existing mechanism?** `createStableIdentityRng` duplicates
  `hashToSeed`/`seededLcg`'s *use*, not their *implementation* — it's a one-function sibling export
  in the same canonical module, not a new hand-rolled LCG (which the source rule would reject
  outright). Force-composition wiring reuses `weightedPick`/`canAddCandidate` verbatim.
- **Does it introduce hidden-information access?** No — every new decision point (predator's
  isolated/wounded scan) reads only from `sensedUnits`, the camp's own already-locally-filtered
  set; never a global `Object.values(state.units)` scan. This is checked explicitly in §Testing
  below with a sharp differential test (an unsensed enemy's health/position must not change the
  outcome).
- **Does it create new save/migration burden unnecessarily?** No — confirmed above; zero new
  persisted fields.
- **Is the behavior actually observable/testable?** Yes — target selection, force composition, and
  plan reason codes are all plain data a focused unit test can assert on directly.
- **Is scope small enough for a focused PR?** Yes for barbarians. Explicitly **not** attempting
  rebel behavior in this PR (see §6) keeps it that way — a second, honest look at scope discipline
  during this same critique pass, catching scope creep before it started rather than after.

## Non-goals (explicit, matching the issue's own list)

No barbarian economy, diplomacy, or technology. No turning camps into minor civs. No raw
combat-stat difficulty cheats — challenge continues to affect only `pillageAggressivenessMultiplier`
and `retreatHealthPercent` (both pre-existing), never archetype identity, target legality, or
force-composition caps. No rewrite of the major-civ planner. No #1090 UI work in this PR.

## Mandatory pre-PR review finding (Stage 5)

The review pass found one real, narrow correctness gap not anticipated in the original design:
**a plan `existingValid` re-adoption does not re-check the plan against the camp's *current*
archetype.** Within one continuous game this is unreachable (a camp's archetype is stable and
derived, so its own ladder never creates a plan its archetype forbids in the first place) — but a
save that predates #1089 can contain a city-raid plan a since-resolved-Predator camp could never
have created post-#1089, and that stale plan would otherwise be retained (and acted on) for up to
its remaining `expiresAfterTurn` window (≤ 8 turns) instead of being re-selected correctly on the
very next turn. Fixed by folding an `existingViolatesArchetype` check (currently: a retained
`target.kind === 'city'` plan on a `avoidsCities` archetype) into `existingValid`'s computation,
the same self-healing pattern `existingRaidTargetEscaped` already uses for a lost unit target.
Covered by a new regression: "discards a stale city-raid plan a since-resolved Predator camp
inherited from a pre-#1089 save instead of retaining it." Narrower legacy-plan/archetype
mismatches (e.g. a Warlord camp retaining a pre-#1089 raid-unit plan) are not separately guarded —
they are mechanically harmless (still-legal moves/attacks, just not what the *current* archetype
would have chosen) and self-correct within the same ≤8-turn window; generalizing the check to every
theoretical mismatch was judged disproportionate to a narrow, self-healing, save-transition-only
scenario.

## §6 — Rebels: documented grammar, honestly deferred

Intended grammar (not implemented here): **survive** (avoid combat while under-strength, retreat
toward the contested city rather than engaging) → **establish local control** (hold position near
the city center once a minimum force is present, analogous to Warlord's mobilization gate) →
**spread uprising** (a new rebel unit can appear at a second pressured city if regional unrest
supports it, mirroring `minor-civ-coalition-system.ts`'s regional-grievance-radius pattern) →
**potentially establish legitimacy** (a sustained, undefeated rebel presence could someday feed
into a breakaway-civ mechanic, which does not exist in this codebase today and is explicitly out
of scope). None of this is implemented in this MR. Rebels remain exactly as capable (and
exactly as inert) as they are on `main` today — this MR changes zero rebel behavior. A one-line
doc comment is added at the rebel spawn site in `faction-system.ts` pointing future readers at
this design doc and this deferred grammar, so a future implementer does not have to re-derive it
from scratch, and so nobody mistakes the current silence for an oversight.
