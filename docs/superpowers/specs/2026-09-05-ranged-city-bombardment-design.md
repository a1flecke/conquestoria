# Ranged City Bombardment — Design

**Date:** 2026-09-05
**Issue:** #966 (reported as "archer cannot attack adjacent enemy city"; this design
supersedes that bug's scope — see Issue strategy)
**Base:** `origin/main` at `085fa459` (post #965 pirate-enclave blocking, PR #971)
**Scope:** Give ranged and siege units a real from-range city attack, make bombardment
matter to capture, and collapse city interaction onto one resolver.

## Goal

A player standing an Archer, Catapult, or Frigate near a hostile city can attack that
city from range, wearing its defenses down over several turns, and then take it with any
offensive land unit. Today none of that is possible: **no player unit of any kind can
attack a city from range**, and city HP has no bearing on capture.

## Current-main audit

Verified directly against `085fa459` (not from prior specs — see
`.claude/rules/spec-fidelity.md`). A throwaway probe drove `buildSelectedUnitHighlights` +
`resolveMapTapIntent` for four unit types against an ungarrisoned enemy city:

| Attacker | In movement range? | In attack range? | Tap intent produced |
|---|---|---|---|
| `frigate` @ dist 1 | no | **yes** | `move` → executor rejects (naval can't enter land) |
| `warrior` @ dist 1 | yes | no | `assault-preview` |
| `archer` @ dist 1 | yes | no | `assault-preview` |
| `archer` @ dist 2 | no | no | `blocked-movement` — *"Move adjacent, then use the city assault action."* |
| `catapult` @ dist 1 | yes | no | `assault-preview` |
| `catapult` @ dist 2 | no | no | `blocked-movement` — same misleading copy |

Findings:

1. **Two parallel, non-interacting city-damage models.**
   - *Player capture* — `beginMajorCityAssault` (`city-capture-system.ts`), distance 1
     only, decisive: `calculateCityAssaultStrengths` (attacker strength vs
     `getCityIntrinsicStrength`) → `getCityCounterFireDamage` → `resolveCityAssault` →
     move in → occupy/raze. **Ignores `city.hp` entirely.**
   - *HP bombardment* — `resolveCitySiegeDamage` (`city-siege-system.ts`). Callers:
     `turn-manager.ts` (barbarian), `pirate-system.ts`,
     `naval-city-bombardment-system.ts`, `air-operations-system.ts`. **No player
     land-unit caller exists.**
2. **`resolveNavalCityBombardment` is dead code from the player's seat.** It is fully
   built and unit-tested, and `executeAttack` has a `legality.targetType === 'city'`
   branch calling it — but that branch is unreachable, because the only route to
   `executeAttack` is the `combat-preview` confirm, which requires
   `legality.targetType === 'unit'`. This is a `.claude/rules/end-to-end-wiring.md`
   "computed data that never renders" violation.
3. **AI/player asymmetry.** `ai-tactics.ts` has a first-class `bombard-city` tactical
   action executed via `resolveNavalCityBombardment` (`ai-major-turn.ts:390`). The AI can
   bombard cities; the player cannot.
4. **The #966 symptom is not archer-specific.** A Catapult two hexes from a city gets the
   same misleading *"Move adjacent, then use the city assault action."*
5. `fortificationPenetration` is consumed **only** by Fort/Citadel improvements
   (`fortification-system.ts`), never by city walls.
6. **Friendly stacking is uncapped** — `getStackRelationship` exposes `hasFriendlyStack`
   with no limit anywhere.
7. `getCityIntrinsicStrength` has three consumers: `calculateCityAssaultStrengths`,
   `getCityCounterFireDamage`, and `city-panel.ts:1081` (displayed city defense).
8. `preventDestruction: true` bypasses `citySiegeDestructionEra`, the only city-siege
   difficulty knob.

## Design decisions

| # | Question | Decision |
|---|---|---|
| 1 | Does bombardment help capture? | **Yes — remaining HP scales city defense**, with a floor. At full HP the multiplier is exactly `1.0`, so all currently-tuned behaviour is unchanged. |
| 2 | Can a garrisoned city be bombarded? | **Yes**, but a garrison halves incoming bombardment. A garrison still fully blocks *capture*. |
| 3 | Which units bombard? | `attackProfile.kind` of `ranged` or `bombard`, with `targets ∋ 'city'`, at distance `1…profile.range`. Melee never bombards. No minimum range. |
| 4 | Does bombard-through-garrison apply to every siege caller? | **No.** Unit-initiated fire (land, naval, air) ignores the garrison block; barbarian/pirate *ambient siege ticks* keep it, preserving "station a defender" as counterplay against them. |
| 5 | How does sustained bombardment beat 5 HP/turn regen? | **Bombardment itself suppresses regen** for one turn after a hit. |

## Constants

Declared in `city-siege-system.ts`, documented in `.claude/rules/game-balance.md`.

| Constant | Value | Derivation |
|---|---|---|
| `CITY_HP_DEFENSE_FLOOR` | `0.4` | A city bombarded to rubble keeps 40% of its defense. Against a pop-15 Walls+Star Fort+Fortification-Engineering city (intrinsic 54) this moves a Tank from 55% → 75% and an Archer from 41% → 65%: decisive help, never a free metropolis. |
| `CITY_BOMBARDMENT_COEFFICIENT` | `0.4` | Inherited unchanged from `resolveNavalCityBombardment`, so **naval bombardment damage stays bit-identical**. |
| `CITY_BOMBARDMENT_MAX_HP_LOSS_PER_TURN` | `20` | `99 ÷ 20` ⇒ any siege takes **≥5 turns regardless of era or stack size**. Necessary because friendly stacking is uncapped (audit #6); also normalises siege duration, which flat 100 HP otherwise leaves wildly era-dependent. |
| `CITY_BOMBARDMENT_GARRISON_MITIGATION` | `0.5` | Keeps "station a defender" meaningful under decision #2. |
| `CITY_BOMBARDMENT_REGEN_SUPPRESSION_TURNS` | `1` | One full turn of no repair after the last hit. |

Per-shot mitigated damage under these constants (unwalled city): Archer 6, Catapult 8,
Trebuchet 11, Cannon 14, Artillery 19. So a lone Archer is a poor siege engine, four
Archers are a competent one, and one Artillery nearly caps alone. **That era progression
is intended and falls out of the cap rather than a bespoke table.**

## Mechanics contract

### Actions on a hostile city

`resolveCityInteraction` returns the legal set; the preview shows exactly these.

| Action | Eligibility | Effect |
|---|---|---|
| **Attack the *Defender*** | any unit that can attack units at that distance; city garrisoned | Existing unit combat. Unchanged. |
| **Attack the city — −N HP** | `kind ∈ {ranged, bombard}`, `targets ∋ 'city'`, `1 ≤ distance ≤ profile.range`, at war | −N HP, floors at 1. Never captures, razes, or destroys. |
| **Capture the city — N%** | `domain === 'land'`, `strength > 0`, `targets ∋ 'city'`, distance 1, city **un**garrisoned | Existing decisive assault. Unchanged apart from HP-scaled defense. |

Labels are outcome-first and use two plain verbs (*attack* = damage, *capture* = take it),
never three synonyms.

### HP → capture coupling (surgical)

```
cityHpDefenseScale(city) =
  CITY_HP_DEFENSE_FLOOR + (1 - CITY_HP_DEFENSE_FLOOR) * ((city.hp ?? CITY_HP_MAX) / CITY_HP_MAX)

getEffectiveCityAssaultDefense(city, ownerCiv) =
  getCityIntrinsicStrength(city, ownerCiv, 'land') * cityHpDefenseScale(city)
```

`calculateCityAssaultStrengths` uses `getEffectiveCityAssaultDefense`. **`getCityIntrinsicStrength`
itself is not modified**, so `getCityCounterFireDamage` and the `city-panel.ts` defense
display keep their exact current behaviour. Bombardment *damage* mitigation is deliberately
**not** HP-scaled — otherwise damage would accelerate as HP fell, a runaway loop.

### Bombardment resolution

`resolveCitySiegeDamage` gains three optional inputs; **every default preserves existing
caller behaviour exactly**:

```
ignoreGarrison?: boolean      // default false — ambient siege ticks keep the hard block
garrisonMitigation?: number   // default 1 — applied only when ignoreGarrison && hasGarrison
maxHpLoss?: number            // default unlimited — the per-turn cap
```

Order of operations:

```
if (hasGarrison && !ignoreGarrison) -> blocked
mitigated = max(0, round(raw * bombardmentDamageMultiplier / defenseMultiplier) - flatBonus)
if (hasGarrison && ignoreGarrison)  mitigated = floor(mitigated * garrisonMitigation)
if (maxHpLoss !== undefined)        mitigated = min(mitigated, maxHpLoss)
newHp = max(1, currentHp - mitigated)      // preventDestruction
```

`resolveNavalCityBombardment` is generalised to **`resolveUnitCityBombardment`**, accepting
land, naval, and air attackers. It computes `rawDamage`, the remaining per-turn cap,
counter-fire, and the `City.bombardment` update. It is the single mutation seam shared by
player input and AI.

### Counter-fire

A **walled** city counter-fires at any bombardier at **distance 1**, reusing
`getCityCounterFireDamage` unchanged but passing `hasGarrison: false` so walls always
answer an adjacent attacker regardless of garrison. Standing off at range 2–3 is safe —
which is exactly what justifies siege units' cost and slowness. The real risk to a
stand-off siege line is the garrison sortieing and enemy field armies, sustained across
the ≥5 turns the cap enforces.

### Per-turn cap and regen suppression — one field

```ts
// City
bombardment?: { turn: number; hpLostThisTurn: number };
```

- **Cap:** `remaining = CITY_BOMBARDMENT_MAX_HP_LOSS_PER_TURN -
  (bombardment?.turn === state.turn ? bombardment.hpLostThisTurn : 0)`.
- **Regen:** `isCityHpRegenerating` returns `false` while
  `state.turn - bombardment.turn <= CITY_BOMBARDMENT_REGEN_SUPPRESSION_TURNS`.
  Existing adjacent-hostile suppression is unchanged and independent.
- **Boundary:** bombard on turn `N` ⇒ no regen on `N` or `N+1`; regen resumes on `N+2`.
  Pinned by test.

### Truthful denial

A bombard that would deal 0 damage is **never** offered as a live button that burns the
unit's turn. `resolveCityInteraction` returns it under `denied` with copy naming the actual
cause — fortifications absorbed it, the garrison halved it below 1, or this city's
bombardment cap is already spent this turn. Three distinct messages; no silent no-ops.

### Invariants

- Bombardment awards **no experience and no quest/wonder progress** — it never calls
  `applyCombatOutcomeToState`. True today; locked in by test so ranged units cannot farm
  veterancy safely on a city.
- Bombardment is **difficulty-invariant**. `preventDestruction: true` bypasses
  `citySiegeDestructionEra`, the only city-siege challenge knob. Now an explicit, tested
  invariant rather than an accident.
- Bombarding a civ you are not at war with routes through the existing
  `confirm-war-city` / `confirm-war-minor-civ` prompt. (Today `executeAttack`'s city
  branch calls `ensurePlayerWarState` silently — this design fixes that latent bug.)
- **Minor-civ cities are supported.** Minor civs are absent from `state.civilizations` and
  `MinorCivState` has no `techState`, so today they cannot be passed to the defense
  helpers at all — bombardment would silently no-op. Fix: narrow
  `getCityIntrinsicStrength(city, defenderCompletedTechs: string[], attackerDomain)` —
  `defenderCompletedTechs` is the record's *only* use there — and give `CitySiegeInput`
  `ownerCompletedTechs: string[]` plus an optional `ownerGold` used solely by the
  `sacked` branch, which is unreachable under `preventDestruction: true`. Minor civs then
  resolve with `[]` techs and city buildings only. Three call sites; no behaviour change
  for major civs.
- All legality keys off the **acting unit's owner**, never `state.currentPlayer`.

## Architecture

### One resolver (the spine)

```ts
// src/systems/city-interaction.ts  (new)
export type CityAction =
  | { kind: 'attack-defender'; defenderId: string; label: string }
  | { kind: 'bombard'; hpLoss: number; counterFire: number; label: string }
  | { kind: 'capture'; winProbability: number; defenseBefore: number; defenseAfter: number; label: string };

export interface CityInteraction {
  available: CityAction[];
  denied: { kind: CityAction['kind']; reason: string }[];
}

export function resolveCityInteraction(state: GameState, unit: Unit, city: City): CityInteraction;
```

Consumed by **all four** of: `buildSelectedUnitHighlights`, the tap preview, the executor,
and AI scoring. This exists specifically to kill the `movementRange` vs `attackRange`
divergence documented in the audit table — the same divergence that produced #965 and
#966. Preview↔execution parity becomes testable by construction: iterate `available` and
assert each one executes.

### Files

| File | Change |
|---|---|
| `src/systems/city-interaction.ts` | **New.** The resolver above. |
| `src/systems/city-siege-system.ts` | `cityHpDefenseScale`, `getEffectiveCityAssaultDefense`, the four constants; `ignoreGarrison`/`garrisonMitigation`/`maxHpLoss` on `CitySiegeInput`; regen suppression in `isCityHpRegenerating`. |
| `src/systems/naval-city-bombardment-system.ts` | Generalised to `resolveUnitCityBombardment` (land/naval/air), cap + `City.bombardment` update. Rename file to `city-bombardment-system.ts`. |
| `src/systems/city-capture-system.ts` | `calculateCityAssaultStrengths` uses effective defense. `canUnitOccupyCity` already relaxed (see Worktree changes). |
| `src/systems/unit-system.ts` | `'city'` added to `targets` for the ranged units missing it. |
| `src/input/selected-unit-highlights.ts` | Drop the `domain === 'naval'` city filter; derive from the resolver; distinct bombard highlight type. |
| `src/input/map-tap-intent.ts`, `selected-unit-tap-intent.ts` | Route city taps through the resolver. |
| `src/ui/city-action-preview.ts` | **New.** Extracted from `map-interaction-controller.ts`, which builds ~80 lines of inline DOM per case and would otherwise grow a third. |
| `src/app/controllers/player-action-controller.ts` | Execute the resolver's actions; war-confirm routing. |
| `src/ai/ai-tactics.ts`, `ai-major-turn.ts` | Land bombardment candidates, odds-delta scoring. |
| `src/core/turn-manager.ts` | Hold Siege automation tick, beside the existing `auto-explore` branch. |
| `src/core/types.ts` | `City.bombardment`, `automation` hold-siege mode, `city:bombarded` event. |
| `src/storage/save-migrations.ts` | One numbered migration for `City.bombardment`. |
| `src/presentation/register-raider-presentation.ts` | `city:naval-bombarded` → `city:bombarded`. |

## Hold Siege

Bombarding for five turns is otherwise five rounds of identical clicks. Hold Siege reuses
the existing `unit.automation` pattern (`auto-explore` already works this way):

```ts
automation?: … | { mode: 'hold-siege'; cityId: string; startedTurn: number }
```

Processed in `src/core/turn-manager.ts`, alongside the existing
`unit.automation?.mode === 'auto-explore'` branch. Each turn it re-resolves
`resolveCityInteraction`; if a `bombard` action is available it executes it, otherwise it
clears the automation and notifies the player with the reason.

**Cancels on:** the unit taking damage, the city being captured/destroyed, peace, the unit
being moved or ordered manually, an explicit cancel, or bombardment becoming illegal
(out of range, cap permanently unreachable, zero damage).

This is a player-input convenience layered over the **same shared `bombard` mutation** the
AI uses — no actor-parity concern, matching how auto-explore relates to ordinary movement.

## AI

Bombardment is scored by **the assault-odds delta it buys**: the AI values a bombard by the
change in `winProbability` it produces for the best capture-capable friendly land unit
within `AI_BOMBARDMENT_FOLLOWUP_RADIUS` (3) tiles of the city, and only selects it when
such a follow-up unit exists. This
prevents both failure modes — never using the action (leaving it a human-only advantage)
and bombarding aimlessly with no capture to follow. The AI uses the identical
`resolveCityInteraction` legality and the identical `resolveUnitCityBombardment` mutation,
observes normal fog, and gets no bombardment the player could not also make.

## UI / UX

- One preview panel, up to three outcome-first buttons plus any `denied` reasons.
- **The payoff must be visible**: the capture button shows
  `City defenses 54 → 32 (damaged)`, and the panel shows the city's HP bar. Without this
  the entire HP→capture coupling is invisible to the player.
- Distinct highlight type for bombard targets so they don't read as melee targets.
- Previews recompute live: after one unit bombards, another unit's capture odds change.
- Hot seat: previews are per-viewer, derived from the acting unit's owner; an unseen city
  is never revealed by a highlight or a denial reason.

## Data and saves

- One new optional field, `City.bombardment`, plus one numbered migration in
  `save-migrations.ts`. No `SAVE_VERSION` semantic change; every reader treats `undefined`
  as "never bombarded".
- **Documented consequence:** existing saves contain cities at reduced HP under the old
  meaning (HP did not affect capture). After this change those cities are meaningfully
  weaker — a retroactive advantage to whoever is besieging them. Accepted, stated here so
  it is not discovered in play.

## SFX and events

`city:naval-bombarded` becomes **`city:bombarded`** with a `domain: 'land' | 'naval' | 'air'`
field — the old name would be a lie for land fire. `register-raider-presentation.ts` is
updated. Land bombardment gets its own cue (silent artillery is a bug); era-appropriate
variation (arrow volley → trebuchet → cannon → artillery) is Phase 4.

## Balance targets and testing

| Target | Test |
|---|---|
| **Full-HP invariance** — assault odds at `hp === 100` are unchanged | Statistical sampling vs pre-change values; the single most important regression guard |
| Naval bombardment damage unchanged | Exact-value assertion |
| Siege ≥5 turns regardless of stack size | Cap test with 1, 4, and 10 bombardiers |
| Garrison halves bombardment; still blocks capture | Both directions |
| Regen boundary N / N+1 / N+2 | Explicit turn-order test |
| Zero-damage cases are denied, never burned turns | One per cause |
| Preview↔execution parity | Iterate `available`, execute each |
| No XP / quest progress from bombardment | Invariant test |
| Difficulty invariance | Explorer/Standard/Veteran identical |
| Per-era combat sampling | Per `.claude/rules/strategy-game-mechanics.md` |
| Hold Siege auto-fires, and cancels on each documented trigger | One test per cancel cause |
| Hot-seat parity + fog | Same shape as #965's |
| Barbarian/pirate counter-fire and `city-panel` defense unchanged | Regression guard on the surgical scaling |
| #965 pirate-enclave blocking still holds | Both touch `getMovementRangeDetails` |

`tests/systems/pacing-audit.test.ts` is expected unaffected (no economy-yield change) and
must be confirmed, per `.claude/rules/game-balance.md`.

## Phasing

1. **Spine** — `resolveCityInteraction`; HP→capture coupling; capture preview shows the
   delta. Bombardment is meaningful *before* it exists.
2. **Bombard** — land/naval/air action, cap, garrison mitigation, regen suppression,
   war-confirm routing, minor-civ support, event rename, **Hold Siege**.
3. **AI** — odds-delta scoring and parity.
4. **Delight** — visible city damage art (the v2 sprite system already has damage tiers,
   used for pirate enclaves), era-appropriate bombard SFX, flavour notification
   (*"Athens is burning — 32/100"*), first-siege advisor tip.

## Non-goals / follow-ups

Each is a mechanic in its own right and would grow this design past one plan:

- **Demand Surrender** — terms for a low-HP ungarrisoned city, so a siege ends in a
  decision rather than a dice roll.
- **Sortie** — let a garrison attack out and return, making siege defense active.
- **Combined arms** — bonus when a city is bombarded by land and sea in the same turn.
- **Wall breach** — suppress the `walls` multiplier at very low HP, more legible than an
  abstract defense floor.
- Per-unit bombardment coefficients (currently one shared constant).
- Scaling `CITY_HP_MAX` with population.

## Issue strategy

#966 is filed as a bug ("unclear why archer cannot attack enemy city"). This design is a
feature that *fixes* it, so:

- Open a **new tracking issue** for the feature, referencing #966 as the report that
  surfaced it, with one sub-task per phase.
- Keep #966 open; close it from the Phase 2 PR (the phase that actually lets an Archer
  attack a city), not from Phase 1.
- **Close PR #972.** Its branch is reset to `main` and its contents are obsolete — it held
  a since-rejected "explain why you can't attack" approach. Four phases should not share
  one PR; each phase gets its own.

## Worktree changes already staged

Uncommitted on `claude/conquestoria-966-archer-city-targeting`, valid under this design and
folded into Phase 1/2:

- `'city'` added to `attackProfile.targets` for `archer`, `crossbowman`, `ballista`,
  `anti_tank_gun`, `mobile_aa`, `beast_dragon`.
- `canUnitOccupyCity` relaxed to `land && strength > 0 && targets ∋ 'city'` (the
  siege/bombard capture exclusion removed), so any offensive land unit can take an
  undefended city.
- The two now-wrong tests inverted in `attack-targeting.test.ts` and
  `city-capture-system.test.ts`.
