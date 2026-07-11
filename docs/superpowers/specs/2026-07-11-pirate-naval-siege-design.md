# Pirate Naval Siege — Design (#522 pirate half)

Issue: #522 (flat-damage city sieges bypass garrison/walls, destroy cities permanently,
and city HP never recovers). The **barbarian half** of #522 shipped in #549
(`src/systems/city-siege-system.ts`): garrisons fully block city-HP damage, walls/techs
mitigate, 0-HP outcome is sack-vs-destroy gated by era + difficulty
(`citySiegeDestructionEra`), and cities regenerate +5 HP/turn when no hostile is adjacent.

This spec closes the **pirate half**, which #549 deliberately left open as a design
question rather than a bug fix. It lets #522 finally close.

## Background — what's already true (verified @ 82a91960)

- The pirate-siege code the original issue cited (`threat-pressure-system.ts`'s
  `processPirateFleets` / `PirateFleet` / `threat:pirate-*`) is **dead code** — never
  called from `src/`, no `threat:pirate-*` listeners exist, and
  `tests/systems/pirate-end-to-end.test.ts`'s completion gate asserts it stays dead. Do
  not revive it.
- The **live** pirate system is faction-based (`pirate-system.ts`, `pirate-behavior.ts`,
  `pirate-definitions.ts`, `pirate-ecology.ts`). Its behavior ladder is
  `patrolling → raiding → blockading`, driven by notoriety thresholds
  (`PIRATE_NOTORIETY` in `pirate-definitions.ts`) and a `maritimeStage` (0–5, era-driven,
  `pirate-ecology.ts`).
- Today a pirate **raid** against an adjacent coastal city steals gold
  (`PIRATE_PLUNDER_CAP[maritimeStage]`, capped at the victim's treasury;
  `derivePirateRaids`, `pirate-behavior.ts:581`) and records contract/exposure
  bookkeeping. A **blockade** flags the city economically
  (`derivePirateBlockades`, `pirate-behavior.ts:613`, gated `blockading` behavior +
  `maritimeStage >= 2`). **Neither touches `city.hp`.** The live pirate system has no
  city-HP-damage mechanic at all.
- The #549 helpers in `city-siege-system.ts` already accept `attackerDomain: 'naval'`
  and are fully generic — `getCityDefenseBreakdown` differentiates defense by attacker
  domain. They were built to be reused by exactly this path.

## Design decisions (resolved in brainstorming)

1. **Full siege parity** — pirates can grind a coastal city to 0 HP and ultimately
   **raze** it, using the same era + difficulty destruction gate as barbarians.
2. **A distinct fourth pirate action** — siege is its own apex behavior tier, not folded
   into raid or blockade.
3. **Blockade-first escalation** — a blockade must persist for N turns against a specific
   city before that city can be besieged, giving a telegraphed, counterable warning
   window (directly serving #522's "threats must be visible and counterable" intent).

## 1. Behavior ladder — new `besieging` apex tier

Extend `PirateBehavior` (`src/core/pirate-state.ts`): `patrolling → raiding → blockading
→ besieging`. Add a `PIRATE_NOTORIETY.besieging` threshold above `blockading` in
`pirate-definitions.ts`, and teach `advanceBehavior` (`pirate-system.ts:563`) to promote
a faction to `besieging` when its notoriety crosses that threshold — the same rising-
notoriety curve players already learn, no new escalation mechanic.

**Save-compat:** `besieging` is a new enum value. Existing saved factions keep their
current behavior (they simply never had it); no migration needed. Add a save-load
regression asserting an old pirate save deserializes with sane defaults.

## 2. Blockade-first on-ramp (the warning window)

Add per-(faction, city) consecutive-blockade tracking to pirate state:
`blockadeStreakByCity: Record<PirateFactionId, Record<cityId, number>>` (on
`state.pirates`).

- Incremented each round a faction blockades a given city, in the existing blockade
  resolution path (`pirate-system.ts` ~line 771, where `derivePirateBlockades` results
  are applied).
- **Reset to 0 the moment the blockade breaks** for that (faction, city): ship no longer
  adjacent, city becomes garrisoned, faction de-escalates below `blockading`, or the city
  is no longer an eligible victim. Reset must be exhaustive — a stale non-zero streak that
  survives a broken blockade would let a siege resume with no visible blockade, defeating
  the warning window.
- A faction may only besiege a **specific** city it has continuously blockaded for
  **N = 3 turns** (`PIRATE_SIEGE_BLOCKADE_TURNS = 3`). Blockade is the telegraph; siege is
  the follow-through.

**Save-compat:** `blockadeStreakByCity` defaults to `{}` on old saves.

## 3. Siege resolution — reuse #549 wholesale

Add `derivePirateSieges(state)` in `pirate-behavior.ts` (sibling to `derivePirateRaids` /
`derivePirateBlockades`), returning the (faction, city, rawDamage) tuples that qualify:

- faction `behavior === 'besieging'`,
- faction `maritimeStage >= PIRATE_SIEGE_MIN_STAGE` (recommend **3** — siege is the
  high-stage apex; below it a `besieging` faction still only blockades),
- a ship of the faction adjacent (`distance === 1`) to an eligible-victim coastal city,
- `blockadeStreakByCity[factionId][cityId] >= PIRATE_SIEGE_BLOCKADE_TURNS`.

Apply each in `pirate-system.ts`'s round processing by routing through the existing
`city-siege-system.ts` helpers — **no new siege math**:

```
const result = resolveCitySiegeDamage({
  city, ownerCiv,
  rawDamage: PIRATE_SIEGE_DAMAGE[faction.maritimeStage],
  attackerDomain: 'naval',
  hasGarrison: getCityGarrisonUnit(state.units, city) !== undefined,
  era: state.era,
  challenge: resolveChallengeForCiv(state, city.owner),
});
state = applyCitySiegeOutcome(state, cityId, result);
```

- **Garrison fully blocks** — a land unit in the city stops the naval bombardment. Kept
  **identical** to the barbarian rule rather than inventing a naval-only defense, so the
  player has exactly one city-defense rule to learn ("keep a defender home").
- **Walls / Star Fort / defensive techs mitigate** via
  `getCityDefenseBreakdown(attackerDomain: 'naval')` — already domain-aware.
- **0 HP → sack** (plunder 15% gold, survive at 1 HP) when `era <= citySiegeDestructionEra`,
  else **destroy** — the same per-difficulty knob barbarians use, no new gating.
- Raw damage scales by maritime stage: new
  `PIRATE_SIEGE_DAMAGE = [0, 0, 0, 8, 12, 16]` (indexed by stage 0–5; `0` below the stage
  floor so an under-stage `besieging` faction deals nothing). Exact values tuned via
  balance-sampling tests — early exchanges should feel like a multi-turn siege a prepared
  player survives, not a one-shot.

## 4. Counterplay (all already-taught levers, no new player verbs)

- **Garrison the city** → full block (identical to barbarians).
- **Sink the besieging fleet** with your navy → removes adjacency → siege stops and HP
  regen resumes automatically. Pirates are already `isAlwaysHostilePair`, so #549's
  `isCityHpRegenerating` hostile-adjacency gate needs **zero change** — the day no pirate
  is within 1 hex, the city regens +5/turn.
- **Break the blockade before turn 3** → resets the streak, no siege.
- **Existing tribute / notoriety de-escalation** → drop the faction below `besieging`.

## 5. Visibility (issue point 4 — loud + on-map)

- **Loud one-time alert** the turn HP first falls on a city: a "City under naval siege!"
  notification through the existing pirate notification/intel pipeline
  (`applyPirateNotifications`). Distinct from the quieter raid/blockade sightings.
- **`city:sacked`** fires with `source: 'pirate'` — the event is already parametrized by
  source (barbarians pass `'barbarian'`), so this is a value, not a new event.
- **Pirate city-destruction notification** mirroring `barbarian:city-destroyed`
  (`pirate:city-destroyed` or a shared `city:destroyed` with source) so a razed city is
  never silent.
- **Map indicator** for under-siege / falling-HP state — the city panel already shows the
  "Under siege (no regen)" vs "Recovering (+5/turn)" label from #549; the remaining gap is
  an **on-map badge** so the player sees it without opening the panel. This is the one
  genuinely new UI surface.

## 6. Guards & parity

- **AI civ cities are eligible victims** too (same `isEligibleVictim` as raid/blockade),
  so pirates can besiege and raze AI cities as well — required for parity and for the
  threat to feel real in the world, not player-only.
- **Last-city guard:** whether pirates can destroy a civ's *final* city (eliminating the
  civ) must **mirror whatever the barbarian path already does** — verify
  `city-siege-system.ts` / `turn-manager.ts`'s barbarian destroy branch first. If
  barbarians can't eliminate a civ by razing its last city, pirates must not either
  (downgrade to sack); if they can, match for parity. Do **not** invent a new rule here —
  the two siege sources must agree. (Implementation detail to verify against real code,
  per spec-fidelity: specs can be stale.)
- **Diplomacy cascade:** if a pirate razing an AI city's last city can eliminate the civ,
  confirm the elimination path scrubs `relationships` / `atWarWith` / treaties the same
  way the barbarian path does (game-systems "Diplomacy Lifecycle" rule).

## 7. Testing (TDD)

- **Blockade streak:** accrues each blockaded round; resets on ship-leaves, on
  garrison-appears, on de-escalation, on victim-ineligible (one negative test per reset
  cause — spec-fidelity: prove each condition matters).
- **Escalation gate:** siege fires only when `behavior === 'besieging'` AND
  `maritimeStage >= PIRATE_SIEGE_MIN_STAGE` AND streak `>= N` — negative test for each
  factor missing (A-without-B / B-without-A, per spec-fidelity conjunction rule).
- **Siege damage (naval domain):** garrison fully blocks; walls/Star Fort mitigate;
  sack-vs-destroy by era × difficulty (reuse the barbarian test matrix with
  `attackerDomain: 'naval'`).
- **Regen resumes** the round the besieging fleet leaves / is sunk.
- **Visibility:** one-time siege alert fires exactly once on the falling-HP transition and
  does not recur from steady-state scans (end-to-end-wiring "transition-owned" rule);
  `city:sacked` carries `source: 'pirate'`; destruction notification fires; on-map badge
  renders for an under-siege city (assert the DOM/render output, per spec-fidelity UI
  contract rule).
- **Balance sampling:** across stages 3–5 and representative eras, a prepared (walled +
  garrisoned) city is effectively safe, and an undefended coastal city falls over a
  multi-turn window, not instantly.
- **Save-compat:** an old pirate save loads with `blockadeStreakByCity = {}` and no
  faction stuck in an invalid behavior.
- **Actor parity:** a non-player civ's city can be besieged/sacked/destroyed by the same
  path (end-to-end-wiring "shared state mutations must be actor-complete").

## Out of scope

- The larger "make the city a real combat entity" unification the issue's second comment
  floated (intrinsic city strength, city ranged strike, routing the player capture path
  through the same model). #549 built a lightweight HP model that both barbarians and now
  pirates share; a full combat-entity refactor is a separate arc, not required to close
  #522.
- Reviving or repurposing `threat-pressure-system.ts`'s dead pirate-fleet code.
