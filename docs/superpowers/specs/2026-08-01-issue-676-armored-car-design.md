# Armored Car Design

**Issue:** #676 — Add Armored Car as light-mobile reconnaissance and pursuit

## Goal

Deliver Armored Car as a distinct Era 9 light-mobile choice: fast reconnaissance and
pursuit that succeeds Cavalry and later hands the same strategic role to Attack
Helicopter without presenting that succession as a literal vehicle conversion.

## Contract

- Armored Car unlocks at Motorized Transport, costs 168 production, has 48 strength,
  4 movement, 3 vision, and no strategic-resource requirement.
- It has no zone of control and gains exactly +15% combat strength only when attacking
  a target below 60 health.
- The explicit chain is `Cavalry → Armored Car → Attack Helicopter`; no sibling or
  inferred upgrade is legal.
- Upgrading Armored Car to Attack Helicopter uses the existing typed air-base contract:
  the Armored Car must occupy a friendly city containing a Helicopter Base with a
  remaining compatible slot. The shared upgrade helper assigns that host-city base
  atomically. Missing and full bases deny the upgrade without mutating gold, the
  source unit, or a base roster.
- Explorer, Standard, and Veteran share unit data, gating, combat calculations,
  upgrade legality, and information boundaries. Difficulty introduces no Armored
  Car-specific rule.

## Architecture

One typed `UnitType` flows through the existing `UNIT_DEFINITIONS`, trainable-unit
catalog, technology unlock, role definitions, modifier definitions, and canonical
upgrade evaluator. No Armored-Car-specific production, AI, movement, or air-base
branch is permitted. Its existing typed `recon` unit class makes it neither project
ordinary zone of control nor be stopped by it, so every movement caller already uses
the same no-ZOC rule without a new ID branch.

The existing air-operation and upgrade-base helpers remain authoritative for the
cross-domain succession. This issue extends their definition-driven test matrix for
the Armored Car source and Attack Helicopter target instead of implementing a second
conversion path.

## Player experience

The concise role sentence will say, in no more than 18 words: “Fast reconnaissance
car that pursues damaged foes but cannot hold enemies in place.” Exact pursuit
threshold, no-zone-of-control behavior, next upgrade, gate, and base-capacity
requirements remain inspectable through existing unit, production, and upgrade
surfaces. Legal catalog entries remain reachable; locked entries explain the missing
technology or base condition rather than disappearing.

The combat preview exposes the pursuit fact for the acting player when it applies and
shows it as inactive when the known target is at or above 60 health. It must not
reveal opposing hidden facts. The current-player city panel rerenders immediately
after training or upgrading, and a hot-seat handoff cannot surface a prior player's
eligible catalog, capacity, audio, or preview facts.

## Player Truth Table

| Before | Player action | Immediate visible result |
| --- | --- | --- |
| Motorized Transport is absent | Opens city production | Armored Car remains unavailable with the missing technology named. |
| Motorized Transport is known | Opens city production | Armored Car is visible with role, cost, and tactical facts. |
| Known target has 60+ health | Previews attack | Pursuit fact is shown as not active; no bonus is applied. |
| Known target has under 60 health | Previews or resolves attack | Pursuit fact is shown as +15% and uses the canonical combat result. |
| Armored Car is not in its owner's Helicopter Base city | Requests upgrade | The action is denied with the city/base reason and no state changes. |
| Host-city Helicopter Base is full | Requests upgrade | The action is denied with the capacity reason and no state changes. |
| Host-city Helicopter Base has capacity | Requests upgrade | Armored Car becomes Attack Helicopter, base assignment is visible, and the selected-unit panel refreshes. |
| Hot-seat player changes | Opens or refreshes a city panel | Only the current player's legality and owned base capacity are shown. |

## Misleading UI Risks

- “Pursuit” must not imply an always-on damage bonus: the preview must distinguish
  targets below 60 health from targets at or above that threshold.
- “Upgrades to Attack Helicopter” must not imply automatic availability: the exact
  friendly Helicopter Base and capacity conditions remain visible in the upgrade
  reason.
- Recommendation order may prioritize Armored Car for reconnaissance or pursuit, but
  must never hide another legal production option.
- The Armored Car may move through enemy control without being stopped and does not
  project ordinary zone of control; no surface may describe the inverse.

## AI, balance, and play styles

Armored Car receives typed reconnaissance, pursuit, and mobile roles that the existing
catalog-driven AI production and research helpers use with only owned state and earned
observations. It does not become a universal choice: it has no control utility, its
conditional bonus is inactive against healthy targets, and Attack Helicopter trades
land strength for ranged air operations, base capacity, and later-era tactical reach.
Tests compare Cavalry, Armored Car, Attack Helicopter, Tank, and a durable generalist
under deterministic fixtures rather than asserting a misleading raw-strength ladder.

The role remains understandable to a younger/casual player through the concise first
sentence and visible inactive condition, while optimizers retain exact values, role
facts, and upgrade requirements. Solo and two-human hot-seat tests cover the same
canonical rules.

## Data, saves, audio, and art

Armored Car uses a stable string unit ID and serializable plain state. The new catalog
entry and its reuse of existing `airBase` assignment do not change persisted shape, so
this delivery intentionally adds no save-schema version or migration. Save/load
regressions cover a source Armored Car, a successfully assigned Attack Helicopter, and
a full host-city base to prove the existing data remains valid.

The mechanics PR registers valid temporary sprite and SFX catalog fallbacks. Final
industrial-vehicle art and audio remain explicitly owned by #709 and #715. Mechanically
relevant audio has the same visual/text event, uses the mixer, obeys volume and mute,
and never leaks another hot-seat player's activity.

## Verification boundaries

Write focused failing regressions before production changes. Cover catalog gates,
positive pursuit, threshold negative, no-ZOC movement, explicit-chain rejection,
base-missing/full/success cases, AI catalog selection without hidden state, all
difficulties' legality parity, solo and hot-seat UI isolation, save/load, temporary
catalog entries, and deterministic balance fixtures. Verify modified source paths,
mirrored tests, build, durable full tests, committed/uncommitted diffs, and the final
inline review before delivery.

## Inline review resolutions

| Dimension | Review result and enforced resolution |
| --- | --- |
| Balance and fun | Keep the exact 48/4/3/168 envelope; prove the below-60 pursuit threshold, no-ZOC tradeoff, and non-dominance against Cavalry, Tank, Attack Helicopter, and a generalist. Do not claim a false raw-strength succession. |
| New mechanics | Pursuit and no-ZOC remain definition-driven: modifier facts state the threshold and the existing `recon` class governs both no projection and no stopping. |
| Ages 7–43 and play styles | A concise first sentence explains the role; exact conditions stay inspectable. Explorer/recon, defensive, builder, casual, and optimizer fixtures must retain a credible choice or response. |
| Difficulty and computer players | Explorer, Standard, and Veteran share legality and formulas. AI uses catalog roles plus owned state and earned observations only, with no Armored-Car ID branch. |
| UI and UX | Production catalog accessibility, owner-scoped combat facts, 44-pixel controls where an existing action is touched, immediate selected-unit refresh, and hot-seat isolation are explicit regression targets. |
| Architecture and extensibility | Data and canonical helpers own the unit, pursuit, ZOC behavior, and base-capacity transition. No second vehicle-to-air path or unit-ID switch is allowed. |
| Data and saves | Stable ID and existing `airBase` shape require no migration; save round trips demonstrate this rather than reserving a schema version. |
| SFX and art | Temporary catalog fallbacks are mandatory and player-visible combat facts remain the non-audio equivalent. #709 and #715 retain final replacement ownership. |
| Regression coverage | Human and AI paths, solo and two-human hot seat, exact threshold negatives, missing/full base negatives, and rendered surface updates are required before completion. |
