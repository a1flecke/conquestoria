# Issue 547 Mounted, Beast, and Industrial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Repository subagent
> approval rules still apply.

**Goal:** Repair the mounted and aircraft timelines and add the reviewed ancient through
industrial land roster without strict dominance or migration regressions.

**Architecture:** Unit data extends the typed catalogs established in issues 1–6.
Modifiers, discounts, AI roles, production gates, upgrades, sprites, audio fallbacks, and
save normalization use generic helpers. Each unit is one deployable PR.

**Tech Stack:** TypeScript, Vitest, Canvas sprites, DOM production/Codex UI.

---

For Tasks 7–17, the common source set is `src/core/types.ts`,
`src/systems/unit-system.ts`, `src/systems/city-system.ts`,
`src/systems/unit-modifier-definitions.ts`, `src/ai/ai-unit-roles.ts`,
`src/ai/ai-production.ts`, `src/ai/ai-research.ts`,
`src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts`, and the live
production/Codex presentation from the foundation plan. Common tests are
`tests/systems/unit-system.test.ts`, `tests/systems/unit-chain-integrity.test.ts`,
`tests/systems/production-costs.test.ts`, `tests/systems/pacing-production-budget.test.ts`,
`tests/ai/ai-unit-roles.test.ts`, `tests/ai/ai-production.test.ts`,
`tests/ai/ai-research.test.ts`, and `tests/renderer/sprites/sprite-catalog.test.ts`.

Every task first adds failing catalog, positive/negative mechanic, AI, UI, sprite/audio
fallback, and deterministic balance tests; then adds the definition and canonical rule;
then runs the shared execution loop.

## Task 7: Retime Cavalry safely

Move Cavalry to Rifle Tactics + Professional Army at cost 140, strength 44, movement 4,
and +15% pursuit below 60 HP. Add a versioned migration in
`src/storage/save-migrations.ts` plus `City.legacyTechGrace` (or a generic equivalent) so
already active/queued Cavalry completes once while new early queues fail. Existing units
remain valid. Test schema-0, previous/current saves, AI research, queue ETA/order, and
immediate panel state.

## Task 8: Add Chariot

Add Chariot at Wheel + Horseback Riding with the exact design values, Horses requirement,
open/rough modifiers, `Chariot → Knight`, spear counter, Stable/Cavalry Academy family,
and fallback catalog entries. Test that either technology alone fails, rough terrain
reverses its advantage, and Spearman remains a credible answer.

## Task 9: Add Beast Handler Company

Add the generic support/recon definition, 35% detection, and both
`Scout Hound → Beast Handler Company` and `War Hound → Beast Handler Company` edges while
keeping Shadow Warden terminal. Use shared detection and upgrade-family helpers; test
generic/Roman/Persian chains, AI reconnaissance demand, no strategic-resource gate, and
viewer-safe detection copy.

## Task 10: Add War Elephant Corps

Add War Elephant at Tactics, its open charge, shock return-damage rule, polearm exception,
rough penalty, Ivory production discount, and explicit beast-family edge. Implement the
discount in the generic production-cost modifier path. Test Spear/Pike negation, no Ivory
hard gate, no upgrade/crisis discount, AI shock use, and representative counter exchanges.

## Task 11: Add Cuirassier

Add Cuirassier at Rifle Tactics + Professional Army with Horses + Iron, exact open-ground
initiation bonus, `Knight → Cuirassier → Tank`, heavy-mounted classification, and AI
breakthrough role. Test neither Cavalry nor Cuirassier strictly dominates after
cost/movement/terrain and both missing-resource cases are explanatory.

## Task 12: Add Armored Car

Add the cost-168 recon/pursuit unit at Motorized Transport with vision 3, no zone of
control, and `Cavalry → Armored Car → Attack Helicopter`. Extend upgrade evaluation so
the helicopter transition requires a friendly Helicopter Base and capacity and assigns
the base canonically. Test pursuit threshold, no-ZOC movement, AI scouting, failed/full
base, and save round trip.

## Task 13: Make mounted discounts family-driven

Replace Stable/Cavalry Academy unit-ID lists with typed light/support and heavy mounted
families in the canonical production-cost helper. Test exact 15% discounts, strongest
single discount, all intended units, all explicit exclusions, AI cost valuation, queue
ETA text, and catalog coverage for unclassified mounted definitions.

## Task 14: Split the aircraft eras

Modify `src/systems/tech-definitions-eras8.ts`,
`src/systems/tech-definitions-eras9.ts`, and the air-operation definitions: move Biplane
to Aviation; add WWII Fighter at Air Superiority with strike/intercept/rebase range 4,
ferry 8, +20% interception, carrier eligibility; retain and relabel Jet Fighter at Jet
Aviation. Test operations, carrier capacity, AI basing/research, acronym-free copy, and
that WWII Fighter lacks bomber bombardment.

## Task 15: Add Anti-Tank Gun

Add the strength-43 ranged specialist at Tank Warfare with +50% versus typed armor and
−15% versus non-armor. AI need derives from observed armor and its force-budget cap, not
unseen rosters. Test Tank/MBT positive cases, non-armor negative cases, no specialist
spam, barbarian ineligibility until its later integration, and 20–40% counter exchange.

## Task 16: Add Mobile AA

Add the strength-32 field provider at Air Superiority with radius 1 and +8 defense using
the shared AA resolver. AI escorts observed air-threatened formations without reading
hidden bases. Test movement/operational status, strongest-provider stacking, direct
combat weakness, escort assignment, all difficulties, and muted-audio visual warning.

## Task 17: Add Mechanized Infantry and repair Exosuit succession

Add Mechanized Infantry at Armored Tactics + Motorized Transport with Tank Depot, cost
220, strength 61, movement 3, range 1, mobile capture/holding role, and
`Infantry → Mechanized Infantry → Exosuit Infantry`. Recalibrate Exosuit to reviewed
strength 70 within its envelope. Test conjunctive gates, capture/holding, no charge,
upgrade preservation, AI frontline candidacy, Tank Depot requirement, and same-era
exchange/pacing.

## Player Truth Table and replay

For every task, cover unavailable, missing one tech, missing resource/building, legal,
queued, obsolete-but-grandfathered, upgradeable, terminal, and current-player-hidden
states. Replay queue, reorder, cancel, completion, upgrade, and hot-seat handoff with
rendered-DOM assertions. The final wave audit runs the six design play scenarios on all
three difficulties and confirms identical unit rules.
