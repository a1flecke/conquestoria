# City As A Combat Entity — Design

Issue: #522 (remaining scope). The flat-damage-siege bug itself is fully fixed —
barbarian half in #549, pirate half in #556 (merged). This spec addresses the issue's
**second comment**, which extended the scope: `beginMajorCityAssault` lets any adjacent
melee unit walk into an **ungarrisoned** city instantly, regardless of walls/Star
Fort/defensive techs — those bonuses today only ever multiply a *garrison unit's*
defense strength (`calculateCombatStrengths` → `getCityDefenseBreakdown`, applied only
when a defending `Unit` exists on the city tile). Remove the garrison and the bonus has
nothing to apply to; the city offers zero resistance. Meanwhile cities never strike back
at besiegers at all — no intrinsic strength, no ranged retaliation.

## Background — what's already true (verified against current `main`, post-#556)

- `beginMajorCityAssault` (`src/systems/city-capture-system.ts:156`) blocks entirely if
  any unit occupies the city tile (`'city-defended'` failure — the player must defeat
  that unit in normal combat first); otherwise it proceeds straight to the
  raze/occupy-disposition flow with **no combat, no strength check, no odds**.
- `getCityDefenseBreakdown` (`src/systems/combat-system.ts:64`) already computes
  `{ multiplier, flatBonus, parts }` from walls (×1.25), Star Fort (+5, requires walls),
  Fortification Engineering (+5, requires walls), Professional Army (×1.10), and
  Torpedo Warfare (+5, naval attackers only) — but it is only ever consumed inside
  `calculateCombatStrengths` when a real defending `Unit` exists.
- `src/systems/city-siege-system.ts` (built for #549/#556) already has
  `resolveCitySiegeDamage`/`applyCitySiegeOutcome`/`getCityGarrisonUnit`/
  `isCityHpRegenerating`/`applyCityHpRegeneration` for the barbarian/pirate multi-turn
  HP-drain siege model, with a `hasGarrison` full-block rule and a last-city sack-only
  guarantee (`isOwnersLastCity`). **This model is not being replaced or touched by this
  spec** — see design decisions below.
- The UI unit-attack tap flow (`src/main.ts`, the non-`'assault-city'` branch around
  line 2930) already builds a preview panel (odds/breakdown text +
  `createGameButton` Attack/Cancel pair) before calling `executeAttack`. The
  `'assault-city'` tap-intent branch (`main.ts:2973`) calls `beginPlayerCityAssault`
  **immediately on tap, with no preview**, because today there is nothing to preview —
  the outcome is guaranteed.
- Minor-civ (city-state) capture goes through a separate, already-distinct system
  (`conquestMinorCiv`), confirmed by `beginMajorCityAssault`'s own `not-major-city`
  guard. **Out of scope** for this spec, matching #522's stated bounds.

## Design decisions (resolved in brainstorming)

1. **Full unification** — both the player-capture path and the barbarian/pirate
   chip-damage path derive city defense from the same intrinsic-strength model, per the
   issue's explicit ask ("route BOTH... through it").
2. **Player capture resolves as a single decisive combat exchange**, not a shared
   `city.hp` grind. `city.hp` stays the barbarian/pirate multi-turn siege-attrition pool,
   completely unchanged. An ungarrisoned city's defense against a *player* attacker is a
   one-shot strength comparison (win this turn or don't), keeping conquest pacing close
   to today's (still winnable in 1–2 turns by a real army) while finally giving
   unwalled-vs-walled cities a meaningful difference. This was a deliberate,
   explicitly-flagged de-risking of the issue's more literal "HP with regen" phrasing,
   which would have turned every empty walled city into a multi-turn grind — a major,
   unreviewed pacing change to the core conquest loop.
3. **Automatic ranged counter-fire, no-garrison only.** A walled, ungarrisoned city
   automatically deals retaliation damage to any hostile unit that attacks it —
   uniformly across player, barbarian, and pirate attackers. This does **not** stack
   with a garrisoned city's existing unit-vs-unit combat retaliation (garrison presence
   changes the whole resolution path, mirroring the existing #549 "garrison fully
   blocks" precedent) — avoids double-punishing attackers of a defended city.

## 1. Intrinsic city strength

New `getCityIntrinsicStrength(city: City, ownerCiv: Civilization, attackerDomain: 'land' | 'naval' | 'air'): number`
in `city-siege-system.ts` (the file that already owns `getCityDefenseBreakdown`
composition for sieges):

```
base = CITY_BASE_STRENGTH + city.population * CITY_STRENGTH_PER_POPULATION
intrinsicStrength = base * breakdown.multiplier + breakdown.flatBonus
```

where `breakdown = getCityDefenseBreakdown({ cityBuildings: city.buildings, defenderCompletedTechs: ownerCiv.techState.completed, attackerDomain })`
— **verbatim reuse**, no new defense sources. Proposed constants:
`CITY_BASE_STRENGTH = 5`, `CITY_STRENGTH_PER_POPULATION = 3`. Calibration rationale
(from the current unit-strength spread, ~5 at era 1 to ~120 at era 12): an unwalled
outpost (population 1) sits at ~8 — trivially weak, matching the intent that early
outposts stay vulnerable; a walled metropolis (population 12+) with just the walls
multiplier reaches ~50+, comparable to a mid-tier defending unit of its own era. These
are tuning constants, not load-bearing architecture, and **must** be validated by a
balance-sampling test across eras (§6) before merge — same method already used for the
pirate siege damage table (`PIRATE_SIEGE_DAMAGE`).

Intrinsic strength applies **regardless of walls** (population always contributes a
baseline) — walls/techs are multipliers on top, exactly mirroring how
`getCityDefenseBreakdown` already layers onto a garrison unit's strength today. This is
deliberately different from counter-fire (§3), which requires walls specifically.

## 2. Player-capture resolution — `resolveCityAssault`

`resolveCombat` (`combat-system.ts:226`) is built around two real `Unit` objects
(health, veterancy, death, rewards). Routing a city through it would require
constructing a synthetic `Unit` — an awkward hack that drags in unrelated
unit-combat side effects a city doesn't have. Instead, two new functions in
`city-siege-system.ts`, mirroring the existing `calculateCombatStrengths` /
`resolveCombat` split:

- `calculateCityAssaultStrengths(attacker: Unit, intrinsicStrength: number): CityAssaultStrengthBreakdown`
  — the odds/preview half. Returns attacker strength (from `UNIT_DEFINITIONS`, with the
  same terrain/river modifiers real combat previews already show), the city's
  `intrinsicStrength`, and win-probability, in a shape the UI preview panel (§4) can
  render directly.
- `resolveCityAssault(attacker: Unit, intrinsicStrength: number, seed: number): { attackerWins: boolean }`
  — the win/lose determination only, reusing the same strength-ratio/seeded-RNG math
  `resolveCombat` already uses for odds. **Deliberately does not compute damage** — see
  §3, damage is unified with barbarian/pirate counter-fire via one shared,
  strength-ratio-aware formula. No veterancy, no rewards, no unit death bookkeeping — a
  city isn't a kill.

**Integration** (`city-capture-system.ts`, `beginMajorCityAssault`): applies **only**
when the assault has no preceding combat — i.e., the city was already undefended before
this action, not the "defeated the garrison in a real fight, now advancing into the
vacated tile" path. That second path already resolved a complete, walls-boosted combat
exchange against the garrison unit (via the existing `calculateCombatStrengths` +
`getCityDefenseBreakdown` machinery) in the same turn; running a *second*,
independent intrinsic-strength check immediately afterward would double-punish the
attacker for the same city in the same action. Concretely: only the branch that today
has no `precedingCombat` and no occupying unit gets this new resolution step; the
`precedingCombat`-driven advance is untouched, byte-for-byte.

For that undefended-from-the-start case, call `resolveCityAssault` before proceeding.
**Regardless of outcome**, the attacker takes counter-fire damage (§3) if the city has
walls — storming a walled city costs the attacker something even on a successful
capture, not just on failure, mirroring how a winning unit in normal combat still takes
proportional counter-damage from a defender capable of striking back.
- **Attacker wins** → proceeds exactly as today (unchanged raze/occupy-disposition
  flow), after applying counter-fire damage to the attacker.
- **Attacker loses** → new failure reason `'repelled-by-city-defense'`. The attacker
  takes counter-fire damage and has `hasActed`/`movementPointsLeft` consumed (mirrors a
  normal failed attack) but does **not** advance into the city tile. The city remains
  owned by the defender, available for another attempt (by this or another unit) on a
  future turn.

## 3. Ranged counter-fire

New `getCityCounterFireDamage(city: City, ownerCiv: Civilization, attackerDomain: 'land' | 'naval' | 'air', attackerStrength: number, seed: number): number`
in `city-siege-system.ts`. Returns `0` if the city has no `walls` building (the issue's
literal "once walls exist" gate — stricter than intrinsic strength's always-on
population baseline) or if the city has a garrison (decision 3).

**Damage must scale with the strength ratio, not be a flat fraction of intrinsic
strength** — this was the design's original flaw, caught in review: `resolveCombat`'s
own counter-damage to an attacker is `baseDamage * (1 - adjustedRatio)`, so a much
stronger attacker already takes proportionally *less* retaliation there. A flat
"20% of intrinsic strength" counter-fire would ignore that convention entirely, making
an overwhelming attacker sting exactly as much as a marginal one — inconsistent with
how every other counter-attack in this game already feels. Fixed formula: compute
`adjustedRatio` from `attackerStrength` vs. `intrinsicStrength` using the same
seeded-RNG ±20% randomness `resolveCombat` uses, then
`counterFireDamage = Math.round(baseDamage * (1 - adjustedRatio))`, reusing
`resolveCombat`'s existing `baseDamage` era-scaling curve so the numbers stay in the
same range as real unit combat.

**Three call sites, one shared helper:**
- **Player capture** (`city-capture-system.ts`): applied unconditionally (win or lose)
  to the attacker alongside the separate `resolveCityAssault` win/lose check — see §2.
  `attackerStrength` here is the same value `calculateCityAssaultStrengths` already
  computed for the preview, so the preview's shown odds and the actual damage taken are
  never inconsistent with each other.
- **Barbarian siege** (`turn-manager.ts`, the barbarian city-attack loop): after
  `resolveCitySiegeDamage` for an order where `!hasGarrison`, call
  `getCityCounterFireDamage` (with the attacking barbarian unit's
  `UNIT_DEFINITIONS[...].strength`) and apply it to `order.attackerUnitId`'s unit. If
  this reduces the unit's health to 0, simply remove it from `state.units` and the
  owner's unit roster — **verified safe with no further cleanup**:
  `barbarianHomeCampByUnitId` (`barbarian-system.ts:288-292`) already self-prunes any
  entry whose unit no longer exists on every processing pass, so a counter-fire kill
  needs no special-cased bookkeeping beyond the standard unit removal.
- **Pirate siege** (`pirate-system.ts`, the siege-application loop): same pattern,
  applied to one ship from the besieging faction (nearest-to-city among
  `faction.shipIds`, tie-broken by id for determinism) after `resolveCitySiegeDamage`.
  **Also verified safe**: `pirate-system.ts:114`'s `shipIds: faction.shipIds.filter(unitId => Boolean(state.units[unitId]))`
  already prunes dead ship references every round — a counter-fire kill is just a
  normal unit removal. A well-defended city can now sink a besieging ship over multiple
  rounds — a new, symmetrical consequence; today barbarian/pirate sieges deal one-way
  damage with zero risk to the attacker.

**SFX:** no new cue. The existing player-capture call site already plays `SFX.combat()`
(`main.ts:804`) for a city-related attack, matching how normal unit combat uses one
generic sound for both win and loss outcomes — extending the same call to cover the new
preview-confirmed assault (§4) is consistent with that convention, not a gap.

## 4. UI

**Preview panel for `'assault-city'` tap intent** (`main.ts`): currently resolves
immediately with no confirmation, because there was nothing to preview. New behavior
mirrors the adjacent unit-attack tap-intent branch exactly: build a preview panel via
`calculateCityAssaultStrengths` (odds, intrinsic-strength breakdown reusing
`formatCombatPreviewDetails`'s `cityDefense.parts` rendering convention from
`combat-preview.ts`), with `createGameButton` Attack/Cancel buttons. `beginPlayerCityAssault`
is only called after the player confirms — satisfying the project's standing "show
expected outcome before committing to an attack" rule (`.claude/rules/strategy-game-mechanics.md`),
which a silent-resolve exception would have violated.

On loss: a notification explains the repulsion (mirrors existing combat-failure
notification conventions) and the attacking unit's updated HP is reflected immediately
in its selected-unit panel. On win: the existing raze/occupy disposition panel opens,
unchanged.

**Defender-side visibility (gap found in review).** The preview panel above only helps
the *attacker*. Today there is no UI surface at all showing a city's own defense rating
to its owner — a defensive/builder-playstyle player who never initiates an attack has
no way to check "is my capital actually protected?" before deciding whether to build
Walls or station a garrison. `city-panel.ts` already has a status-label area (lines
653–654, the "🩹 Recovering" / "⚔️ Under siege" HP text added in #549) that is the
natural home for this. Add an intrinsic-strength readout there (e.g., "🛡️ Defense: 47"
or a qualitative band) for every owned city, not just ones under active attack — a
static informational line, not conditional on siege state.

## 5. Scope guard

- **Major-civ cities only.** Minor-civ (city-state) conquest (`conquestMinorCiv`) is a
  separate, pre-existing system — not touched.
- **Hot-seat / actor parity:** the same `resolveCityAssault`/`getCityCounterFireDamage`
  helpers serve the human-player path, the AI-major-civ path (`ai-major-turn.ts`, which
  already calls `beginMajorCityAssault`), and barbarian/pirate paths identically — no
  actor-specific branching in the core resolution logic.
- **Difficulty:** no new difficulty knob. Intrinsic strength and counter-fire scale
  purely from population/buildings/techs, which already vary by how well a given
  civ (human or AI, on any difficulty) has developed — consistent with how
  `citySiegeDestructionEra` is the only existing difficulty lever for city survival,
  left untouched here. Verified this is consistent with the rest of `OpponentChallenge`:
  it never scales raw combat math anywhere today (only AI behavior parameters and
  `citySiegeDestructionEra`), so a new knob here would be the inconsistent choice, not
  the missing one.
- **AI capture scoring must change (real gap found in review, not just a "works as-is"
  extension).** `ai-tactics.ts`'s `rankCapture` currently scores *any* reachable
  undefended-city capture with a flat priority of `600` — zero win-probability
  awareness, because today capture is unconditionally guaranteed. Left as-is, the AI
  would blindly send units to die against a strongly walled, high-population city with
  no way to distinguish that from a free capture — a real behavioral regression, not a
  neutral no-op. `rankCapture` must weight its score by the same win-probability
  `calculateCityAssaultStrengths` computes for the player preview, so the AI
  deprioritizes (not necessarily refuses) a bad assault the way a reasonable player
  would after seeing low odds in the preview panel.
- **Barbarian/pirate target selection is intentionally left as-is.** Their attack-order
  generation (`barbarian-system.ts`, `pirate-behavior.ts`) does not evaluate
  counter-fire risk before choosing a target. This is an accepted, lower-severity
  choice: barbarians and pirates are aggression-first "dumb" AI by design, and taking
  some losses to a walled city's counter-fire is consistent with the risk profile they
  already have attacking a garrison. Not required for this MR; a future refinement
  could teach them to prefer weaker targets, same as any other AI-improvement pass.

## 6. Testing (TDD)

- **`getCityIntrinsicStrength`:** population scaling, walls/Star Fort/Fortification
  Engineering/Professional Army/Torpedo-Warfare-vs-naval all apply identically to how
  they already apply to a garrison unit (parity test against
  `getCityDefenseBreakdown`'s existing coverage); zero-population edge case; naval vs.
  land attacker domain difference.
- **`calculateCityAssaultStrengths` / `resolveCityAssault`:** odds are deterministic
  given a seed; a strong attacker vs. a weak (unwalled, low-population) city wins
  reliably; a weak attacker vs. a strong (walled, high-population, teched) city loses
  reliably. `resolveCityAssault` returns only `attackerWins` — no damage assertions
  belong on this function; damage is `getCityCounterFireDamage`'s responsibility (see
  below) and is unconditional on win/lose.
- **`beginMajorCityAssault` integration:** both outcomes of an ungarrisoned-walled
  assault (win → existing disposition flow fires unchanged, attacker still takes
  counter-fire damage; lose → `'repelled-by-city-defense'`, city still owned by
  defender, attacker takes the same counter-fire damage and is action-consumed, no
  disposition panel). A regression asserting the counter-fire damage amount, for a
  *fixed* attacker/city strength pair, is identical whether the attacker wins or loses
  (proves "unconditional" isn't just documentation). **A dedicated regression for the
  double-punishment fix**: construct a `precedingCombat`-driven advance into a
  now-vacated city and assert `resolveCityAssault`/counter-fire is never invoked for
  that path — only the garrison combat's own damage applies, nothing additional. Garrisoned-city
  path (the `'city-defended'` failure branch) is a byte-for-byte regression otherwise
  (this spec must not change its behavior at all).
- **`getCityCounterFireDamage`:** zero without walls; zero with a garrison present;
  nonzero and walls/tech-scaled otherwise; **scales inversely with attacker strength**
  — a much-stronger attacker takes measurably less counter-fire than a marginal one
  against the identical city (the review fix — this is the regression that would catch
  a regression back to the flat-fraction formula); a lethal counter-fire regression per
  attacker path (barbarian raider dies from counter-fire and is removed from
  `state.units` + owner roster, verified `barbarianHomeCampByUnitId` has no stale entry
  after the next processing pass; pirate ship dies and is removed from
  `faction.shipIds` + `state.units`, verified via the existing self-pruning filter).
- **Balance sampling:** across eras 1–12, an unwalled, low-population ungarrisoned city
  (an early outpost, the most common early-game capture target) must reliably favor an
  era-appropriate attacker — strongly, not a coin-flip — since today that capture is
  100% guaranteed and this spec must not turn routine early expansion into a frequent
  failure. A walled, high-population, fully-teched city should meaningfully raise
  attacker losses without becoming uncapturable by an era-appropriate siege force. If
  the proposed `CITY_BASE_STRENGTH`/`CITY_STRENGTH_PER_POPULATION` constants (§1) fail
  either bound, adjust them — they are provisional, not fixed by this spec. Mirrors the
  existing `tests/systems/pacing-audit.test.ts` outlier-gate philosophy — this is
  exactly the kind of change that rule requires a full-catalog pass for, since it
  changes combat math globally.
- **Hot-seat / actor parity:** one regression proving the human-player capture path and
  one proving the AI-major-civ capture path (`ai-major-turn.ts`) both route through the
  same `resolveCityAssault`, with identical win/loss semantics.
- **AI capture scoring (`ai-tactics.ts` `rankCapture`):** a regression proving a
  low-odds assault (heavily walled, high-population, teched city) scores lower than a
  high-odds one for the same unit — the flat-`600` regression this fix replaces. Assert
  the AI still *attempts* a low-odds capture when it's the only available action (never
  refuses outright, only deprioritizes) so a cornered AI doesn't do nothing.
- **UI click-through:** the new preview panel renders odds text and Attack/Cancel
  buttons for an `'assault-city'` tap intent; clicking Attack (not just tapping the
  city) is what triggers `beginPlayerCityAssault`; Cancel deselects without consuming
  the unit's action.
- **Defender-side city-panel display:** the new defense-rating line renders for every
  owned city (not just ones under siege), and updates when a relevant building/tech
  changes (walls built, Star Fort completed) — a stale reading would defeat the purpose
  of adding it.

## Out of scope

- Minor-civ (city-state) capture (`conquestMinorCiv`) — separate, untouched system.
- Any change to the barbarian/pirate `city.hp` multi-turn siege-attrition model itself
  (regen rate, sack/destroy gating, last-city guarantee) — that shipped in #549/#556 and
  is not being revisited here. This spec only adds counter-fire *on top of* that
  existing resolution.
- A player-triggered "bombard the besieger" city action — counter-fire is automatic,
  not a new player-facing verb (decision 3).
- New difficulty knobs for intrinsic strength or counter-fire.
