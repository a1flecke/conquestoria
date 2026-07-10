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
5. **Anti-pile-on cap** (see exact semantics under Triggering): scheduled crises
   never push a player past their cap; organic uprisings count toward it.

## Scope of the Per-Player Challenge Field

`civ.challenge` governs **internal-pressure knobs only**: crisis frequency,
severity, grace periods, and uprising contagion rate for that human player.
**AI opponent behavior** (`mobilizationRounds`, `tacticalTopK`, retreat/mistake
knobs, etc.) **remains governed by the game-wide `state.opponentChallenge`** —
per-player challenge never forks how AI civs play, only how hard each human's
own internal pressure hits. This keeps the shared world consistent while letting
each family member tune their personal risk. In **solo games** there is one human,
so the setup picker writes the same value to both `civ.challenge` and
`state.opponentChallenge`; the two are always equivalent there.

## Architecture: Archetypes × Flavors

| Archetype | Verb | Shape | Owner | Example flavors |
|---|---|---|---|---|
| **Outbreak** | Contain it | Per-turn attrition, spreads to same-owner neighbor cities, stopped by response actions | `crisis-system.ts` (new) | Plague (swamp/jungle-boosted), Crop Blight, Locust Swarm (plains), Red Tide (coastal) |
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
- **Target-city selection** (Outbreak/Catastrophe): seeded pick among the target
  player's geography-eligible cities, weighted by population — bigger cities are
  likelier targets, matching both history and drama.

## Triggering, Pacing, Difficulty

The scheduler runs inside the threat-pressure system's per-human loop
(`processThreatPressure` in `src/systems/threat-pressure-system.ts`). A crisis may
fire for a player only when their `computeThreatScore` is at or above
`CRISIS_PRESSURE_FLOOR` (named constant, initial value **2.0**, tuned via the
balance tests) **and** no external threat (pirate spawn, land resurgence) targeted
them within the last 5 turns — the "pressure floor" role from #381. The
idle-turns factor already inside `computeThreatScore` means crises find the
coasting player, not the one mid-war.

Per-player knobs (new fields on `OpponentChallengeProfile` in
`src/core/opponent-challenge.ts`):

| Knob | Explorer | Standard | Veteran |
|---|---|---|---|
| Crisis cap (see semantics below) | 1 | 2 | 3 |
| Min turns between crisis onsets | 12 | 8 | 5 |
| Grace period (no crises; era AND turn floor must both pass) | eras 1–2, min 30 turns | era 1, min 20 turns | era 1, min 10 turns |
| Severity multiplier | 0.5× (auto-recovers) | 1.0× | 1.3× (some unpreventable loss era 3+) |

- Era 1 is crisis-free for **everyone**.
- **Cap semantics (exact):** the cap gates the *scheduler only*. Scheduled crises
  (Outbreak/Catastrophe/Hunt) never fire while the player's active count —
  scheduled crises **plus cities at `unrestLevel ≥ 1`, counted as one crisis per
  affected connected group** — is at or above the cap. Organic uprisings arise
  from real causes (conquest, war weariness) and are never suppressed by the cap;
  they can exceed it, but while they do, no new scheduled crisis fires. This is
  the honest version of "no pile-ons": the scheduler never *adds* to a player
  already under pressure.
- The existing `maxIndependentCrisesPerHuman` profile field is reused as the
  crisis cap; grace period, cooldown, and severity multiplier are new fields.
- Crises target **human players only**, matching threat-pressure's existing
  scope. Civs with zero cities never receive crises (`computeThreatScore`
  already returns 0 for them). AI-civ crises are a future extension.
- **Setup & changing your mind:** hotseat setup gains a per-player challenge
  picker (one row per human). In-game, the pause menu challenge control edits
  **only the current player's own challenge**, using the existing
  `pendingOpponentChallenge` "applies next turn" pattern — no player can change
  another player's difficulty. Solo setup is unchanged.
- All randomness via the seeded LCG already used in threat-pressure. Same seed +
  same state = same crisis.

## Archetype Gameplay

### Outbreak — "Contain it"
- Onset: advisor announcement with era-flavored name; afflicted city gets a status
  chip and yield penalty (plague: −food/−production; population tick-down on
  veteran only).
- Spread: each turn, seeded roll to spread to the nearest **same-owner** city;
  chance boosted by flavor-specific geography (swamp/jungle adjacency for plague,
  plains for locusts, coast for red tide). Outbreaks never cross to another
  player's cities — per-player difficulty isolation outranks realism here
  (cross-player contagion is listed under Out of Scope).
- Response actions (city-panel buttons, real trade-offs):
  - **Quarantine** — free, instant; stops spread but doubles local yield penalty
    while active.
  - **Remedy effort** — gold scaled to city size (same `population ×
    GOLD_APPEASE_COST_PER_POP` shape as appeasement); ends the outbreak in that
    city after 2 turns.
  - **Passive resistance** from era-appropriate buildings (aqueduct-type vs
    plague, granary-type vs blight) — rewards infrastructure planning.
- Explorer: outbreaks burn out on their own after 5 turns even if ignored.
  Veteran: ignored outbreaks spread until contained.

### Catastrophe — "Recover from it"
- One shock turn: affected tiles get `devastatedUntilTurn` (they yield **zero**
  — base terrain and improvement alike — until restored or expired; natural
  expiry: explorer 4 / standard 8 / veteran 10 turns). Veteran era 3+: the
  epicenter tile's improvement is destroyed outright (rebuild via the normal
  worker flow). There is no partial "damaged improvement" state — the codebase
  has no pillage/repair mechanic; devastation-suppression plus a restore action
  is the whole model.
- **Restore Land**: a new 1-turn worker action, available on a devastated tile
  you own, that clears the devastation immediately.
- **Blast area is clipped to the target player's own territory.** A catastrophe
  scaled by one player's challenge never damages another player's tiles,
  improvements, or units — shared-world fairness outranks blast realism.
- Recovery window (5 turns): restoring **every** devastated tile before it
  closes earns a resilience bonus: **+1 food and +1 production in each affected
  city for 5 turns** (exact values subject to the pacing-audit gate). On
  explorer, natural expiry also counts as `recovered` (the kid gets the win)
  but without the resilience bonus unless they actually restored.
- Strict geography: eruptions require a `volcanic` tile nearby; floods require
  river/coast cities; wildfires require forest clusters; harsh winters require
  tundra/snow. The map advertises your risks.

### Hunt — "Fight it"
- A named foe spawns at a legal hex near (never inside) the target player's
  borders, via existing spawn machinery + occupancy rules.
- It menaces exactly as its kind already does — beasts prowl their territory
  and attack units, barbarians raid, pirates harass coasts — no new foe AI is
  written. It does not attack cities on explorer/standard. On veteran it
  escalates to assaulting the nearest city if left alive for 5+ turns.
- The foe is a real world entity: any civ may fight it. **Gold rewards ride the
  existing kill payouts** (beast hoards, camp destruction gold, fleet rewards —
  no second payout is added). The crisis adds the **beast-slayer's feast**: the
  killing civ gets +2 happiness for 5 turns. The crisis resolves for the target
  player when the foe dies, regardless of who killed it. (Hotseat fun: the
  12-year-old can slay dad's beast and collect the feast.)
- If the target civ is eliminated while the hunt is active, the crisis resolves
  `abandoned` and the foe persists as an ordinary barbarian/beast/pirate world
  entity.
- Flavor table varies the foe by era and terrain (era 1 dire wolves; era 5
  corsair admiral).

### Uprising — "Win them back" (issue #354)
- **Contagion:** a city at revolt (`unrestLevel === 2`) adds unrest pressure per
  turn to same-owner cities within range, scaled by the owner's severity
  multiplier; a garrisoned target city is immune to incoming spread. City panel
  shows incoming spread threat.
- **Ideological concession:** new permanent resolution alongside gold appeasement.
  Cost: **2× the appeasement cost** (`2 × population × GOLD_APPEASE_COST_PER_POP`),
  reduced to **1×** if the civ has researched any civics-branch tech of the
  current era. Effect: clears `unrestLevel`/`unrestTurns`/`spyUnrestBonus` fully
  and sets `concessionImmunityUntilTurn = turn + 15` (no new unrest can start in
  that city during immunity). Gold appeasement remains the cheap quick fix that
  only suppresses.
- Rebel spawning and breakaway escalation stay exactly as `faction-system.ts` /
  `breakaway-system.ts` already implement — one continuous story.

### Cross-archetype rules
- **City changes hands or is razed mid-crisis** → every crisis touching that city
  resolves `abandoned` for the original target (a new owner never inherits a
  crisis scaled to someone else's challenge).
- Every crisis announcement states what to do about it in plain words ("Move a
  soldier into Thebes to stop the spread") — self-explanatory UI per project
  rules; it's also what makes a 7-year-old feel challenged, not confused.

## Data Model (all additions optional — old saves load unchanged)

```ts
// Civilization (challenge/pending on humans only)
challenge?: OpponentChallenge;         // personal internal-pressure difficulty
pendingChallenge?: OpponentChallenge;  // applied at this civ's next turn start
recentCrisisHistory?: string[];        // last 4 flavor ids
lastCrisisOnsetTurn?: number;          // scheduler cooldown tracking
feastUntilTurn?: number;               // beast-slayer's feast (+2 happiness while active)

// GameState
activeCrises?: Record<string, ActiveCrisis>;

// ActiveCrisis
interface ActiveCrisis {
  id: string;
  flavorId: string;
  archetype: 'outbreak' | 'catastrophe' | 'hunt';   // uprisings live in faction state
  targetCivId: string;
  cityIds: string[];        // afflicted cities (outbreak) / affected cities (catastrophe)
  tileKeys: string[];       // devastated tiles (catastrophe only)
  startedTurn: number;
  stage: 'active' | 'contained' | 'recovery' | 'menacing' | 'assaulting';
  // outbreak: active → contained; catastrophe: active(shock) → recovery;
  // hunt: menacing → assaulting (veteran only)
  turnsInStage: number;
  quarantinedCityIds?: string[];                    // outbreak per-city quarantine
  remedyCompletionByCity?: Record<string, number>;  // cityId → turn remedy completes
  huntEntityId?: string;    // hunt only: unit/camp/fleet id of the spawned foe
  foeName?: string;         // hunt only: named foe for banners/notifications
}

// Tile
devastatedUntilTurn?: number;

// City (uprisings otherwise reuse unrestLevel/unrestTurns)
concessionImmunityUntilTurn?: number;
resilienceBonusUntilTurn?: number;     // catastrophe recovery reward (+1 food/+1 production)
```

Plus one new worker action: `'restore_land'` in the worker-action union
(1-turn task on an owned devastated tile).

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

## UI / UX

- **City panel:** crisis status chip, response-action buttons (`createGameButton`;
  disabled with a visible reason when unaffordable), unrest/incoming-spread
  indicators, concession button alongside the existing appease button.
- **Map:** devastated-tile tint, crisis icon over afflicted cities, named-foe
  banner on hunt entities. **All crisis markers respect fog of war and
  discovery** — another player's crisis is only visible where you have vision,
  same as any world state. Launch reuses existing beast/pirate sprites;
  flavor-specific art later via the sprite pipeline.
- **HUD/notifications:** onset, spread, resolution at owning player's turn start;
  advisor lines for each archetype.
- The implementation plan must include the Player Truth Table, misleading-UI
  risks, and interaction-replay checklist required by
  `docs/superpowers/plans/README.md` for the city-panel response actions.

## SFX / Music

Reuses the existing audio architecture (`src/audio/`) — no new audio assets at
launch:

- **Onset stingers** (stinger bus, existing assets): Hunt → the pirate-raid
  stinger family; Outbreak/Catastrophe → the war-declared stinger as the launch
  placeholder. Bespoke crisis stingers are a later curation MR (ffmpeg pipeline
  already available).
- **Adaptive layer:** while the *current player* has an active Outbreak or
  Catastrophe, the music director holds the existing `unrest` snapshot (its
  `UNREST_LAYER` already conveys internal tension). Uprisings already drive this
  snapshot via `faction:unrest-started`/`resolved` counters — contagion must
  increment/decrement the same counters so music stays truthful.
- **Resolution:** reuse the peace-signed stinger for `contained`/`recovered`
  outcomes; the existing combat-victory path already covers hunt kills.
- Hot-seat: snapshot decisions key off `state.currentPlayer`'s crises only, so
  the music never spoils another player's hidden trouble.

## Testing

- **Scheduler:** grace periods per challenge (both era and turn floors), cap
  semantics (scheduled blocked at cap; organic uprisings exceed but block),
  cooldowns, anti-repeat weighting, external-threat-recency gate, determinism.
- **Flavor definitions (generic loop over the whole table):** valid era band,
  satisfiable geography predicate, severity entries for all three challenge
  levels, era-name coverage — new rows auto-checked (wonder-content pattern).
- **Per archetype:** outbreak spread/quarantine/remedy + same-owner-only spread;
  catastrophe damage + territory clipping + repair window + resilience bonus;
  hunt spawn legality + bounty-to-killer + target-elimination handoff; uprising
  contagion blocked by garrison + concession cost/immunity + music-counter
  parity.
- **Cross-archetype:** city capture/raze mid-crisis resolves `abandoned`.
- **Hotseat:** player-2 crisis never notifies player 1; per-player challenge
  resolution order; pause menu edits only current player's challenge; music
  snapshot keyed to current player.
- **Solo:** setup writes challenge to both civ and game-wide; behaves identically
  to a one-human hotseat.
- **Saves:** old-save fixture (no crisis fields) loads and plays a turn cleanly;
  save referencing a removed flavor id drops the crisis gracefully; round-trip
  preserves active crises mid-arc.
- **Balance:** crisis yield penalties and resilience bonus run through the
  `pacing-audit` outlier gate (they touch the economy).
- **UI:** rendered-DOM tests per the plans-README checklist (response buttons,
  repeat-click, panel rerender after interaction).

## Key Files

| File | Action |
|---|---|
| `src/systems/crisis-system.ts` | **Create** — scheduler, Outbreak/Catastrophe resolvers, hunt orchestration |
| `src/systems/crisis-flavor-definitions.ts` | **Create** — `CRISIS_FLAVORS` table + geography predicates |
| `src/systems/faction-system.ts` | Extend — contagion, concession, immunity |
| `src/systems/threat-pressure-system.ts` | Insert scheduler call in per-human loop |
| `src/core/opponent-challenge.ts` | New profile fields; per-civ resolution helper |
| `src/core/types.ts` | Optional fields + events above |
| `src/core/turn-manager.ts` | Crisis turn processing (tick stages, expiry) |
| `src/ui/hotseat-setup.ts`, `src/ui/pause-menu-panel.ts` | Per-player challenge picker / own-challenge editing |
| `src/ui/city-panel.ts` | Status chips, response actions, concession button |
| `src/ui/notification-routing.ts`, `src/ui/advisor-system.ts` | Crisis routing + advisor lines |
| `src/audio/music-director.ts`, `src/audio/sfx-director.ts` | Snapshot hold + onset/resolution stingers |
| `src/systems/improvement-system.ts`, `src/systems/city-work-system.ts` | `restore_land` worker action; devastated-tile zero yields; resilience bonus |
| `src/renderer/*` | Devastated tint, crisis city icon (fog-aware) |

## Delivery Plan (incremental MRs, each playable alone)

1. **MR1** — scheduler + per-player challenge plumbing (setup UI, pause menu,
   profile fields) + one outbreak flavor (Plague) + SFX hooks.
2. **MR2** — Catastrophe archetype + eruption/earthquake/flood/wildfire/winter
   flavors.
3. **MR3** — Hunt archetype (beast/corsair/bandit flavors). **Closes #381.**
4. **MR4** — Uprising extension: contagion + concession. **Closes #354.**
5. **MR5** — flavor breadth pass (more outbreak/hunt flavors, era-name fill-in,
   bespoke crisis stingers if audio assets are ready).

## Out of Scope

- AI civs suffering crises (future extension).
- Cross-player outbreak contagion and cross-territory catastrophe damage
  (excluded deliberately for per-player difficulty fairness).
- Flavor-specific sprite art and bespoke crisis audio (launch reuses existing
  assets).
- A full happiness system rework — uprisings reuse the existing pressure model.
