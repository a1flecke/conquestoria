# Crisis Events & Revolutionary Movements — Design

**Date:** 2026-07-09
**Issues:** [#381](https://github.com/a1flecke/conquestoria/issues/381) (mid-game crisis events), [#354](https://github.com/a1flecke/conquestoria/issues/354) (revolutionary movements)
**Status:** Approved design, pre-implementation

## Goals

- Fill the mid-game "quiet window" with internal drama (crises) and give sustained
  unhappiness a dramatic arc (revolutions) — excitement and risk without pile-ons.
- Fun and fair for a family hotseat table spanning ages 7, 10, 12, and 43: each
  player faces pressure scaled to their **own** challenge level.
- History-grounded flavor (plagues, eruptions, famines named per era) with
  deliberate fantasy play (beast hunts) — geography determines which crises you
  can face.
- Works in hotseat and solo, loads old saves untouched, runs on both PWA clients
  (DOM panels + existing canvas markers only).

## Key Decisions (made during brainstorm)

1. **Unify, don't parallel.** #354's revolutions extend the existing faction
   unrest system (`unrestLevel`/`unrestTurns` in `src/systems/faction-system.ts`)
   with contagion and concession — **no second 0–100 unrest score** (the issue's
   data model predates the faction system and is superseded). #381's "Rebellious
   Province" crisis type is dropped: the faction/uprising arc *is* that mechanic.
2. **Per-player challenge in hotseat.** New optional `challenge?: OpponentChallenge`
   on human `Civilization`; resolution order `civ.challenge ?? state.opponentChallenge
   ?? 'standard'`. Old saves inherit the game-wide setting automatically.
3. **Permanence scales by challenge, not era alone.** Explorer: everything
   auto-recovers. Standard: losses permanent only if the player ignores the crisis;
   always preventable. Veteran: era 3+ crises can cost improvements/population even
   with a good response (mitigate, not prevent).
4. **Archetypes × flavors** to kill rinse-and-repeat: 4 mechanical archetypes,
   each with a distinct response verb; many data-driven flavors inside each.
5. **Anti-pile-on guarantee:** active uprisings count toward the same per-player
   crisis cap as scheduled crises (`maxIndependentCrisesPerHuman`).

## Architecture: Archetypes × Flavors

| Archetype | Verb | Shape | Owner | Example flavors |
|---|---|---|---|---|
| **Outbreak** | Contain it | Per-turn attrition, spreads to neighbor cities, stopped by response actions | `crisis-system.ts` (new) | Plague (swamp/jungle-boosted), Crop Blight, Locust Swarm (plains), Red Tide (coastal) |
| **Catastrophe** | Recover from it | One-turn shock + aftermath repair window with resilience reward | `crisis-system.ts` (new) | Volcanic Eruption (volcanic tile ≤3 hexes), Earthquake (mountain/hills), River Flood (river/coast), Wildfire (forest), Harsh Winter (tundra/snow) |
| **Hunt** | Fight it | Named foe spawns near borders; military resolution; reuses beast/pirate/barbarian machinery | `crisis-system.ts` schedules; existing systems execute | Beast Awakening (forest/mountain), Corsair Armada (coastal), Bandit Uprising; foe varies by era + terrain |
| **Uprising** | Win them back | Existing unrest→revolt arc + contagion + ideological concession (issue #354) | `faction-system.ts` (extended) | Revolutionary movement, separatists in conquered cities |

- **Flavors are rows** in a `CRISIS_FLAVORS` table:
  `{ archetype, id, eraBand, geographyPredicate, severityByChallenge,
  displayNamesByEra, advisorLine, responseActions }`. Adding a flavor touches only
  the table (the `NP_PRODUCTION_DISCOUNTS` pattern — no per-id branches in
  resolvers).
- **Hunt flavors parameterize existing spawn paths** (beast/pirate/barbarian) and
  listen for their kill events to resolve. No combat reimplementation; spawn
  occupancy rules apply as-is. Launch uses existing sprites.
- **Variety is enforced:** seeded-RNG flavor selection is weighted against each
  player's `recentCrisisHistory` ring (last 4 flavor ids), so archetypes and
  flavors rotate.
- **Era-flavored naming:** each flavor carries `displayNamesByEra` (era 2 plague =
  "The Sweating Sickness", era 6 = "Cholera Outbreak") so the same row reads as
  history across the game.

## Triggering, Pacing, Difficulty

The scheduler runs inside the threat-pressure system's per-human loop
(`processThreatPressure` in `src/systems/threat-pressure-system.ts`). A crisis may
fire for a player only when their `computeThreatScore` is above a floor **and** no
external threat has engaged them recently — the "pressure floor" role from #381.
The idle-turns factor means crises find the coasting player, not the one mid-war.

Per-player knobs (new fields on `OpponentChallengeProfile` in
`src/core/opponent-challenge.ts`):

| Knob | Explorer | Standard | Veteran |
|---|---|---|---|
| Max simultaneous crises (incl. uprisings) | 1 | 2 | 3 |
| Min turns between crisis onsets | 12 | 8 | 5 |
| Grace period (no crises; era AND turn floor must both pass) | eras 1–2, min 30 turns | era 1, min 20 turns | era 1, min 10 turns |
| Severity multiplier | 0.5× (auto-recovers) | 1.0× | 1.3× (some unpreventable loss era 3+) |

- Era 1 is crisis-free for **everyone**.
- `maxIndependentCrisesPerHuman` already exists in the profile table; grace
  period, cooldown, and severity multiplier are new profile fields.
- Crises target **human players only**, matching threat-pressure's existing scope.
  AI crises are a possible future extension, out of scope.
- Hotseat setup gains a per-player challenge picker; the pause menu challenge
  selector gains per-player rows using the existing `pendingOpponentChallenge`
  "applies next turn" pattern. Solo setup unchanged.
- All randomness via the seeded LCG already used in threat-pressure. Same seed +
  same state = same crisis.

## Archetype Gameplay

### Outbreak — "Contain it"
- Onset: advisor announcement with era-flavored name; afflicted city gets a status
  chip and yield penalty (plague: −food/−production; population tick-down on
  veteran only).
- Spread: each turn, seeded roll to spread to nearest same-owner city; chance
  boosted by flavor-specific geography (swamp/jungle adjacency for plague, plains
  for locusts, coast for red tide).
- Response actions (city-panel buttons, real trade-offs):
  - **Quarantine** — free, instant; stops spread but doubles local yield penalty
    while active.
  - **Remedy effort** — gold scaled to city size; ends the outbreak in that city
    after 2 turns.
  - **Passive resistance** from era-appropriate buildings (aqueduct-type vs
    plague, granary-type vs blight) — rewards infrastructure planning.
- Explorer: outbreaks burn out on their own after 5 turns even if ignored.
  Veteran: ignored outbreaks spread until contained.

### Catastrophe — "Recover from it"
- One shock turn: affected tiles get `devastatedUntilTurn` (yields suppressed);
  improvements in the area are **damaged** (worker-repairable in 1 turn, like the
  pillage-repair loop). Veteran era 3+: the epicenter tile's improvement is
  destroyed outright.
- Recovery window (5 turns): repairing every improvement and issuing rebuild
  orders before it closes earns a small temporary resilience bonus (+happiness or
  +production for a few turns) — cleanup is a rewarded task, not just a loss.
- Strict geography: eruptions require a `volcanic` tile nearby; floods require
  river/coast cities; wildfires require forest clusters; harsh winters require
  tundra/snow. The map advertises your risks.

### Hunt — "Fight it"
- A named foe spawns at a legal hex near (never inside) the player's borders,
  via existing spawn machinery + occupancy rules.
- It menaces — pillages improvements, blockades a coastal city — but does not
  attack cities directly on explorer/standard. On veteran it may assault the
  nearest city if left alive for 5+ turns.
- Kill payout: existing combat-reward path plus a crisis bounty (gold +
  temporary empire-wide happiness: "the beast-slayer's feast").
- Flavor table varies the foe by era and terrain (era 1 dire wolves; era 5
  corsair admiral).

### Uprising — "Win them back" (issue #354)
- **Contagion:** a city at revolt (`unrestLevel === 2`) adds pressure per turn to
  same-owner cities within range; a garrisoned target city is immune to incoming
  spread. City panel shows incoming spread threat.
- **Ideological concession:** new permanent resolution alongside gold appeasement
  — a chosen concession (e.g., reduced tax contribution for an era, or completing
  a civics-branch tech) fully clears the movement and sets
  `concessionImmunityUntilTurn` on the city. Gold appeasement remains the quick
  fix that only suppresses.
- Rebel spawning and breakaway escalation stay exactly as `faction-system.ts` /
  `breakaway-system.ts` already implement — one continuous story.

**Shared rule:** every crisis announcement states what to do about it in plain
words ("Move a soldier into Thebes to stop the spread") — self-explanatory UI per
project rules; it's also what makes a 7-year-old feel challenged, not confused.

## Data Model (all additions optional — old saves load unchanged)

```ts
// Civilization (humans only)
challenge?: OpponentChallenge;
recentCrisisHistory?: string[];        // last 4 flavor ids

// GameState
activeCrises?: Record<string, ActiveCrisis>;

// ActiveCrisis
{ id, flavorId, archetype, targetCivId, cityIds, tileKeys,
  startedTurn, stage, turnsInStage, responseTaken?, huntEntityId? }

// Tile
devastatedUntilTurn?: number;

// City (uprisings otherwise reuse unrestLevel/unrestTurns)
concessionImmunityUntilTurn?: number;
```

`CRISIS_FLAVORS` is code, not state; saves reference flavor ids only, so balance
renumbering never breaks a save. If a save references a removed flavor id, the
crisis is dropped on load (logged, not fatal).

## Events (added to `GameEvents`)

```ts
'crisis:started':   { crisisId, flavorId, civId, cityIds }
'crisis:spread':    { crisisId, fromCityId, toCityId }
'crisis:escalated': { crisisId, stage }
'crisis:response':  { crisisId, civId, action }
'crisis:resolved':  { crisisId, civId, outcome: 'contained' | 'expired' | 'hunted' | 'recovered' | 'abandoned' }
'faction:contagion-spread': { fromCityId, toCityId, owner }
'faction:concession-made':  { cityId, owner, concessionType }
```

Events are notifications: every state mutation happens in the system before the
event fires. All player-facing announcements route through the per-player
notification queue — a player 2 crisis is announced at the start of player 2's
turn, never leaked to whoever holds the device.

## UI Surfaces (both PWA clients; touch-first DOM + canvas markers)

- **City panel:** crisis status chip, response-action buttons (`createGameButton`),
  unrest/incoming-spread indicators.
- **Map:** devastated-tile tint, crisis icon over afflicted cities, named-foe
  banner on hunt entities. Launch reuses existing beast/pirate sprites;
  flavor-specific art later via the sprite pipeline.
- **HUD/notifications:** onset, spread, resolution at owning player's turn start;
  advisor lines for each archetype.

## Testing

- **Scheduler:** grace periods per challenge (both era and turn floors), caps
  counting uprisings, cooldowns, anti-repeat weighting, determinism.
- **Flavor definitions (generic loop over the whole table):** valid era band,
  satisfiable geography predicate, severity entries for all three challenge
  levels, era-name coverage — new rows auto-checked (wonder-content pattern).
- **Per archetype:** outbreak spread/quarantine/remedy; catastrophe damage +
  repair window + resilience bonus; hunt spawn legality + kill bounty; uprising
  contagion blocked by garrison + concession permanence + immunity window.
- **Hotseat:** player-2 crisis never notifies player 1; per-player challenge
  resolution order (`civ.challenge ?? state.opponentChallenge ?? 'standard'`).
- **Saves:** old-save fixture (no crisis fields) loads and plays a turn cleanly;
  save referencing a removed flavor id drops the crisis gracefully.
- **Balance:** crisis yield penalties run through the `pacing-audit` outlier gate
  (they touch the economy).

## Delivery Plan (incremental MRs, each playable alone)

1. **MR1** — scheduler + per-player challenge plumbing (setup UI, pause menu,
   profile fields) + one outbreak flavor (Plague).
2. **MR2** — Catastrophe archetype + eruption/earthquake/flood/wildfire/winter
   flavors.
3. **MR3** — Hunt archetype (beast/corsair/bandit flavors). **Closes #381.**
4. **MR4** — Uprising extension: contagion + concession. **Closes #354.**
5. **MR5** — flavor breadth pass (more outbreak/hunt flavors, era-name fill-in).

## Out of Scope

- AI civs suffering crises (future extension).
- Flavor-specific sprite art (launch reuses existing sprites).
- A full happiness system rework — uprisings reuse the existing pressure model.
