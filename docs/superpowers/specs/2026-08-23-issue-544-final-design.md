# #544 Final Design & Implementation Directive
## Supply-Lite Logistics + Great Generals

**Repository:** `a1flecke/conquestoria`  
**Issue:** `#544 design(combat): supply-lite healing rules + great generals`  
**Design interview completed:** 2026-08-22  
**Fresh `main` audit baseline:** `b4b42e0a62204df217947b47fc829e5d1322f764`  
**Audience:** family strategy game spanning roughly ages 7, 10, 12, and adult players

---

# 1. Executive intent

Issue #544 began as a small healing restriction plus a Civilization-style Great General aura. The approved design is now materially different.

The final feature should add **operational logistics without logistics bookkeeping** and **rare, named Great Generals who create memorable tactical moments without becoming permanent passive-aura babysitting pieces**.

The governing principles are:

1. **Model the consequences of logistics, not logistics itself.**
   - No supply trucks.
   - No consumable food/fuel/ammunition pools.
   - No traced capital-to-unit supply graph.
   - No player-drawn routes.
   - No per-turn manual supply assignments.

2. **The map should explain the rules.**
   - Cities, Forts, Citadels, roads, railroads, naval logistics units, territory, and distance matter.
   - Supply coverage is visible and previewable.
   - Geography-first deterministic allocation is preferred over opaque optimization.

3. **Difficulty changes AI judgment, not rules.**
   - Humans and AI use identical logistics, General charges, cooldowns, abilities, death rules, and thresholds.
   - Higher difficulty makes better decisions; it does not receive mechanical cheats.

4. **Great Generals should be rare, memorable characters.**
   - No passive combat-strength aura.
   - Three lifetime heroic commands.
   - One long shared cooldown.
   - Permanent death if defeated.
   - Retirement after the third heroic command.
   - A succession of commanders across the game rather than one immortal leader.

5. **V1 equality must not become architecture.**
   - All v1 Generals happen to use the same abilities and values.
   - The code must support future Generals with different abilities, capacities, ranges, cooldowns, charges, traits, and specializations without redesigning the subsystem.

6. **The feature is a normal game rule.**
   - Do not ship it as an optional feature flag or “advanced rules” toggle.
   - Verification should use deterministic scenarios/tests rather than maintaining two permanent gameplay rule sets.

---

# 2. Fresh-repository audit notes

This design must be implemented against current `main`, not against the July assumptions in the original issue body.

At the audited baseline:

- #544 is still open and its original body still describes unrestricted passive healing, no Great General system, a proposed adjacent combat aura, and optional future General charges.
- The July addendum already requires player-visible healing restrictions, named General presentation, per-civ data, AI behavior, hot-seat correctness, and save compatibility.
- Current `main` now includes later architecture that #544 must reuse:
  - definition-driven carrier deck capacity,
  - typed transport/cargo semantics,
  - Fort/Citadel systems,
  - viewer-safe AI/perception patterns,
  - deterministic debug/scenario infrastructure,
  - hot-seat/save validation conventions,
  - centralized combat modifier and combat reward systems.

Known relevant paths include:

- `src/core/types.ts`
- `src/core/turn-manager.ts`
- `src/systems/unit-system.ts`
- `src/systems/unit-modifier-definitions.ts`
- `src/systems/combat-reward-system.ts`
- `src/systems/transport-system.ts`
- `src/systems/fortification-system.ts`
- `src/systems/improvement-system.ts`
- `src/systems/civ-definitions.ts`
- `src/ui/selected-unit-info.ts`
- AI tactical / production / assignment modules
- save schema + migration modules
- renderer/map overlay infrastructure
- deterministic scenario/debug infrastructure

## Mandatory pre-implementation re-audit

Before writing code, re-fetch current `main` and verify these assumptions are still true. If another merge changed one of these contracts, adapt to the newer canonical path rather than cloning old behavior.

Do not create parallel systems when current code already has:
- typed unit-definition capabilities,
- canonical cargo compatibility,
- canonical combat modifiers/previews,
- canonical diplomacy/access checks,
- canonical lethal-damage resolution,
- canonical turn-end processing,
- canonical save migration,
- canonical viewer-safe UI/AI data flow.

---

# 3. Supply model: player-facing mental model

## 3.1 Full Supply

A participating land unit is in **Full Supply** when a valid supply source covers it.

Full Supply allows:
- normal passive/rest healing,
- supply-penalty recovery,
- normal combat and movement,
- base-specific recovery behavior described later.

Examples:
- friendly/allied city,
- friendly/allied Fort,
- friendly/allied Citadel,
- eligible naval logistics support for compatible deployed land units.

## 3.2 Stable but Unsupported

In this state:
- supply degradation does not worsen,
- normal Rest/passive HP recovery is unavailable,
- existing supply penalties do not automatically clear,
- the unit is not considered fully supplied.

This applies to:
- friendly-owned territory outside full-supply coverage,
- allied territory outside full-supply coverage,
- unclaimed territory,
- foreign territory where canonical diplomacy grants legal military access/open borders, unless a valid source provides Full Supply.

Player-facing concept:

> Being away from your bases is inconvenient. Being unsupported inside enemy territory is dangerous.

## 3.3 Hostile and Unsupported / Overextended

A participating land unit ending its turn unsupported in hostile territory begins or continues the overextension clock.

Initial v1 cadence:

| Unsupported hostile owner turns | State | Effects |
|---|---|---|
| 1–2 | Grace | No healing; no combat or movement penalty |
| 3–4 | Degraded | No healing; **-10% Combat Strength** |
| 5+ | Severely Degraded | No healing; **-10% Combat Strength** and **-1 Movement** |

Rules:
- -10% applies on offense and defense.
- Applies to participating land combat regardless of melee/ranged/siege/bombard role.
- Movement can never be reduced below 1 by this penalty.
- No direct attrition HP damage.
- Combat-earned HP restoration remains allowed.
- Same cadence and numbers on all difficulty settings.
- Values are data-driven.

---

# 4. Supply participation must be definition-driven

Do not hardcode by faction identity.

Provide a typed definition capability/property representing whether a unit participates in this land-supply model.

V1 data should generally mean:
- normal civilization land military units: participate,
- barbarians/beasts/stampedes/crisis actors: usually do not,
- naval units: do not participate in this v1 degradation model,
- air units: do not participate in this v1 degradation model,
- Great Generals: do participate.

Future organized non-civ forces must be able to opt in without changing engine logic.

---

# 5. Territory and diplomacy

## Friendly territory
Owned territory outside Full Supply:
- halts deterioration,
- does not heal,
- does not clear existing penalties.

## Allied territory
Same baseline:
- halts deterioration,
- no healing/recovery unless within Full Supply.

Allied cities/Forts/Citadels provide Full Supply automatically in v1.

## Unclaimed land
Unclaimed land is **Stable but Unsupported**:
- no degradation,
- no healing/recovery.

This is intentional to preserve fun exploration.

## Other-civ territory, neither allied nor at war
Use canonical diplomacy/military-access rules:
- legal access/open borders -> Stable but Unsupported unless covered,
- prohibited entry -> keep canonical prohibition,
- if current gameplay permits entry without access, treat logistics as hostile and create a follow-up issue describing the diplomacy/movement mismatch.

---

# 6. Land supply sources

Baseline projection hierarchy:

**Fort < Citadel < City**

- Fort: shortest radius
- Citadel: medium radius
- City: largest radius

Exact initial radii were intentionally not locked.

The implementation agent must choose conservative initial data values after inspecting map scale and add deterministic boundary scenarios.

Cities, Forts, and Citadels have **no unit-capacity limit in v1**.

Overlapping land sources do not stack. If any valid source covers the unit, it is Full Supply. For explanation/UI, choose one deterministic primary source: nearest valid source, then stable tie-breaker.

---

# 7. Captured supply sources

## Captured city

A newly captured city enters stabilization.

Immediately after capture it:
- can halt further supply deterioration in a limited nearby footprint,
- does not provide full healing/recovery,
- does not project full mature radius.

After a short uninterrupted, data-driven owner-turn stabilization period, it becomes a normal supply source.

Ownership change resets stabilization to zero.

## Captured Fort/Citadel

Also require stabilization, but for a shorter period than cities.

Reset on every ownership change. Durations are independently data-driven.

---

# 8. Base recovery and healing

## Immediate penalty clearing

A degraded unit immediately clears accumulated supply penalties only by physically occupying the tile of a valid friendly/allied:
- City,
- Fort,
- Citadel.

Being merely within radius does not grant instant clearing.

Naval logistics never grant instant base recovery.

## Field recovery

If a unit regains Full Supply without entering a base:
- deterioration stops immediately,
- all accumulated supply penalties clear after **one full supplied owner turn without attacking**,
- movement is allowed,
- Rest is not required.

## Healing after entering a base

If a unit moves onto a base tile:
- supply penalties clear immediately,
- no same-turn HP healing merely for arriving.

If it starts the turn already on the base:
- normal Rest/healing can be used.

## Base healing hierarchy

**Fort < Citadel < City**

Exact HP rates are data-driven and were not locked.

## Rest UX

If Rest cannot produce recovery because the unit is unsupported:
- disable Rest,
- explain why, e.g. `Cannot recover while unsupported — restore supply first.`

## Combat reward healing

Combat reward HP restoration remains allowed while unsupported. Do not collapse all HP gain into one global supply gate.

---

# 9. Roads, railroads, and technology

Roads/rails are **bounded logistics amplifiers**, not supply lines.

They:
- do not create supply,
- do not trace unlimited networks,
- can extend a nearby valid source by a bounded amount.

Use hybrid progression:
- source type gives baseline reach,
- relevant logistics technology improves categories,
- infrastructure contributes bounded extension,
- never scale merely because `currentEra` increased.

Road/rail extension scales with technology, not source type.

Naval logistics range may improve through the ship definition and explicit naval/cross-domain logistics technologies. Land-only railroad tech should not magically improve ships.

---

# 10. Naval shore supply

## Typed properties

Eligible ships should use distinct typed properties such as:
- `cargoCapacity`
- `landSupplyCapacity`
- `projectsLandSupplyRange`

They may initially have matching values but must not derive from one another.

Only explicitly capable ships project land supply.

## Unit supply cost

Participating land units receive separate typed `landSupplyCost`.

For v1, initialize it to the same numeric value as canonical `cargoSize` where applicable, but never derive it dynamically.

`cargoSize` and `landSupplyCost` are intentionally independent.

## Compatibility

A naval logistics source may only support land units it could canonically transport.

Reuse canonical cargo compatibility. Do not create a duplicate compatibility table.

## Supply vs cargo capacity

Shore support:
- does not require unused cargo slots,
- does not reserve cargo capacity,
- does not require manual assignment.

## Geography-first allocation

Each ship independently allocates `landSupplyCapacity`:
1. compatible deployed land units,
2. closest first,
3. stable deterministic tie-breaker,
4. if a unit does not fit remaining capacity, skip it and continue,
5. no knapsack optimization,
6. one unit supplied by at most one naval source.

## Multiple ships

Do not pool capacities.

If multiple ships could supply a unit:
- closest ship wins,
- stable tie-breaker.

Assignments recompute **from scratch every end-of-turn resolution**:
- no source affinity,
- no hysteresis,
- no source-history state.

## Ship movement

Ships may move normally. Only end-of-turn position matters.

---

# 11. Supply resolution timing

Resolve supply at the **end of the owner’s turn** for the upcoming interval.

This means:
- end position determines supply,
- moving through range temporarily does nothing,
- moving a supporting ship away before end turn removes support,
- save/load preserves resolved state,
- UI previews projected end-of-turn supply during planning.

Avoid continuous persistent supply flicker during movement.

---

# 12. Supply UI / UX

## Unit panel

Show:
- current state,
- active effects,
- progression stage,
- turns until next worsening transition,
- primary source when supplied,
- recovery guidance.

Examples:
- `Full Supply — Memphis`
- `Stable but Unsupported — no healing`
- `Overextended — Stage 2 of 3`
- `-10% Combat`
- `Movement penalty in 2 turns`

## Supply overlay

Add a toggleable friendly/allied supply overlay showing:
- Full Supply coverage,
- Stable but Unsupported territory,
- Cities/Forts/Citadels,
- bounded road/rail extension,
- naval shore supply.

Do **not** reveal enemy supply coverage.

## Live projected coverage

Preview planned coverage while:
- moving/hovering naval logistics sources,
- placing Fort/Citadel where practical,
- considering road/rail extension.

Projected state must be visually distinct from resolved state.

## End-turn warnings

Warn only for meaningful transitions:
- about to lose Full Supply,
- about to enter -10% combat stage,
- about to enter -1 movement stage.

Warning preference:
- All meaningful warnings (default)
- Critical only
- Off

Presentation-only; never changes mechanics.

## First-time supply tutorial

On first unsupported unit:
- explain the three-state model,
- point to overlay,
- point to unit-panel stage/countdown,
- one-time, skippable/reopenable.

---

# 13. Great General lifecycle

## Earning progress

Civilization-wide Great General progress comes mainly from normal combat XP plus a small set of bounded major military-achievement bonuses.

Possible bonuses include:
- city capture,
- successful city defense,
- victory over materially stronger force,
- other clearly defined major military objective.

Every bonus must be visible.

Protect against farming trivial kills, recapture loops, and weak spawned actors.

## Threshold progression

Hybrid succession:
- each successive General costs more,
- later eras partially soften escalation,
- no hard one-per-era cap,
- no full reset at era transition,
- same thresholds across difficulty.

Exact thresholds are data-driven and not yet locked.

## Candidate choice

When earned:
- generate 2–3 candidates,
- weighted toward current era,
- adjacent-era unused candidates lower weight,
- farther eras fallback only,
- deterministic seeded RNG.

Human chooses one.

AI receives the same candidate set.

## Candidate presentation

V1:
- name,
- portrait,
- era,
- one-line contextual descriptor.

No rename option.

## Historical roster

Historical civs use real commanders tied to their actual civilization/cultural lineage where appropriate.

Custom/fantasy civs use fictional culturally coherent commanders.

Within one game:
- a used General never appears again,
- death and retirement both mark used.

Pool exhausted:
- unused adjacent-era fallback,
- closest era first,
- deterministic tie-breaker,
- never resurrect a previously used General.

Content governance:
- **No Nazi figures.**
- **Genghis Khan is allowed.**
- Other materially controversial candidates should be flagged for maintainer review.

## Spawn

Record the event that crossed the threshold.

Queue candidate choice to a natural break; do not interrupt action resolution or allow indefinite deferral.

Spawn selected General at nearest valid friendly city to the triggering event, deterministic tie-breaker, safe capital fallback if needed.

New General:
- full charges,
- zero cooldown,
- no heroic command on spawn turn,
- no passive stabilization on spawn turn,
- operational next owner turn.

---

# 14. Great General definition architecture

Do not encode “all Generals are the same” into engine assumptions.

Each General definition should be capable of varying:
- identity/name,
- civ/cultural eligibility,
- era weighting,
- portrait/presentation,
- `commandRange`,
- `commandCapacity`,
- `maxCommandCharges`,
- cooldown duration,
- `abilityIds`,
- movement,
- future traits/modifiers/specializations.

V1 definitions may share identical values and abilities. That equality is data coincidence only.

---

# 15. Great General map-unit behavior

A General is a physical, vulnerable, noncombat/support unit with enough definition-driven movement to keep pace with armies.

## General supply

Generals participate in land supply.

They:
- can become overextended,
- cannot stabilize themselves,
- can stabilize others while personally out of supply.

As degradation worsens:
- early stage: command unchanged,
- later: `commandCapacity` drops,
- worst: `commandRange` may shrink.

Exact reductions are data-driven.

Out-of-supply status does not categorically disable heroic commands.

## Stacking with escort

A General may share a tile with one friendly combat unit.

While stacked:
- separate unit/state/action,
- escort action does not consume General action,
- no passive combat bonus either direction,
- command works normally,
- escort counts toward `commandCapacity` when receiving an effect.

Enemy cannot separately target General while escort is present.

If escort is destroyed, General dies too. No escape.

No stacking with another Great General.

## City defense

General can occupy/share city tile and command defense but adds no intrinsic city-defense strength.

## Naval transport

Normal transport rules:
- compatible,
- consumes cargo space,
- no free slot.

Transport destroyed -> General dies.

While embarked:
- no passive command,
- no heroic abilities.

After disembarking:
- one-turn setup,
- command effects available next owner turn.

---

# 16. Passive command stabilization

No passive combat aura.

Within `commandRange`, up to `commandCapacity` eligible out-of-supply units can have degradation **paused**.

It:
- does not make them supplied,
- does not restore healing,
- does not clear penalties,
- only prevents the next worsening step.

Automatic every turn.

Priority:
1. closest eligible,
2. stable tie-breaker.

No manual assignment.

---

# 17. Heroic command resource model

Initial v1:
- **3 lifetime Command Charges**
- one shared cooldown
- initial playtest target: **~10 owner turns**
- any ability costs 1 charge
- any ability starts same shared cooldown
- no independent cooldowns
- no combat-driven recharge
- no tech/difficulty/era acceleration

Data-driven.

Player sees exact charges and cooldown.

Any heroic command:
- can be used after the General moves,
- prior movement does not reduce effect,
- ends General’s remaining action/movement,
- issued effects persist even if General dies afterward.

---

# 18. Rally

Fantasy: **Save my battered army.**

Automatic targeting with preview.

Eligible units within range, up to capacity.

Priority considers both:
- missing HP,
- supply-stage benefit.

Full-HP degraded units can be targeted.

Effects:
- restore bounded HP up to normal max,
- clear exactly one degradation stage,
- prevent worsening again until next owner turn.

Examples:
- severe -> degraded,
- degraded -> grace,
- grace -> no extra stage reduction.

Rally does not make units Full Supply.

Exact HP is data-driven and not locked.

---

# 19. Seize the Moment

Fantasy: **Go! Now!**

Player explicitly selects units:
- within range,
- up to capacity,
- must already have used normal action this turn.

Each receives a **bounded extra action budget**, not a full reset.

May:
- reposition,
- or make another legal attack.

Rules:
- at most one additional attack,
- no full movement refresh,
- no refresh of once-per-turn special abilities,
- no reset of cooldowns/charges/ammo-like state,
- siege setup/firing requirements still apply,
- no bypass of canonical unit rules.

Exact extra-action budget is data-driven and not locked.

Objective/city capture is allowed if legal, but a unit may not chain multiple captures in the same turn.

---

# 20. Last Stand

Fantasy: **Hold this ground.**

Player selects a target hex within command range.

Eligible friendly combat units on/around it are affected up to command capacity.

Civilians/support units are not affected.

Effects:
- moderate defensive bonus,
- one shared formation-wide **Hold!** survival save.

The shared save:
- triggers automatically on first affected unit that would otherwise die,
- leaves it at 1 HP,
- is then consumed,
- no prompt mid-combat.

It applies to involuntary lethal damage:
- attacks,
- bombardment,
- environmental/scripted hazards,
- hostile special effects,
- other canonical lethal sources.

It does **not** protect explicit self-sacrifice/self-destruct costs.

Once issued, Last Stand persists for its normal duration even if General later dies.

Exact defense/area/duration are data-driven and not locked.

---

# 21. Final Command and retirement

Third lifetime charge:
- ability resolves normally,
- no mechanical bonus,
- General remains for rest of owner turn,
- passive stabilization continues,
- retires at end of turn.

Always show explicit confirmation:

> **Final Command**  
> This is General X’s last Command Charge. They will retire at the end of this turn.

Final Command gets stronger brief presentation/fanfare but no gameplay boost.

Retirement:
- remove General,
- record history,
- no permanent civ-wide legacy,
- future combat progresses toward successor.

---

# 22. Death

Permanent.

If defeated:
- General gone,
- unused charges lost,
- no escape,
- no capture/ransom,
- no martyr bonus,
- no morale penalty,
- no accelerated successor.

Escort destroyed -> General dies.

Transport destroyed while carrying General -> General dies.

Already-issued effects continue.

---

# 23. Great General history

Ship lightweight in-match history:
- name,
- portrait,
- era,
- retired vs died,
- heroic commands used/counts,
- one concise end-of-career line.

Examples:
- `Fell defending Athens.`
- `Killed during the siege of Rome.`
- `Retired after leading the victory at Carthage.`

No permanent gameplay bonuses.

Persist structured history for later richer chronicle expansion.

---

# 24. General UX

Show exact:
- command range,
- command capacity,
- charges,
- shared cooldown,
- cooldown remaining,
- ability values,
- supply-degradation reductions to command.

## Pre-confirmation previews

Rally:
- units,
- HP,
- stage changes,
- stabilization.

Seize:
- selected units,
- eligibility,
- exact extra-action allowance.

Last Stand:
- target area,
- affected units,
- defense bonus,
- duration,
- Hold save.

Final-charge preview also shows retirement consequence.

## First-General tutorial

One concise, skippable/reopenable tutorial explaining all three abilities up front:
- Rally,
- Seize,
- Last Stand,
- shared 3 lifetime charges,
- shared cooldown,
- Final Command retirement.

## Contextual hints

Optional hints only for obvious crises. Never nag simply because an ability is ready.

---

# 25. General AI

Full mechanical parity.

Difficulty changes decision quality only.

AI should be balanced in spending:
- not hoard forever,
- not waste on marginal value.

Use ability-specific evaluators feeding a shared spend layer.

Rally evaluator:
- missing HP,
- degradation cleanup,
- survival,
- future usefulness.

Seize evaluator:
- extra attack,
- kill potential,
- capture/denial,
- reposition,
- breakthrough.

Last Stand evaluator:
- strategic position,
- incoming threat,
- value of units,
- expected Hold save value,
- city/Fort/Citadel/chokepoint defense.

Shared layer considers:
- charges left,
- cooldown,
- General safety,
- objective importance,
- tactical swing.

Add tests proving AI appropriately uses all three.

---

# 26. Save/load and hot-seat

Persist only state that truly must survive.

Supply:
- unit degradation/progression,
- captured-source stabilization,
- any resolved turn state needed for same-turn consistency.

General:
- active identity,
- position/transport,
- charges,
- cooldown,
- setup/operational state,
- used-General history,
- progress/threshold,
- pending candidate state if saveable,
- retired/dead history,
- active heroic effects spanning turns,
- Last Stand shared-save state.

Legacy saves:
- safe optional defaults,
- begin General progress from load,
- no destructive migration.

Hot-seat:
- candidate choice only for active player,
- supply overlay never leaks enemy coverage,
- hints/warnings viewer-safe,
- pending targeting cleared on handoff,
- notifications respect visibility.

---

# 27. Combat and lethal integration

Supply -10% must flow through canonical combat modifier/preview logic.

Do not duplicate combat math in UI.

Last Stand defense should use canonical modifier infrastructure where appropriate.

For lethal prevention, prefer one canonical resolution hook capable of distinguishing:
- involuntary lethal damage,
- explicit self-sacrifice.

Do not scatter `hasLastStand` checks across every damage system.

---

# 28. Architecture constraints

Prefer definition-driven typed capabilities:
- `landSupplyCost`
- `participatesInLandSupply`
- `landSupplyCapacity`
- `projectsLandSupplyRange`
- General definitions / ability IDs

Avoid hardcoded type/faction branches.

Create canonical helpers for:
- supply resolution,
- source coverage,
- road/rail bounded extension,
- naval allocation,
- primary-source explanation,
- General stabilization,
- heroic eligibility/effects.

UI and AI consume shared helpers.

All tie-breakers stable.
RNG seeded.
No hidden-info AI.

---

# 29. Tuning values intentionally left open

Do not falsely claim these were user-approved:
- Fort/Citadel/City radii,
- road/rail extension values,
- tech extension values,
- capture stabilization turns,
- Fort/Citadel healing values,
- Rally HP,
- General range/capacity,
- General degradation reductions,
- Seize extra-action budget,
- Last Stand defense/area/duration,
- General thresholds/escalation/era-softening.

Choose initial values using current map scale, movement, healing, war pacing, representative units, and deterministic scenarios.

All must be easy to tune.

Approved initial playtest values:
- hostile unsupported grace: 2 owner turns,
- combat penalty stage: turns 3–4,
- severe stage: turn 5+,
- combat penalty: -10%,
- movement penalty: -1, min movement 1,
- General lifetime charges: 3,
- shared cooldown target: about 10 owner turns, data-driven.

---

# 30. Required deterministic scenario/test matrix

At minimum cover:

## Supply
1. Friendly unsupported -> stable/no heal.
2. Enemy unsupported -> grace -> -10% -> -1 move.
3. Min movement 1.
4. Full Supply + quiet turn clears penalties.
5. Enter City/Fort/Citadel clears immediately.
6. Move into base -> no same-turn healing.
7. Start in base -> healing available.
8. Combat reward HP still works unsupported.
9. Rest disabled when it cannot heal.

## Infrastructure
10. Fort < Citadel < City range.
11. Bounded road extension.
12. Bounded rail extension.
13. Correct tech category improvements.
14. No unlimited traced network.

## Captured sources
15. Newly captured city partial only.
16. City matures.
17. Recapture resets.
18. Fort/Citadel stabilize faster.

## Naval shore supply
19. Compatible unit supplied.
20. Incompatible rejected via cargo compatibility.
21. `landSupplyCost` consumes capacity.
22. Too-expensive closest unit skipped.
23. Closest-first deterministic allocation.
24. Multiple ships independent.
25. Closest ship wins.
26. Full recompute each turn.
27. Moving ship still supplies if end position valid.
28. Embarked units do not consume shore-supply capacity.

## Overlay/UX
29. Projected vs resolved supply.
30. Meaningful warning transitions only.
31. Warning settings presentation-only.
32. Enemy coverage hidden.

## General progression
33. Combat XP advances meter.
34. Major achievement bonus.
35. Farming protections.
36. Successor threshold escalation.
37. Partial era softening.
38. Used General excluded forever.
39. Adjacent-era fallback.
40. Seeded candidate determinism.
41. AI gets same candidate set.

## General lifecycle
42. Spawn nearest valid city to triggering event.
43. Spawn turn inactive.
44. Three charges/shared cooldown.
45. Third command retires end turn.
46. Death loses remaining charges.
47. History persists.
48. Escort destroyed -> General dies.
49. Transport destroyed -> General dies.
50. Disembark setup turn.

## General supply/passive
51. General degrades.
52. Cannot stabilize self.
53. Early degradation command intact.
54. Later degradation reduces command.
55. Automatic closest-first stabilization.
56. Stabilized unit does not worsen.
57. Existing penalty remains.
58. Capacity respected.

## Rally
59. No overheal.
60. Full-HP degraded target valid.
61. Clears exactly one stage.
62. Stabilizes until next turn.
63. Preview matches execution.

## Seize
64. Only already-acted units.
65. One extra attack max.
66. No full reset.
67. No special-ability refresh.
68. Siege requirements remain.
69. Capture allowed.
70. Capture chaining prohibited.
71. Preview matches execution.

## Last Stand
72. Target-area combat units only.
73. Defense bonus.
74. First involuntary lethal -> 1 HP.
75. Second lethal no save.
76. Environmental/scripted lethal can trigger.
77. Self-sacrifice bypasses.
78. General death does not cancel.
79. Preview matches execution.

## AI / hot-seat / saves
80. AI chooses Rally appropriately.
81. AI chooses Seize appropriately.
82. AI chooses Last Stand appropriately.
83. Difficulty alters judgment only.
84. No hidden-info AI.
85. Viewer-safe overlay.
86. Viewer-safe candidate selection.
87. Pending intents cleared on handoff.
88. Same-turn save/load exactness.
89. Legacy save compatibility.

---

# 31. Required implementation workflow

1. Fresh architecture audit against current `main`.
2. Write repo-local design spec mapping this contract to current code.
3. Perform inline design review before implementation across:
   - fun,
   - age accessibility,
   - balance,
   - AI parity,
   - hot-seat privacy,
   - UI discoverability,
   - save compatibility,
   - performance,
   - extensibility,
   - content honesty,
   - SFX/assets,
   - regression risk.
4. Write incremental TDD implementation plan.
5. Build canonical supply data/resolver first.
6. Add UI projection/warnings.
7. Add General data/lifecycle.
8. Add passive command and heroic abilities.
9. Add AI.
10. Validate saves/hot-seat.
11. Balance/scenario pass.
12. Full post-implementation inline review and fix real findings.

Post-review must explicitly check:
- UI/executor drift,
- hidden hardcoded unit IDs,
- stale pending intents,
- state cleanup on death/retirement/capture,
- save defaults,
- AI performance,
- hidden-information leaks,
- double-counted modifiers,
- transport/supply compatibility drift,
- computed-but-never-shown data,
- content/description mismatch.

---

# 32. Explicit non-goals

Do not expand #544 into:
- traced supply lines,
- supply trucks,
- fuel/ammo/food currencies,
- manual unit-source assignment,
- land-base capacity allocation,
- naval-unit supply/degradation,
- aircraft supply/degradation,
- treaty redesign,
- deep General biographies,
- full historical encyclopedia,
- unique General mechanics in v1,
- assassin/sniper General targeting,
- General capture/ransom,
- permanent retirement bonuses,
- full campaign chronicle,
- difficulty-specific logistics rules,
- feature-flagged alternate game modes.

---

# 33. REQUIRED deferred GitHub issues

Before #544 is considered complete, create concrete follow-up issues for intentionally deferred gaps. Do not leave these only as TODO comments.

## A. Naval unit logistics / operational endurance
Design ports, replenishment, fleet endurance, naval recovery.

## B. Air logistics / basing / operational endurance
Design aircraft base logistics, readiness, damaged-base interaction, supply effects using current air-base/carrier architecture.

## C. Treaty-gated logistics / military access
Explore logistics rights distinct from alliance/open borders.

## D. Unique Great General mechanics
Explore different abilities, traits, specialties, command stats, charge/cooldown models. V1 architecture must already support this.

## E. Rich Great General biographies and facts
Add historical biography, educational facts, context, citations/source notes, richer fantasy lore.

Content guidance:
- no Nazi General roster,
- Genghis Khan allowed,
- ask maintainer about other materially controversial candidates.

## F. Expanded Great Generals campaign chronicle / Hall of Fame
Battles influenced, cities defended/captured, units saved, memorable commands, career timeline.

## G. General candidate-pool exhaustion / richer fallback generation
Expand historical data and culturally coherent fallback generation without resurrecting used Generals.

## H. Diplomacy/movement mismatch
Create if current movement rules allow foreign-territory entry without the access semantics required by this design.

## I. Richer General audio/visual presentation
Unique portrait polish, ability-specific effects, Final Command treatment, retirement ceremony, audio variety if not appropriate for #544 core scope.

Also create any additional substantial deferred-gap issue discovered during implementation.

---

# 34. Content acceptance

Descriptions/tooltips must match real mechanics.

Avoid content drift such as:
- claiming passive General combat aura,
- calling friendly unsupported territory Full Supply,
- implying roads create unlimited supply lines,
- implying `landSupplyCapacity` derives from `cargoCapacity`,
- encoding that all Generals permanently share the same abilities.

Run/extend content-honesty tests.

---

# 35. Performance expectations

Avoid:
- full-map pathfinding per unit per frame,
- renderer-loop supply recomputation,
- per-frame naval allocation,
- unbounded AI tile scans.

Prefer:
- end-turn canonical resolution,
- bounded local checks,
- cached/derived coverage where safe,
- deterministic structures,
- interaction-time preview only when needed.

Profile representative large maps if necessary.

---

# 36. Definition of done

#544 is not done when only “enemy territory stops healing” or “a General unit exists.”

It is done when:
- three-state supply works,
- degradation cadence/penalties work,
- territory/diplomacy semantics work,
- Fort/Citadel/City supply/recovery work,
- captured-source stabilization works,
- bounded roads/rail/tech extension works,
- finite naval shore supply works with separate typed properties,
- supply overlay/previews/warnings/tutorial work,
- General earning/candidates/spawn/succession work,
- escort/transport/death rules work,
- passive stabilization works,
- Rally works,
- Seize the Moment works,
- Last Stand works,
- Final Command/retirement works,
- AI uses all with parity,
- save/load/hot-seat are correct,
- legacy saves load,
- deterministic scenarios cover mechanics,
- values are data-driven,
- descriptions are honest,
- required deferred issues are actually created,
- final inline review has no unresolved gameplay/architecture/privacy regressions.

---

# 37. One-sentence product test

> **Stay near your bases to recover, push too far into enemy land and your army gradually loses effectiveness, and rare Great Generals can hold an overextended force together and deliver three unforgettable commands during their career.**

If the implementation cannot still be explained this simply, it has probably drifted or become too complicated.

---

# 38. Final instruction to the coding agent

Treat this document as the approved product/design contract, but treat **current `main` as the authority for architecture**.

Where the repo has evolved:
- preserve approved player-facing behavior,
- adapt implementation to newest canonical abstractions,
- document meaningful deviations,
- do not resurrect stale patterns from the July #544 sketch.

Before coding, perform a fresh current-main audit and produce the repo-local design spec + implementation plan. After coding, perform a full inline post-implementation review and fix real findings before declaring completion.
