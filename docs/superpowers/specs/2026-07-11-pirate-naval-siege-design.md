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
  isOwnersLastCity: ownerCiv.cities.length <= 1,   // see §3a fix B
  era: state.era,
  challenge: resolveChallengeForCiv(state, city.owner),
});
state = applyCitySiegeOutcome(state, cityId, result);
```

- **Garrison fully blocks** — a land unit in the city stops the naval bombardment. Kept
  **identical** to the barbarian rule rather than inventing a naval-only defense, so the
  player has exactly one city-defense rule to learn ("keep a defender home").
- **Walls / Star Fort / defensive techs mitigate** via
  `getCityDefenseBreakdown(attackerDomain: 'naval')` — domain-aware, and after fix A
  (§3a) its flat bonuses (Star Fort, Fortification Engineering, and the naval-specific
  **Torpedo Warfare**) actually reduce siege damage instead of being silently dropped.
- **0 HP → sack** (plunder 15% gold, survive at 1 HP) when `era <= citySiegeDestructionEra`
  **or the city is the owner's last** (fix B); else **destroy** — the same per-difficulty
  knob barbarians use, no new gating.
- Raw damage scales by maritime stage: new
  `PIRATE_SIEGE_DAMAGE = [0, 0, 0, 8, 12, 16]` (indexed by stage 0–5; `0` below the stage
  floor so an under-stage `besieging` faction deals nothing). Stage 3 (the floor) maps to
  the `triremes` tech via `getPirateMaritimeStage`; stage is the **global** max across all
  civs, so pirate siege capability scales to the world's naval advancement, not just the
  victim's. Exact values tuned via balance-sampling tests — early exchanges should feel
  like a multi-turn siege a prepared player survives, not a one-shot.

## 3a. Required fixes to the shared `city-siege-system.ts` helpers (inherited #549 bugs)

The review of the #549 helpers this design reuses found two latent bugs. Per
`.claude/rules/end-to-end-wiring.md` ("do not freeze an inherited bug in place"), both
are fixed **in the shared helper in this MR**, which also corrects the already-shipped
barbarian path. Each gets its own regression proving the barbarian path is fixed too.

- **Fix A — flat defense bonuses are dropped.** `resolveCitySiegeDamage` currently
  computes `Math.round(rawDamage / breakdown.multiplier)` and **ignores
  `breakdown.flatBonus`** ([city-siege-system.ts:46](../../../src/systems/city-siege-system.ts)).
  So Star Fort (+5), Fortification Engineering (+5), and the naval-only **Torpedo Warfare
  (+5)** provide zero siege mitigation today. Fix: subtract the flat bonus after the
  multiplier, e.g. `Math.max(0, Math.round(rawDamage / multiplier) - flatBonus)` (floor at
  0 so a heavily-fortified city takes no damage rather than negative). Add a positive test
  asserting each flat-bonus source reduces `hpLost`, including Torpedo Warfare on the
  `attackerDomain: 'naval'` path specifically.
- **Fix B — siege destruction leaves a zombie civilization / can silently eliminate a
  civ.** The `destroyed` branch empties `ownerCiv.cities` but never calls
  `eliminateCivilization`, so a raider razing a civ's last city leaves it at 0 cities,
  `isEliminated: false`, units and diplomacy intact. Rather than wire the elimination
  cascade into a raider path, **a siege never destroys a civ's last remaining city** — add
  `isOwnersLastCity: boolean` to `CitySiegeInput`; when true, the 0-HP outcome is forced to
  `sacked` regardless of era/difficulty. Design rationale: a civilization is only ever
  ended by another civilization's conquest, never by barbarians or pirates — squarely
  aligned with #522's anti-permanent-loss thesis for a family audience. Both the barbarian
  caller (`turn-manager.ts`) and the new pirate caller pass `isOwnersLastCity`. Add a
  regression for each caller: last city at 0 HP → `sacked`, not `destroyed`, and the civ is
  not eliminated. **Check and update any existing #549 test that asserts a last-city can be
  destroyed** — that assertion is now intentionally reversed (note the deviation in the PR).

## 4. Counterplay (all already-taught levers, no new player verbs)

- **Garrison the city** → full block (identical to barbarians).
- **Sink the besieging fleet** with your navy → removes adjacency → siege stops and HP
  regen resumes automatically. Pirates are already `isAlwaysHostilePair`, so #549's
  `isCityHpRegenerating` hostile-adjacency gate needs **zero change** — the day no pirate
  is within 1 hex, the city regens +5/turn.
- **Break the blockade before turn 3** → resets the streak, no siege.
- **Existing tribute / notoriety de-escalation** → drop the faction below `besieging`.

## 5. Visibility (issue point 4 — loud + on-map)

- **Loud one-time alert** the turn HP first falls on a city: a new `siege` notification
  type ("Pirates are besieging {city}! Station a unit there or sink their ships.") through
  the existing pirate notification/intel pipeline (`applyPirateNotifications` +
  `PIRATE_NOTIFICATION_TYPES` in `pirate-notifications.ts`). Distinct from the quieter
  raid/blockade sightings, and phrased plainly for the youngest players.
- **`city:sacked`** fires with `source: 'pirate'` — the event is already parametrized by
  source (barbarians pass `'barbarian'`; `main.ts:3875` already renders the `'pirate'`
  copy path), so this is a value, not a new event.
- **A razed city needs a new notification type — `city-razed`.** Note the existing pirate
  `destroyed` notification type is **already taken** (it means "a pirate faction was
  destroyed", `pirate-notifications.ts:79`); do not reuse it. Add `city-razed` alongside a
  `pirate:city-destroyed` bus event mirroring `barbarian:city-destroyed`, wired in
  `main.ts` to append a civ-log entry, so a razed city is never silent.
- **Map indicator** for under-siege / falling-HP state — the city panel already shows the
  "Under siege (no regen)" vs "Recovering (+5/turn)" label from #549; the remaining gap is
  an **on-map badge** so the player sees it without opening the panel. This is the one
  genuinely new UI surface.

## 5a. SFX

- Add a `siege` audio cue (tense, distinct from the `raid`/`blockade` sting) and a
  `city-razed` cue (a heavier, one-time destruction sting) to `PIRATE_AUDIO_CUES` in
  `src/audio/pirate-audio-sources.ts`, and emit them via the existing `pirate:audio-cue`
  bus event (`pirate-system.ts:817`) on the same transitions as the notifications. Follow
  the placeholder-OGG convention already used for the other pirate cues if final assets
  aren't ready — a wired placeholder, not a missing cue.

## 6. Guards, difficulty & parity

- **AI civ cities are eligible victims** too (same `isEligibleVictim` as raid/blockade),
  so pirates can besiege and **sack** AI cities — required for parity and for the threat to
  feel real in the world, not player-only.
- **Last-city guard (resolved — see §3a fix B):** a siege **never destroys any civ's last
  remaining city**, human or AI; it sacks instead. So pirates (and, after this fix,
  barbarians) can pressure and plunder but can **never eliminate a civilization** — only
  another civ's conquest can. This bounds the balance impact on AI civs (recoverable sack,
  never a wipe) and removes the elimination-cascade / zombie-civ risk entirely. Because no
  siege path eliminates a civ, no new diplomacy-scrub wiring is needed here.
- **Difficulty levers (documented, not new knobs):** the outcome is bounded on every
  difficulty by two existing mechanisms — the per-challenge `citySiegeDestructionEra`
  (explorer era 4+, standard era 3+, veteran era 2+) gates whether a *non-last* city can be
  destroyed at all, and the last-city guard guarantees a civ always survives. `N = 3` and
  `PIRATE_SIEGE_MIN_STAGE = 3` stay fixed across difficulties for simplicity; per-difficulty
  tuning of the warning window is a possible future refinement, not part of this MR.
- **AI defensive response (scoped out, bounded):** the opponent AI is not taught to
  garrison or relieve a besieged city in this MR. This is acceptable because the last-city
  guard caps the worst case at a recoverable sack. A lightweight "treat a blockaded/besieged
  owned city as a garrison priority" AI behavior is a reasonable **follow-up issue**, noted
  so it isn't mistaken for an oversight.

## 7. Testing (TDD)

- **Blockade streak:** accrues each blockaded round; resets on ship-leaves, on
  garrison-appears, on de-escalation, on victim-ineligible (one negative test per reset
  cause — spec-fidelity: prove each condition matters).
- **Escalation gate:** siege fires only when `behavior === 'besieging'` AND
  `maritimeStage >= PIRATE_SIEGE_MIN_STAGE` AND streak `>= N` — negative test for each
  factor missing (A-without-B / B-without-A, per spec-fidelity conjunction rule).
- **Siege damage (naval domain):** garrison fully blocks; walls mitigate;
  sack-vs-destroy by era × difficulty (reuse the barbarian test matrix with
  `attackerDomain: 'naval'`).
- **Fix A regression (flat bonuses mitigate):** Star Fort, Fortification Engineering, and
  **Torpedo Warfare** each reduce `hpLost`; assert Torpedo Warfare reduces it on the
  `attackerDomain: 'naval'` path and is inert on the `'land'` path. Add the same assertion
  through the **barbarian** caller so the shipped path is proven fixed, not just the helper.
- **Fix B regression (last-city safety), both callers:** a civ's last city at 0 HP resolves
  to `sacked` (not `destroyed`) and the civ is **not** eliminated — one test via the pirate
  caller, one via the barbarian caller. Locate and reverse any existing #549 test asserting
  a last city can be destroyed.
- **Regen resumes** the round the besieging fleet leaves / is sunk.
- **Hot-seat once-per-round:** in a multi-human game, siege damage and the streak increment
  fire exactly once per completed round (they live in `processPiratesForCompletedRound`),
  not once per player-turn — mirror the #549 regen once-per-round regression.
- **Visibility:** one-time `siege` alert fires exactly once on the falling-HP transition and
  does not recur from steady-state scans (end-to-end-wiring "transition-owned" rule);
  `city:sacked` carries `source: 'pirate'`; the new `city-razed` notification + a
  `pirate:city-destroyed` bus event fire on destruction and do **not** collide with the
  existing faction-`destroyed` type; on-map badge renders for an under-siege city (assert
  the DOM/render output, per spec-fidelity UI contract rule).
- **SFX:** `pirate:audio-cue` emits `siege` and `city-razed` on the matching transitions,
  and both cue ids exist in `PIRATE_AUDIO_CUES`.
- **Balance sampling:** across stages 3–5 and representative eras, a prepared (walled +
  garrisoned) city is effectively safe, and an undefended coastal city falls over a
  multi-turn window, not instantly.
- **Save-compat:** an old pirate save loads with `blockadeStreakByCity = {}` and no
  faction stuck in an invalid behavior.
- **Actor parity:** a non-player civ's city can be besieged/sacked by the same
  path (end-to-end-wiring "shared state mutations must be actor-complete").

## Out of scope

- The larger "make the city a real combat entity" unification the issue's second comment
  floated (intrinsic city strength, city ranged strike, routing the player capture path
  through the same model). #549 built a lightweight HP model that both barbarians and now
  pirates share; a full combat-entity refactor is a separate arc, not required to close
  #522.
- Reviving or repurposing `threat-pressure-system.ts`'s dead pirate-fleet code.
- Teaching the opponent AI to defensively garrison or relieve a besieged city — a
  reasonable follow-up (see §6), bounded out of scope by the last-city guard.
- Per-difficulty tuning of `N` / `PIRATE_SIEGE_MIN_STAGE` — fixed this MR (see §6).
