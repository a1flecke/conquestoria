# Combat Retaliation Fix + City Siege Overhaul — Design

Issues: #537 (counter-attack rule matrix), #522 (flat-damage city sieges), part of the
battle-mechanics arc (#546).

## 1. Counter-attack fix (#537)

**Scope, after working through the four findings against the desired behavior:** the
existing distance-based retaliation check in `canCounterAttackAtDistance`
(`src/systems/combat-system.ts:206`) is correct and unchanged. It already produces the
right outcome for every case:

- L1 (archer attacks adjacent melee warrior): warrior's `kind === 'melee'` and
  `distance <= 1` → retaliates. **Kept as-is** — a melee unit that gets closed on
  should be able to swing back regardless of what attacked it.
- L3 (two ranged units trade at range): unchanged, matches current behavior.
- Any attacker outranging a numeric-range defender already fails the existing
  `defenderProfile.range >= distance` check, because an attacker can never attack from
  farther than its own range — so a defender that's outranged at max range already
  gets no retaliation today. Closing the distance (e.g. a bombard-range-2 unit
  attacking a ranged-range-1 defender from 1 hex away) already lets the defender
  reach back under the existing distance check, and that's the desired behavior — a
  unit that's attacked at point-blank range should be able to hit back.

**Real fix — L2 and L4, one shared mechanism:** add a defense-strength penalty for
`bombard`-kind units when they are the defender in `calculateCombatStrengths`
(`src/systems/combat-system.ts`):

```
if (UNIT_DEFINITIONS[defender.type].attackProfile?.kind === 'bombard') {
  defenderStrength *= 0.5;
}
```

Applied to `defenderStrength` before the ratio that drives both `defenderDamage` and
`attackerDamage`, so a bombard-kind defender both takes more damage and deals less
counter-damage — matching the classic "siege is terrible on defense" convention.

This set is `catapult`, `cannon`, `artillery`, `grenadier`, `bomber`, `stealth_bomber`
(everything whose `attackProfile.kind === 'bombard'`). Deliberately **not** keyed off
the `siege` `UnitClass` tag, because that tag includes `ballista` (kind `ranged`,
more agile — no penalty) and excludes `bomber`/`stealth_bomber` (which do need it).
This directly answers "should bombers be siege weapons in the air": mechanically,
yes, via the shared `bombard` kind, not via reusing the ground-only `siege` class
(which also drives `NP_PRODUCTION_DISCOUNTS` and other ground-specific bonuses that
shouldn't apply to bombers).

Net effect on the two flagged bugs:
- **L4** (catapult defends at full strength): now takes 2x damage and deals half
  counter-damage when defending — no longer "defends like a spear line."
- **L2** (bomber counter-intercepts a fighter at full bombard strength): still CAN
  retaliate (its bombard range 3 covers the fighter's ranged range 2), but at half
  strength, combined with the existing Interceptor class-counter
  (`CLASS_COUNTERS` in `unit-modifier-definitions.ts`, ×1.5 for `jet_fighter`/`biplane`
  vs `bomber`) that already favors the fighter. A shot-down bomber still gets one
  weak "spraying fire on the way down" hit back — not a full-strength exchange, not
  zero. No new attack-kind-vs-attack-kind special case needed.

No changes needed to the combat preview UI text (`src/ui/combat-preview.ts`) beyond
what already surfaces via `defenderModifierParts` — this new penalty is a baseline
rule (not tech/national-project-sourced), so it's surfaced as a new
`CombatStrengthBreakdown` part alongside terrain/river, not through the modifier-parts
list. Add one line: `"Siege defends poorly (−50%)"` when applicable.

## Deviation from #522 as written: the pirate half is stale

The issue's code map cites `threat-pressure-system.ts:770-783` (`processPirateFleets`,
`state.pirateFleets`, `threat:pirate-*` events) as the live pirate-siege path. It is
not — `tests/systems/pirate-end-to-end.test.ts`'s "pirate feature completion gate"
explicitly asserts `main.ts` never wires a `bus.on('threat:pirate-'` listener and
`turn-manager.ts` never calls `processPirateFleets(`, confirming this fleet/siege
model was deliberately retired in favor of the newer faction-based system
(`pirate-system.ts` / `pirate-actions.ts`: headquarters, tribute, contracts,
notoriety). That live system has **no city-HP-damage mechanic at all** — a pirate
"raid" against a city today only affects contract/exposure bookkeeping, never
`city.hp`. So there is no live pirate city-siege bug to fix; #522's pirate half
describes code that no longer runs. This MR implements the garrison/mitigation/
sack-vs-destroy/regen fix for the barbarian path only, since that's the only live
city-siege-HP source. Whether pirates should gain an equivalent HP-damage mechanic
under the new faction system is a separate design question, not a bug fix — flagged
as a follow-up rather than decided here.

## 2. City siege overhaul (#522)

### Garrison blocking (full block)

Barbarian and pirate city-siege damage currently applies unconditionally, ignoring any
defending unit garrisoned on the city tile. New shared helper,
`resolveCitySiegeDamage` in a new file `src/systems/city-siege-system.ts`:

```ts
export interface CitySiegeInput {
  city: City;
  ownerCiv: Civilization;
  rawDamage: number;
  attackerDomain: 'land' | 'naval' | 'air';
  hasGarrison: boolean;
  era: number;
}

export interface CitySiegeResult {
  hpLost: number;          // 0 if blocked by garrison
  newHp: number;
  outcome: 'blocked' | 'damaged' | 'sacked' | 'destroyed';
}
```

- `hasGarrison` (a unit with `owner === city.owner` occupying `city.position`) → fully
  blocks the damage (`outcome: 'blocked'`, `hpLost: 0`). This matches
  `beginMajorCityAssault`'s existing rule that a defended city tile can't be taken —
  city HP damage is the barbarian/pirate equivalent of capture, so it gets the same
  gate.
- Otherwise, damage is mitigated through the existing `getCityDefenseBreakdown` (walls
  / Star Fort / Fortification Engineering / Professional Army / Torpedo Warfare):
  `mitigatedDamage = Math.round(rawDamage / breakdown.multiplier)`. Only the
  multiplier is reused (not `flatBonus`, which is tuned for unit-strength points, not
  flat siege HP — reusing it here would need a second, differently-scaled constant
  table for no real benefit).
- Since damage is only ever applied when `hasGarrison` is false, HP can only reach 0
  on an undefended city — "destroy only if ungarrisoned" from the issue is
  automatically satisfied by the block rule, no extra check needed.

### Barbarian targeting: attack the garrison first

`processPurposefulBarbarians`' city-attack branch
(`src/systems/barbarian-system.ts:498-501`) needs to check for a garrison before
queuing a city-damage order. If a garrison unit is present, redirect to a normal
unit-attack order against it instead. If the city is undefended, proceed with the
siege-damage order as before, now routed through `resolveCitySiegeDamage`.

### Zero-HP outcome: difficulty- and era-gated

At 0 HP, whether the city is destroyed or merely "sacked" depends on the human owner's
resolved `OpponentChallenge` (`resolveChallengeForCiv`, `src/core/opponent-challenge.ts`)
and the current era — mirroring the existing `crisisGraceMaxEra` pattern (a punishing
mechanic gated by a per-difficulty era threshold). New field on
`OpponentChallengeProfile`: `citySiegeDestructionEra`. Destruction is possible once
`state.era > citySiegeDestructionEra` for that civ's resolved challenge:

| Challenge  | `citySiegeDestructionEra` | Destruction possible from |
|---|---|---|
| `explorer` (easiest) | 3 | era 4+ |
| `standard` (medium)  | 2 | era 3+ |
| `veteran` (hardest)  | 1 | era 2+ |

- Below the threshold (or always, for AI-owned cities using `resolveOpponentChallenge`
  at the table default): **sacked**, not destroyed. HP floors at 1 (never 0), a
  one-time gold plunder applies (`Math.round(ownerCiv.gold * 0.15)`, same style as the
  existing pirate plunder calc), and the city immediately starts regenerating (below).
- At/above the threshold: existing destruction path (city removed from `state.cities`
  and the owner's `civilizations[id].cities`), unchanged from current
  `turn-manager.ts` logic, just routed through the shared helper's `outcome:
  'destroyed'` branch instead of being duplicated per-source.
- `city:sacked { cityId, source: 'barbarian' | 'pirate', goldLost }` is a new shared
  event, with `source` typed to include `'pirate'` for forward-compat even though only
  `'barbarian'` is ever emitted today (see deviation note above). Fired instead of
  `barbarian:city-destroyed` when the era/difficulty threshold isn't met; the existing
  `barbarian:city-attacked`/`barbarian:city-destroyed` events are kept as-is, now
  driven by the shared helper's `outcome` instead of duplicated inline logic.

### HP regeneration

New per-turn step in `turn-manager.ts` (alongside existing per-city turn processing):
+5 HP/turn (same rate as `HEAL_PASSIVE` for units, for consistency) when no hostile
unit is within 1 hex of the city (hostile = barbarian, or a unit whose owner is at war
with the city's owner, via `isAlwaysHostilePair`/`isAtWar`). Capped at 100.

### UI surfacing

- `city-panel.ts`'s HP display (`city.hp ?? 100`) gets a `Recovering — X/100 HP
  (+5/turn)` / `Under siege — X/100 HP (no regen)` label depending on hostile
  adjacency (`isCityHpRegenerating`), consistent with the "HUD shows per-turn rates,
  not just totals" rule.
- `main.ts` notification wiring: add a `city:sacked` listener phrased distinctly from
  straight damage ("X was sacked — survives at 1 HP" vs "X was destroyed") so a
  losing-a-city moment is never confused with a scarier-but-recoverable one.

## Save compatibility

`City.hp` is already optional (`hp?: number`, defaults to 100 via `?? 100`) — no
migration needed. The new `citySiegeDestructionEra` field lives on the existing
`OpponentChallengeProfile` const table, not on saved state, so no migration needed
there either.

## Testing

- `combat-system.test.ts`: bombard-kind defense penalty — catapult vs melee attacker
  (L4 regression), bomber vs jet_fighter (L2 regression, verify reduced but nonzero
  counter-damage), ballista unaffected (control), non-bombard units unaffected
  (control).
- New `city-siege-system.test.ts`: garrison fully blocks damage; walls/Star Fort
  mitigate via the multiplier; sack vs destroy branches by era/challenge; gold
  plunder amount; HP floors at 1 on sack, removed from state on destroy; HP
  regeneration and its hostile-adjacency gate; `isCityHpRegenerating`.
- `barbarian-system.test.ts`: garrisoned city is attacked as a unit target, not a
  city-damage target; undefended city still takes siege damage (regression).
- `city-panel.test.ts`: recovering vs under-siege HP status label.
