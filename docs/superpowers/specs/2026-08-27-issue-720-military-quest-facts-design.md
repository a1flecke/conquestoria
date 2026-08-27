# Issue 720 Military Quest Facts Design

**Status:** Approved for implementation after current-main review

## Goal

Give legendary-wonder quests a small, typed, save-safe military fact layer. It records historical outcomes where history matters and reads present owned state where a quest requires a simultaneous condition.

## Decision

Use one `LegendaryWonderHistory.militaryFacts` append-only ledger for four transition-owned facts: surviving combat victories, completed Forts, Fort/Citadel repels, and successful interceptions. Each record has a deterministic ID, owner civ ID, turn, and only the typed fields needed by generic quest definitions.

“Field combat units across roles” is deliberately a generic current-state query, not a lifetime ledger count. Terracotta Army requires units to be fielded simultaneously; a historical count would incorrectly retain dead, captured, upgraded, transported, crisis, and civilian units. The query reads only the owner’s unit roster, filters live non-transported combat units, and derives their typed primary combat roles.

## Mutation ownership

`applyCombatOutcomeToState` owns combat-victory and Fort/Citadel-repel recording because every live combat caller settles there after Last Stand, capture, splash, and removal rules resolve. It must not be placed in `resolveCombat`, which is a pure calculator also called for previews.

`processImprovementTurns` owns Fort-completion recording once construction reaches zero turns. It records the worker owner and owning city territory at that exact transition.

`resolveAirStrike` owns successful-interception recording immediately after its interception settlement. A record exists only when the interceptor survives in settled state and the intercepted striker does not.

## Fact contract

Facts use stable IDs constructed from immutable event inputs:

- `combat-win:<turn>:<attackerId>:<defenderId>:<winnerId>`
- `fort-completed:<turn>:<ownerId>:<q>,<r>`
- `fortification-repel:<turn>:<attackerId>:<defenderId>:<defenderId>`
- `interception:<turn>:<interceptorId>:<strikerId>`

The recorder deduplicates by ID. A normalized save rejects malformed records, unknown roles, invalid fortification tiers, invalid positions, and duplicate IDs. Missing `militaryFacts` normalizes to an empty array; it never reconstructs facts from later world state.

## Generic quest metadata

Extend the legendary-wonder quest-step union with definition-driven steps for:

- simultaneous current combat-role fielding;
- surviving combat victories;
- completed Forts in distinct city territories;
- Fort/Citadel repels;
- successful interceptions.

The evaluator reads only the project owner’s records/state. Definitions will later select counts, allowed roles, fortification tier, and distinct-city behavior. No core-system code mentions Terracotta Army, Crac des Chevaliers, or NORAD.

## Player, AI, and privacy review

The existing owner-scoped wonder panel exposes the owner’s generic quest descriptions and updated completion state immediately. Rival players continue to see only existing earned legendary-wonder intelligence, never fact records, roles, unit IDs, fort locations, interception locations, or progress.

Human, AI, minor-civ, pirate, crisis-force, and hot-seat combat settle through the same combat path. Facts may be recorded for any owner, but evaluation only reads the owner’s data; no information is granted by recording it. AI receives no new omniscient query and needs no #720-specific policy because this issue introduces no buildable wonder or reward.

For younger/casual players, quest text will use plain verbs and visible counters; optimizer players receive exact counts from the same generic descriptions. Difficulty modes receive identical fact eligibility and counting. This foundation adds no tuning, yield, combat-strength, or pacing effect.

## Scope and non-goals

This is mechanics/data only. It adds no wonder definition, reward, asset, bespoke visual, sound, notification, or strategic-deterrence behavior. It does not change supply, Great Generals, crisis forces, diplomacy, combat damage, or air-defense coverage.

## Test and regression strategy

Tests prove mutation-source recording, idempotency, typed role boundaries, distinct territory, Fort/Citadel and post-settlement survival conditions, interception success, AI/human parity, current-player isolation, migration idempotency, and generic quest evaluation. Existing wonder-panel tests prove the generic descriptions remain rendered; no interaction changes in this issue.
