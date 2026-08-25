# Issue #545 — Strategic Deterrence Endgame (ICBMs, Fallout, Arms Control)

## Problem

Nuclear weapons are entirely cosmetic today. `icbm-development` (era 11) unlocks Missile
Silo and Strategic Air Command — both flat production-yield buildings. `manhattan_project`
and `nuclear_arsenal` (era 10) are the same. `missile_submarine` is a strong conventional
submarine with no missile. `arms-control-negotiations` (era 11) has zero mechanical verb
despite its flavor text promising "superpowers agree to arsenal limits." Eras run to 13,
so the deterrence endgame — the defining strategic layer of eras 10+ — currently has no
mechanic: no strike, no fallout, no deterrence diplomacy, no arms control. This is also a
content-honesty risk in the #524/`content-description-honesty.md` vein: several building
descriptions already claim strategic-weapon identity with zero backing mechanic.

The desired player fantasy is not "reach late game, build the biggest bomb, erase
cities." It is: *I possess a terrifying capability, my rivals know enough to react to it,
and using it has consequences serious enough that deterrence and diplomacy may be more
valuable than the strike.*

## Current architecture (audited 2026-08-25 against `origin/main`, HEAD == merge-base)

**Existing cosmetic content** (`city-system.ts`, `tech-definitions-eras10/11.ts`):
- `manhattan_project` (building, id `manhattan_project`, display name "Atomic Weapons
  Program" — no collision with the separate `manhattan-project` legendary wonder, which
  is displayed as "Manhattan Project"): era-10 national project, `techRequired:
  'nuclear-weapons'`, `resourceRequired: ['uranium']`, `civYieldBonus: { production: 6 }`.
- `nuclear_arsenal` (building): era-10, same tech/resource gate, `yields: { production:
  3 }`.
- `missile_silo`, `strategic_air_command`: era-11, gated by `icbm-development`
  (`nuclear-weapons` + `rocketry`). Silo is a plain building (`yields: { production: 4
  }`); Strategic Air Command is a national project (`civYieldBonus: { production: 6 }`).
- `arms_control_treaty` (national project): era-11, gated by `arms-control-negotiations`,
  `civYieldBonus: { gold: 5 }`.
- `missile_submarine` (unit): unlocked by `nuclear-submarines` (era 11, **maritime**
  track — independent of `icbm-development`), strength 56, `attackProfile: { kind:
  'ranged', range: 3, targets: ['unit', 'city'] }` — a fully conventional attacker today
  (Torpedo Warfare +8, commerce-raider ×1.5 vs civilians, ambush ×1.25 vs capital
  ships/frigates, ASW-vulnerable to destroyers ×1.25). Its `UNIT_DESCRIPTIONS` entry
  already says *"submarine-launched missiles threaten any city from the deep"* — real
  flavor already written for a mechanic that doesn't exist yet.
- `uranium`: plain strategic resource (`+1 science`, mine improvement, era-10 tech gate).
  No stockpile linkage.

**City HP/siege (`city-siege-system.ts`, #522) — the reusable damage floor:**
- `city.hp` (0–100, default 100), regenerates +5/turn when undefended and no hostile unit
  within 1 hex (`applyCityHpRegeneration`).
- `resolveCitySiegeDamage` outcomes: `blocked` (garrisoned), `damaged` (HP > 0 after hit),
  `sacked` (HP would hit 0, but era ≤ `citySiegeDestructionEra` for the defender's
  difficulty, or it's the owner's last city — floors at 1 HP + 15% gold loss), or
  `destroyed` (HP would hit 0, era > `citySiegeDestructionEra`, not the owner's last city
  — the city is **actually removed from `state.cities`**). `citySiegeDestructionEra` is
  3/2/1 for explorer/standard/veteran. A civ is only ever ended by conquest, never by
  siege alone.
- This is the ready-made "harsh but survivable" floor a strategic strike should reuse —
  no new destruction mechanic needs to be invented.

**Devastation primitive (`tile.devastatedUntilTurn`, `crisis-system.ts`):**
- A plain optional `number` field on any map tile. `getTileYield` zeroes any tile whose
  `devastatedUntilTurn > currentTurn`, unconditional on *why* it's set — this makes it a
  generic reusable primitive, not catastrophe-specific plumbing.
- Today only `crisis-system.ts`'s catastrophe archetype writes it: `blastRadius` 1–2
  hexes around an epicenter, restricted to the target civ's own owned tiles,
  `devastationTurnsByChallenge: { explorer: 4, standard: 8, veteran: 10 }`.
- No other system reads "why" a tile is devastated — a strategic strike can set the same
  field with larger radius/duration constants without adding a discriminator field,
  unless a future need for stacking/attribution UI arises (see Non-goals).

**Witness/reputation (#526, `crisis-interaction-definitions.ts`) — the one reputation
engine:**
- `getWitnessCivIds(state, actorId, targetId)`: civs that have met **both** actor and
  target (`hasMetCivilization`), excluding the two parties themselves. Crisis-independent
  despite living in this file (only the *row table* is crisis-specific).
- Bilateral relationship deltas via `modifyRelationship` (clamped ±100): actor↔target gets
  one delta, actor↔every witness gets a (usually smaller) delta. Existing magnitudes:
  `exploit_weakness` (opportunistic war during a rival's crisis) is -15 target / -8
  witness — the current worst entry in the table. `applyBilateralRelationshipDelta` is
  not exported today; it will need exporting (or an equivalent thin wrapper) for the
  strike consequence to call it directly.

**Difficulty philosophy (`OPPONENT_CHALLENGE_PROFILES`, `core/opponent-challenge.ts`) —
established, not new:**
- A committed, growing table of AI *eagerness/willingness* knobs
  (`submarineEscortWeight`, `heroicCommandEagernessWeight`, `generalSafetyWeight`,
  `pillageAggressivenessMultiplier`, ...), each with an explicit doctrine comment such as
  *"Detection range, visibility rules, and combat modifiers are NEVER difficulty-scaled —
  only this eagerness knob is."* Explorer/standard/veteran values for existing knobs
  scale roughly 0.3–0.6 / 1.0 / 1.3–1.6. This is the exact shape for new first-strike and
  deterrence-caution knobs — mechanics/legality stay uniform, only scoring changes.
- `citySiegeDestructionEra` is 3/2/1 explorer/standard/veteran — precedent for a
  difficulty-scaled *threshold*, not just a multiplier.

**Settings pattern (`beastsMode`, `resolveWorldPressureFlags`) — the template, with one
caveat:**
- `GameSettings.beastsMode?: BeastsMode` (`'off'|'calm'|'wild'`), optional, resolved via a
  `resolveXFlags(settings)` helper with an explicit default-for-new-games comment ("wild"
  for new games, **undefined on legacy saves** — legacy saves inherit the *live* default
  through the resolver, since beasts are a benign map feature).
- **This precedent must NOT be copied verbatim for `superweapons`** — beasts carry no
  family-safety stakes, so "legacy saves quietly inherit the current default" is fine
  there. It is not fine for a toggle whose entire purpose is parental consent to
  city-destroying content (see Design §13).
- `getAvailableBuildings` (`city-system.ts`) does not currently accept `settings` at all —
  gating content by `superweapons` requires threading a new optional parameter through
  it and every production/AI-eligibility call site, the same caller-discipline concern
  `.claude/rules/game-balance.md` already flags for `activeNationalProjects`.

**Concealment (`concealment.ts`, #542) — already capability-shared:**
- `SUBMARINE_TYPES = new Set(['submarine', 'missile_submarine'])` — `missile_submarine`
  already uses the *exact same* concealment/detection machinery as a plain submarine
  (naval-unit range-1 default detection, destroyer/autonomous_frigate extended range,
  coastal_battery/radar_station city detection, Maritime Patrol reveal-for-the-turn). No
  new concealment mechanism is needed for a survivable sea-based launch platform — it is
  already there.

**Treaties (`core/types.ts`):**
- `Treaty { type: TreatyType; civA; civB; turnsRemaining; goldPerTurn? }`,
  `TreatyType = 'non_aggression_pact' | 'trade_agreement' | 'open_borders' | 'alliance' |
  'vassalage'`. No cap/condition payload exists — a numeric-cap arms-control treaty needs
  either a new `TreatyType` with an optional numeric field, or its own small typed
  structure alongside `DiplomacyState.treaties`.

**Determinism (`core/game-state.ts`):** `gameId` is a pure function of the seed string
(RNG-seed role); `playthroughId` owns per-instance/save-identity uniqueness. Crisis-system
already seeds its epicenter RNG via `seededLcg(state.turn * 65599 + hashString(crisis.id))`
— the pattern a strike's own tile-selection/AI-decision RNG should follow, keyed off
`state.turn` + the actor/target civ IDs (no `crisis.id` equivalent exists for a strike).

**No generic confirm-modal component exists.** The closest precedent
(`city-capture-panel.ts`, occupy/raze) is a single-screen binary choice, not a staged
flow. The launch UX is new UI, not a reuse.

## Goals

1. Strategic weapons are rare, capacity-bounded, and consequential — never tactical spam.
2. A rival's *known* nuclear capability measurably affects AI conventional behavior
   (war willingness, invasion appetite) as well as AI launch doctrine, visibly to the
   player — no invisible fear bonuses.
3. Second-strike capability is real and platform-differentiated: a fixed, unlimited-range
   but locatable Missile Silo vs. a limited-range but concealed, mobile Missile
   Submarine — capability-driven (a typed `strategicLaunchPlatform` field), never
   `unit.type === 'missile_submarine'` branching.
4. No logistics simulation: one shared per-civ warhead count, one capacity ceiling, one
   production item. No per-missile, per-platform, or per-crew bookkeeping.
5. A family can fully disable city-destroying content (`superweapons: 'off'`) with the
   tech tree staying complete and honest, chosen at setup, safe by default on legacy
   saves regardless of new-game defaults.
6. Launching is the single hardest action in the game to do by accident: legal only
   against a civ you're at war with, gated by a staged preview-then-confirm flow.
7. Player-readable truth everywhere except what hasn't been earned: arsenal capacity,
   platform ranges, and treaty caps are always visible to their owner; a rival's exact
   stockpile is never visible to anyone, ever, at any difficulty.
8. Explorer/standard/veteran share identical construction rules, costs, launch legality,
   blast effects, reputation consequences, treaty rules, and information boundaries.
   Difficulty changes AI *willingness* and *doctrine thresholds* only.
9. Fully deterministic under a given seed: no `Math.random`/`Date.now` anywhere in
   production, targeting, or AI-decision code.

## Non-goals

- No warhead component/fuel-stage/crew production chains, no per-missile assignment.
- No missile interception/defense system — SAM Site, Radar Station, Coastal Battery, and
  Bunker remain conventional-only; a launched strike is unstoppable (matches real-world
  ICBM/SLBM behavior and avoids inventing a missile-defense arms race).
- No extended deterrence to allies (an ally's nuclear capability does not currently factor
  into a third civ's caution toward you) — flagged as a deliberate v1 deferral, not
  silently dropped (see Follow-ups).
- No devastation-source discriminator field, no interaction with supply/roads/rail beyond
  what `devastatedUntilTurn` already does (tiles still allow movement/roads/healing; they
  just yield zero) — a second devastation tier is out of scope.
- No repeated-strike cooldown/diminishing-returns mechanic — scarcity (production cost +
  capacity ceiling) is the only throttle, matching every other scarce-resource system in
  the game.
- No global non-proliferation gate and no non-first-use pact as separate treaty types —
  v1 ships exactly one arms-control mechanic (bilateral arsenal cap).
- No victory-condition-specific interaction (a strike does not itself grant or block any
  victory path) — see Interaction audit.

## Design

### 1. Arsenal abstraction

`Civilization.strategicArsenal?: number` — a single shared per-civ warhead count.
`getStrategicArsenalCapacity(civ)` sums: `1` base capacity once Manhattan Project has been
completed (0 otherwise — capacity-granting buildings are inert without it), `+2` per
`nuclear_arsenal` built (any city, summed empire-wide), `+1` per `missile_silo` built.
Strategic Air Command grants **no** capacity (see §3). A new city production item, "Build
Warhead" (illustrative cost 260, comparable to a marquee-band era-10/11 item — tunable in
the balance-pass MR), is available once Manhattan Project is complete and `uranium` is
available to the city; producing it increments `strategicArsenal` by 1. Launching
decrements it by 1. No per-platform assignment — any eligible platform draws from the
same pool.

**Capacity is a production-eligibility gate, not a live clamp on the stored count** — two
distinct rules, not one, to avoid two different failure modes:
- **At-capacity UX**: "Build Warhead" is removed from the available-production list the
  same way any other already-satisfied gate removes an item (`getAvailableBuildings`'s
  existing filter pattern), with the disabled/absent reason surfaced as "Arsenal at
  capacity (`N`/`N`) — build Nuclear Arsenal or Missile Silo to expand" wherever the
  production catalog explains unavailable items. It is never silently queueable and then
  rejected or refunded on completion — that would be exactly the dead-end/silent-mechanic
  failure `.claude/rules/ui-panels.md` and `.claude/rules/incremental-mr-completion.md`
  warn against.
- **Capacity-loss edge case**: if a capacity-granting building is later lost (captured by
  a rival, or a hypothetical future removal path), `strategicArsenal` is **not** forcibly
  reduced to fit the new, lower capacity — existing warheads are grandfathered above cap.
  Only *new* production is blocked while `strategicArsenal >= capacity`. This mirrors the
  arms-control cap's own enforcement rule (§12: blocks new production, never destroys
  existing stock) so the two "over a ceiling" cases behave identically instead of one
  silently deleting player-invested production and the other not.

### 2. Manhattan Project — one-time program unlock

Its **existing** `civYieldBonus: { production: 6 }` and era-10/`nuclear-weapons`+
`uranium` gate are unchanged (no pacing-snapshot churn — see Balance review). It gains one
additive, non-yield effect: completing it sets a `civId: true` flag equivalent to "can
produce warheads" (implemented as `builtNationalProjects` already tracking this exact
building, so no new state is needed — `hasManhattanProject(state, civId)` is a thin
existing-data query, not a new field). Nuclear Arsenal, Missile Silo, and the Build
Warhead production item all gate on this same query.

### 3. Building roles — differentiated, not redundant

- **Nuclear Arsenal**: unchanged `yields: { production: 3 }`; adds `+2` arsenal capacity
  (additive field, §1). "More bombs."
- **Missile Silo**: unchanged `yields: { production: 4 }`; adds `+1` arsenal capacity
  *and* becomes a launch platform via `strategicLaunchPlatform: { range: 'unlimited' }`
  (§4; the typed field's `range` is `number | 'unlimited'`, not a sentinel number, so a
  future limited-range land platform and today's unlimited-range Silo share one honest
  type rather than one of them lying with `Infinity` or a magic constant). Fixed,
  discoverable location — redundancy against elimination comes from building more than
  one, in more than one city, not from hiding any single one. "Reach."
- **Strategic Air Command**: unchanged `civYieldBonus: { production: 6 }`; adds **no**
  capacity. Its additive effect is empire-wide launch *readiness*: while built, it raises
  the owning civ's own `strategicLaunchWillingness` retaliation knob (§10) by one step
  when scoring its own retaliation decision, and it grants a small, player-visible
  "credible second strike" note in the deterrence-info surface shown to civs who know you
  have it (a discoverable building, same visibility rule as any other — see §9).
  "Credibility."
- **Arms Control Treaty** (national project): unchanged `civYieldBonus: { gold: 5 }`;
  becomes the prerequisite that makes the bilateral arsenal-cap treaty type available to
  propose (§12) — it does not itself create a cap, it unlocks the diplomatic *offer*.

### 4. Missile Submarine — survivable second-strike platform

Independent tech path (`nuclear-submarines`, maritime track) converging on the same
shared arsenal. Its existing conventional ranged attack (range 3, targets unit/city) is
**untouched** — strategic launch is an additive capability on the same unit, not a
reinterpretation of its existing stat line, matching the "capability-driven, not
type-branched" goal. Gains `strategicLaunchPlatform: { range: 4 }` (one hex more than its
conventional attack range — deliberately far short of the Silo's unlimited reach; its
survivability, not its range, is the second-strike value). Concealment is entirely
unchanged (#542's existing `SUBMARINE_TYPES` machinery — no new mechanism). A player
always sees their own sub's launch eligibility in its unit panel (owner view is never
fogged); an enemy can only know it's a live threat if they've actually detected it via
the existing detection rules, or inferred it exists at all via `hasMetCivilization` +
"this civ has nuclear capability" (§9) — never its exact position unless detected.

### 5. Tech tree wiring

No new techs. `icbm-development` continues to unlock Missile Silo + Strategic Air
Command; `nuclear-weapons` continues to unlock Manhattan Project + Nuclear Arsenal;
`nuclear-submarines` continues to unlock Missile Submarine; `arms-control-negotiations`
continues to unlock the Arms Control Treaty. Every `unlocks` string is rewritten to
describe the real mechanic per `content-description-honesty.md`'s checklist (§Content
honesty below) — no tech gets a new prerequisite or era.

### 6. Launch legality and targeting

A strike is a legal action if and only if: the actor civ has `strategicArsenal >= 1`, has
at least one eligible platform (a Missile Silo city, or a Missile Submarine with the
capability, either owned and not currently disabled/destroyed), and **the target civ is
in the actor's `atWarWith` list**. This is the primary technical guardrail against a
hot-seat accident — an at-peace sibling literally cannot appear as a valid target, before
the confirm-flow UX (§14) even engages as a second layer. The target must be a **city**,
and that city must already be **discovered** by the actor (the same fog-of-war standard
every other targetable action uses) — closing a targeting-omniscience loophole where a
civ could strike a rival capital it has never actually scouted merely because it knows
the civ exists. Range is checked against the nearest eligible platform of the chosen
type (unlimited for Silo, 4 hexes from the sub's current position for Missile Submarine).

### 7. Strike resolution — city effects

Reuses `city-siege-system.ts`'s existing floor semantics directly rather than inventing a
parallel damage path: a successful strike computes as an overwhelming, deterministic
`rawDamage` value (large enough to floor almost any target) fed through the *existing*
`resolveCitySiegeDamage`/`applyCitySiegeOutcome` pipeline with `attackerDomain: 'air'`.
Because the destroy path already requires *both* `era > citySiegeDestructionEra` *and*
"not the owner's last city," and because you locked "ruin, never delete" as the product
answer, a strike additionally forces `preventDestruction: true` regardless of era/last-
city status — the harshest possible outcome remains `sacked`'s floor (1 HP, population/
building losses per that path's existing gold-loss and future population-loss rules, no
change needed there), never `destroyed`. This is a deliberate, explicit override of the
generic siege destroy-path for this one caller — not a change to conventional siege's own
behavior. A garrisoned defender still fully blocks the HP-floor destruction the same as
today (unchanged `hasGarrison` gate) — a strike is powerful, not omnipotent, against a
defended city.

### 8. Fallout / devastation

Applies the existing `devastatedUntilTurn` primitive around the struck city, no new tile
field: `blastRadius: 3` (one more than catastrophe's worst tier of 2),
`devastationTurnsByChallenge: { explorer: 8, standard: 14, veteran: 18 }` (roughly 1.8×
catastrophe's 4/8/10 — reflecting deliberate-act severity over natural-disaster severity,
still difficulty-scaled the same direction as everything else). Restricted to the
defending civ's own owned tiles around the struck city, same ownership guard the
catastrophe writer already uses. No interaction with supply/road/rail/healing beyond the
existing zero-yield effect — a devastated tile still allows movement, still has its road,
still allows a unit to heal there; it simply produces nothing until the timer clears.

### 9. Deterrence information & AI conventional caution

**Visibility rule** (applies uniformly to AI scoring and player-facing UI — one source of
truth): any civ with `hasMetCivilization(state, viewerId, ownerId)` can see a boolean
"has nuclear capability" (= Manhattan Project completed) and can see any platform it has
*independently* discovered through existing means (a spotted Silo city — cities are never
hidden once a civ is met; a detected Missile Submarine via #542's concealment rules).
`strategicArsenal`'s exact count is **never** exposed to any other civ, at any
difficulty, anywhere (not diplomacy panel, not AI perception, not intel reports).

**Own-empire visibility gap this review caught**: Goal 7 requires arsenal capacity and
platform status to always be visible to their owner, but nothing in the design so far
gives the player a single place to *see* their own empire-wide total — only per-city
Silo panels and per-unit sub panels, which forces piecing together scattered numbers to
answer "how many warheads do I actually have and where." Fix: a "Strategic Arsenal"
section is added to the `warchief` advisor panel (the existing per-advisor panel
pattern, `AdvisorType`) — always visible once Manhattan Project is built, showing current
count/capacity, every platform (Silo cities by name, subs by name/last-known-status), and
any active arms-control cap. This is the one authoritative summary surface; per-city/
per-unit panels keep their own local detail but are no longer the only way to see the
totals.

**AI conventional-behavior effect (the "deterrence must be real" requirement):** a new
bounded `strategicDeterrenceCaution` scoring factor is applied wherever the AI currently
scores "declare war on"/"invade further into" a civ, keyed *only* off the same boolean
visibility above (known capability, not count). Implemented as new
`OPPONENT_CHALLENGE_PROFILES` knobs (existence of the caution effect is uniform across
difficulties; its magnitude scales explorer < standard < veteran, following the
established eagerness-knob convention exactly). **Player-readable**: the diplomacy panel
surfaces a relationship-modifier note (e.g. "wary of your strategic capability") whenever
this factor is actively suppressing that AI's aggression toward the human player — no
invisible number, per Goal 2 and the brief's explicit "no invisible arbitrary AI fear
bonuses" requirement.

### 10. AI launch doctrine (first-use / retaliation)

Locked as the issue's draft, made concrete:
- **Explorer**: never authorizes first use. Only ever considers retaliation, and even
  that is heavily suppressed.
- **Standard**: never initiates. Authorizes retaliation once struck (see below).
- **Veteran**: may initiate **only** under an explicit, computable existential-threat
  gate: its own capital city HP below a fixed threshold (illustrative: 20) **and** a
  hostile land unit adjacent to the capital **and** no friendly relief force within N
  hexes (illustrative: 3) capable of contesting it. All three conditions, not a vibe —
  this closes the "existential threat" ambiguity flagged in review.
- **Retaliation is never automatic/scripted.** A struck civ's AI does not get a forced
  counter-launch. On its own next turn, it re-scores a launch exactly like any other
  turn's decision, using the same doctrine — being-struck simply raises the
  `strategicLaunchWillingness` knob substantially for that turn's evaluation (a struck
  Explorer becomes willing to retaliate; a struck Standard becomes strongly willing; a
  struck Veteran becomes maximally willing). A human player facing this always presses
  the button themselves — no code path can force either side into a scripted chain
  reaction, capping worst-case cascade risk at "AI chose to retaliate," never "AI was
  compelled to."
- Legality (§6), blast effects (§7/§8), reputation consequences (§11), and information
  boundaries (§9) are byte-identical across all three difficulties — only these
  willingness/threshold knobs differ, per Goal 8.
- AI target evaluation is bounded: only civs currently `atWarWith`, only their already-
  discovered cities (§6) — no unbounded all-map scan.
- **Module boundary**: this doctrine (willingness knobs, the existential-threat gate, and
  the deterrence-caution factor from §9) lives in a new leaf module,
  `ai-strategic-doctrine.ts`, consumed by the existing AI turn/war-decision pipeline
  (`basic-ai.ts`/`ai-diplomacy.ts`) — not bolted directly into either of those
  already-large files, matching the SRP separation `city-siege-system.ts` already
  demonstrates for player-facing siege logic.
- **Production scoring**: Build Warhead and the capacity-granting buildings are scored by
  the existing `ai-production.ts` pipeline like any other item — no special-cased
  "nuclear eagerness" branch. The willingness/doctrine knobs above govern *launch*
  decisions only; how eagerly an AI chooses to build toward a warhead in the first place
  is the same bounded scoring every other production candidate already goes through.

### 11. Reputation / witness consequences

Reuses the existing engine directly (`getWitnessCivIds` + the bilateral-delta pattern;
`applyBilateralRelationshipDelta` gets exported, or an equivalent thin wrapper added, for
this caller) — no second reputation system. A launch is the single largest reputation
event in the game: illustrative deltas (tunable in balance pass, but ordered relative to
existing rows) — unprovoked first use: target -60 / witness -25 (roughly 4× the current
worst entry, `exploit_weakness`'s -15/-8, reflecting "biggest event in the game"); use in
retaliation against the civ that struck you first: target -20 / witness -5 (still
negative — deterrence isn't consequence-free — but visibly softer than first use);
self-defense framing does not change the delta further beyond the retaliation case
already covering it (no separate "self-defense" tier — keeps the rule legible). No
special ally-reaction mechanic beyond the existing witness pass (an ally who witnesses is
just a witness with a larger existing relationship to protect — no new code).

### 12. Arms control — bilateral arsenal cap (the one v1 mechanic)

New treaty concept, `arms_control_pact`, carrying an optional `arsenalCap: number` field
(added to `Treaty` as an optional field rather than reshaping the whole type, since only
this one treaty kind uses it). Available to propose once the proposing civ has completed
the Arms Control Treaty national project. Both signatories agree to a mutual cap; if a
signatory's `strategicArsenal` exceeds its own agreed cap (checked at production-completion
time — you cannot complete a Build Warhead item that would push you over an active cap),
production of that item is blocked while the pact holds, exactly like any other
prerequisite-gated production item — no separate enforcement pass needed. Breaking the
pact (either by an explicit "withdraw" action, i.e., choosing to build past the cap after
withdrawing) fires the same witness/reputation pipeline as any other treaty violation,
using the existing treaty-break severity precedent already in `diplomacy-system.ts`
(`breakTreaty`'s existing -30 relationship delta — confirmed present, distinct from, and
smaller than, a launch's own -60/-20 reputation hits from §11).

**AI acceptance (a real gap in the first pass — proposing a treaty type nobody ever signs
isn't a mechanic):** extends `ai-diplomacy.ts`'s existing relationship-threshold +
`personality.diplomacyFocus` pattern that already governs `non_aggression_pact`/
`alliance`/`trade_agreement` decisions (`relationship > 0 && personality.diplomacyFocus >
0.4` is `non_aggression_pact`'s exact existing gate) — `arms_control_pact` adds one more
condition on top of a similar relationship/diplomacy-focus bar: the AI only proposes or
accepts a cap when it can see (§9's visibility rule) that **both** sides have known
nuclear capability. Capping an unarmed civ, or a civ capping itself against a rival it
doesn't know is armed, isn't a coherent AI decision and would read as arbitrary to a
player watching AI diplomacy.

### 13. Superweapons setting & off-mode

New optional field `GameSettings.superweapons?: 'off' | 'on'`, resolved via a new
`resolveSuperweaponsFlag(settings)` helper mirroring `resolveWorldPressureFlags`'s shape
— **but with an intentionally different default rule**:
- **New games**: defaults to `'on'` for solo; chosen explicitly at hot-seat setup (per
  the issue's own addendum) — same UI-card pattern as `beastsMode` in
  `campaign-setup.ts`.
- **Legacy saves** (field is `undefined` because the save predates this feature):
  resolves to **`'off'`**, unconditionally, regardless of solo/hot-seat and regardless of
  what a *new* game on the same machine would default to. This is a deliberate departure
  from `beastsMode`'s "undefined inherits the live default" convention — retroactively
  arming an existing family's in-progress save without anyone opting in would violate the
  entire purpose of the toggle. A settings screen lets the player explicitly opt in
  afterward, at which point normal capacity/arsenal rules apply going forward (no
  retroactive capacity is granted to already-built `nuclear_arsenal`/`manhattan_project`/
  etc. on a save that flips the setting on mid-game — capacity is always computed live
  from current buildings, so this needs no special-case code, just the flag itself
  gating the computation).

**Off-mode content handling**: the full branch (4 techs, 5 buildings, 1 unit) stays in
the tree, fully buildable — no dead branch, no wasted research, no missing late-game
production slot. `getAvailableBuildings`/production eligibility/AI scoring take the new
threaded `settings` parameter (§ Current architecture caveat above) and, when
`superweapons === 'off'`, every strategic verb described in §1–§12 is suppressed: no
capacity, no launch platform, no Build Warhead item, no cap-treaty offer, no deterrence-
caution AI factor. Descriptions fall back to an honest plain-yield text (e.g. Missile
Silo: "Hardened underground command bunker. +4 production per turn." — dropping the
ICBM-specific claim entirely rather than leaving a dishonest promise). This is computed
once per definition, gated by the setting, not scattered `if (!settings.superweapons)`
checks through gameplay systems — the eligibility/description resolvers are the single
chokepoint.

### 14. Launch UX flow

New three-stage flow (a new component; no existing generic confirm-modal to extend):
1. **Select platform/action** — from a city's Missile Silo or a Missile Submarine's unit
   panel, an explicit "Prepare Strategic Launch" action (never a bare button — always
   paired with the current arsenal count and capacity, per `.claude/rules/ui-panels.md`'s
   "no bare buttons" rule).
2. **Select target + full impact preview** — only legal targets (§6) are selectable; the
   preview shows the target city, the exact tile-devastation radius overlaid on the map,
   expected city-HP/population effect, the reputation-consequence magnitude (§11), any
   active arms-control cap this would violate (§12), arsenal count after the launch, and
   — where knowable per §9's visibility rule — a plain-language retaliation-risk note if
   the target civ has known nuclear capability of its own.
3. **Explicit final confirmation** — a distinct, deliberately heavier confirmation step
   (not a second click on the same control), using the serious-register copy locked
   earlier ("The city lies in ruins" / "Fallout has devastated the surrounding region" —
   never casualty counts, never gore, never gleeful destruction prose).

Progressive disclosure per Phase 6 of the brief: plain-language first sentence, then the
key numbers, then an expandable "exact mechanics" section — same pattern already
expected elsewhere in the UI rules. 44px touch targets, reduced-motion-safe, mute-safe;
never conveyed by color/animation/sound alone.

### 15. Hot-seat & privacy

Dedicated threat model, since this is the highest-stakes hidden-information surface in
the game:
- The launch action, arsenal count, and platform status shown are always
  `state.currentPlayer`'s own — never any other hot-seat player's, matching the existing
  hard rule against hardcoding `'player'`.
- A production catalog must not leak a sibling's hidden state through *absence* (e.g. a
  cap-treaty option disappearing only because the other side's hidden arsenal already
  exceeds it) — cap-treaty availability is evaluated from the proposing civ's own known
  information only (§9's visibility rule already prevents seeing the rival's exact
  count, so the UI simply never has the data to leak).
- Overlays, target-range previews, and disabled-action reasons must never reveal an
  undiscovered rival platform's location — the same `hasMetCivilization`/detection gate
  from §6/§9 governs every one of these surfaces, not a separate check per surface.
- Notifications and audio cues for "you were struck" or "a rival gained capability" are
  scoped to civs who would legitimately know (the struck civ always; witnesses per §11;
  never a sibling with no fog visibility and no witness qualification).
- No stale panel state survives a hot-seat handoff — the launch flow's pending
  target/preview state is cleared on `currentPlayer` change, same as any other
  in-progress player-scoped UI state.

### 16. Save/load

New fields, all additive/optional, all safe on legacy load without a numbered migration
where possible:
- `Civilization.strategicArsenal?: number` — legacy saves treat `undefined` as `0`.
- `GameSettings.superweapons?: 'off' | 'on'` — resolved per §13 (legacy → `'off'`,
  distinct from the new-game default).
- `Treaty.arsenalCap?: number` — only present on `arms_control_pact` treaties; absent
  elsewhere, no migration needed.
- Arsenal capacity is **never stored** — always computed live from current buildings +
  the Manhattan Project flag, so there is nothing to migrate or drift out of sync when a
  building is lost (e.g. to a rival's own strike) or the setting is toggled mid-game.

## Content honesty

Every rewritten `unlocks`/description string (Manhattan Project, Nuclear Arsenal, Missile
Silo, Strategic Air Command, Missile Submarine, Arms Control Treaty/`arms-control-
negotiations`) goes through `.claude/rules/content-description-honesty.md`'s checklist:
grep for the real mechanism, confirm it's wired to this exact entity, add a positive test
asserting the claimed effect (capacity delta, launch eligibility, cap enforcement, AI
caution factor), not just a `description-honesty.test.ts` denylist pass. Off-mode text
(§13) gets the same treatment for its plain-yield fallback description.

## SFX

Per the existing issue addendum: launch reuses the existing explosion SFX until the
audio-arc backlog reaches this feature — no new bespoke sound in v1. New requirement from
review: the confirmation and impact moments must use a **serious, non-triumphant**
treatment — explicitly no fanfare/victory stinger on a strike, regardless of which side
fires it or the outcome.

## Interaction audit

| System | Disposition |
|---|---|
| City HP / capture (#522) | **Integrated** — strike reuses `resolveCitySiegeDamage`/`applyCitySiegeOutcome` directly with `preventDestruction: true` forced. |
| City defenses (walls, garrison) | **Integrated** — a garrisoned defender still fully blocks HP-floor damage, unchanged. |
| SAM Site / Radar Station / Coastal Battery / Bunker | **Intentionally unaffected** — conventional air defense only; no interception exists for a strategic launch (Non-goals). |
| Missile Cruiser / fighter interception | **Intentionally unaffected** — same reason. |
| Submarine concealment / ASW (#542) | **Integrated unchanged** — Missile Submarine's launch capability rides the existing `SUBMARINE_TYPES` machinery with zero new detection code. |
| Carrier / maritime patrol | **Intentionally unaffected** — no interaction beyond existing sub-detection reveal rules already covering patrol. |
| Supply (#544) | **Intentionally unaffected beyond devastation's existing zero-yield effect** — no new supply interaction (Non-goals). |
| Roads/rails | **Intentionally unaffected** — devastated tiles keep roads; movement cost is unchanged. |
| Fort/Citadel, Great Generals (#544) | **Intentionally unaffected** — no special interaction; a General in a devastated tile is subject to the same zero-yield effect as any other unit's surroundings, nothing more. |
| War weariness | **Intentionally unaffected** — no new weariness source; existing war-state weariness continues to accrue normally. |
| Pillaging (#541) | **Intentionally unaffected** — a strike is not a pillage action and doesn't interact with prize/capture rules. |
| Reputation/witnesses (#526) | **Integrated** — §11, reuses the canonical engine as the largest event in its table. |
| Diplomacy/treaties | **Integrated** — new `arms_control_pact` treaty kind, §12. |
| Alliances | **Deferred** — no extended-deterrence mechanic in v1 (Non-goals; follow-up candidate). |
| AI strategic warnings | **Integrated** — §9's diplomacy-panel caution note. |
| Fog-of-war | **Integrated** — target legality requires the target city already discovered, §6. |
| Hot-seat | **Integrated** — §15 dedicated threat model. |
| Domination/victory checks | **Intentionally unaffected** — a strike grants no victory progress and blocks none; ruin-not-delete means no civ-elimination interaction exists to check. |
| Achievements/quests | **Deferred** — no strike-specific quest/achievement hook in v1. |
| Catastrophe/devastation (crisis-system) | **Integrated** — §8 reuses the same tile primitive; strike-caused and catastrophe-caused devastation on the same tile behave identically to two overlapping catastrophes today (later claim is skipped while an earlier timer is still live — existing `crisis-system.ts` guard, unchanged). |
| Save/load | **Integrated** — §16. |
| Map-size scaling | **Intentionally unaffected** — Silo's unlimited range and the sub's fixed 4-hex range don't scale with map size in v1; flagged as a balance-pass check, not a design gap, since existing unit ranges also don't scale with map size today. |
| Late-era pacing | **Integrated via Balance review below** — zero net yield change by construction (§1–§3 are additive, not replacements). |

## Balance review

The building-role design (§3) deliberately preserves every currently-live `yields`/
`civYieldBonus` value on Manhattan Project, Nuclear Arsenal, Missile Silo, Strategic Air
Command, and Arms Control Treaty unchanged — new mechanical fields (capacity, platform,
readiness, cap-unlock) are added as orthogonal properties, the same way
`coastalRequired`/`resourceRequired`/`nationalProject` already coexist with a building's
yields. This is a deliberate choice to avoid triggering `pacing-reference-economy.test.ts`
snapshot churn: the implementation MR must confirm (not merely assert) that
`pacing-audit.test.ts`'s full-catalog outlier gate and the reference-economy snapshot
produce **zero** diffs from this change, proving the additive approach actually worked.
Arsenal isn't meant to be obviously dominant over conventional military — its scarcity
(capacity ceiling + per-item production cost) and lack of interception counter-play are
balanced against its one-shot, ruin-not-delete effect and the severe reputation/treaty
cost of using it; conventional siege remains the only way to actually capture territory.

## Determinism

All strike-related RNG (if any is needed for exact tile selection within the blast
radius) and all AI launch/retaliation/caution scoring key off `state.turn` plus the
actor/target civ IDs, following crisis-system's existing `seededLcg(state.turn * 65599 +
hashString(...))` pattern — no `crisis.id` equivalent exists for a strike, so the seed
input is `` `${actorId}:${targetCityId}` `` or equivalent stable string. No wall-clock or
`Math.random` anywhere in this feature.

## Test matrix

**Settings**: solo default on; hot-seat explicit selection; off-mode filters every
strategic verb from production/AI/UI while keeping buildings buildable; legacy save
(`undefined` field) resolves to off regardless of solo/hot-seat, independent of what a
new game would default to; save/load round-trips the setting.

**Production**: Manhattan Project gates Build Warhead and capacity-granting buildings'
effective capacity; uranium required; capacity computed live, never stored; Build Warhead
is absent/disabled from the production catalog at capacity with an explanatory reason —
never queueable-then-rejected; losing a capacity-granting building mid-game does not
retroactively delete already-produced warheads above the new lower capacity, it only
blocks further production while over cap (mirrors §12's cap-violation rule exactly); AI
produces under the same rules as the player, scored by the existing `ai-production.ts`
pipeline with no special-cased branch.

**Platforms**: Silo range is unlimited game-wide; sub range is 4 from current position;
destroying a Silo city removes that platform's contribution immediately; a concealed sub
remains a valid launch platform for its own owner while hidden from rivals;
capability-driven eligibility (a hypothetical future platform type needs no branch,
verified by testing the resolver against the typed field, not a unit-type switch).

**Strike**: legal target (at war, discovered city) succeeds; illegal target (not at war,
undiscovered, no arsenal, no platform) is rejected with a specific reason; preview values
match execution values exactly; city floors per `preventDestruction: true` (never
`destroyed`, even past `citySiegeDestructionEra` on the owner's non-last city, even at
veteran); garrisoned target blocks the floor damage; repeated strikes on a recovering
city behave identically to repeated conventional sieges; last-city/capital edge cases
never destroy; hot-seat targeting only ever shows the acting player's own legal-target
list.

**Devastation**: radius/duration values land where specified; overlapping strike +
catastrophe devastation on the same tile follows the existing "don't reclaim a live
timer" guard; cleanup/expiry matches the existing catastrophe expiry path; save/load
round-trips `devastatedUntilTurn` regardless of which system set it.

**Diplomacy**: witness list matches `hasMetCivilization` exactly; first-use vs.
retaliation deltas differ as specified; cap-treaty violation fires the treaty-break path,
not the launch path; an unmet civ never appears as a witness or is affected.

**Arms control**: cap enforcement blocks production, not launch of already-built
warheads; violation is detected at production-attempt time; AI respects an active cap in
its own production scoring; legacy saves with no treaty of this kind behave as if none
exists (no retroactive cap).

**AI**: explorer never first-strikes across a large seeded-scenario sweep; standard only
ever launches after being struck; veteran's existential-threat gate is a 3-way
conjunction (capital HP below threshold, hostile land unit adjacent, no relief within
range) — per `.claude/rules/spec-fidelity.md`'s conjunctive-resolution testing rule, this
needs pairwise coverage, not just "each condition alone is insufficient": all three
present (fires), and each of the three 2-of-3 combinations with exactly one condition
missing (does not fire), proving every condition is independently load-bearing rather
than two of them already being sufficient in practice; AI never launches with zero
justification at any difficulty; identical mechanics/legality/information boundaries
verified byte-for-byte across all three difficulties (only scoring/threshold constants
differ); AI target scan is bounded to already-discovered cities of at-war civs only,
verified against a large map to catch an accidental unbounded scan; AI proposes/accepts
`arms_control_pact` only when it can see both sides have known capability, never against
an unarmed civ.

**Hot-seat**: hidden arsenal/platform never leaks through overlay, target-range preview,
disabled-action reason text, notification, or audio cue to a non-witnessing sibling;
pending launch-flow state clears on handoff; cap-treaty availability never reveals a
rival's hidden count; the new `warchief` "Strategic Arsenal" panel section shows only
`state.currentPlayer`'s own totals/platforms on every handoff, never a stale render of
the previous player's data.

**Determinism**: identical seed produces identical AI launch/retaliation/target choices
across runs; save/load mid-decision does not alter the eventual AI choice; no
`Math.random`/`Date.now` anywhere in the diff.

**Balance**: `pacing-audit.test.ts` and `pacing-reference-economy.test.ts` produce zero
diffs from this change; arsenal is not the dominant late-game strategy in simulated
play; arms control has a rational AI adoption rate above zero; superweapons-off remains a
complete, non-truncated late-game tech tree.

## Implementation phasing (rough MR shape — refined into the formal plan next)

1. Arsenal/capacity data model + Manhattan Project unlock flag + Build Warhead
   production item (no launch yet).
2. `strategicLaunchPlatform` capability + Missile Silo/Missile Submarine wiring +
   targeting legality (§6) with no strike effect yet (dry-run/preview only).
3. Strike resolution reusing `city-siege-system.ts` (§7) + fallout (§8).
4. Reputation/witness wiring (§11) + launch UX flow (§14) + the `warchief` "Strategic
   Arsenal" summary panel.
5. AI doctrine (§10) + deterrence-caution conventional-behavior factor (§9).
6. Arms control treaty type + cap enforcement (§12) + AI acceptance scoring.
7. `superweapons` setting + off-mode filtering + content-honesty text pass (§13, all
   descriptions).
8. Hot-seat privacy pass (§15) + save/migration verification (§16) + full balance/pacing
   re-audit + full test-matrix closure.

**Incremental-delivery constraint (`.claude/rules/incremental-mr-completion.md`) —
caught in this review's second pass:** Phase 1 alone would ship a player-visible "Build
Warhead" production item with no way to ever use what it produces until Phase 3–4 land —
not a broken button, but an indefinitely-inert one, which the rule treats the same way.
Phases 1–4 (data model through launch UX + the summary panel) must therefore either (a)
land as a single PR/merged unit, or (b) if split into separate PRs for review size, every
PR before the last one in that range keeps "Build Warhead" and the arsenal panel behind a
feature flag (`superweapons`-style settings flag defaulting off in an intermediate,
not-yet-player-facing state) until Phase 4 completes the full path — never shipped
player-visible with no consumer. The formal implementation plan (next) must encode
whichever of (a)/(b) it chooses explicitly per MR, per that rule's PR-title/body
requirements.

## Follow-ups (deliberately deferred, to be filed as separate issues at implementation
time, not buried as TODOs)

- Extended deterrence to allies (a third civ's caution factoring in an ally's arsenal).
- Any richer arms-control mechanic beyond the single bilateral cap (non-first-use pacts,
  non-proliferation, inspections).
- Achievement/quest hooks specific to strategic weapons.
- Map-size-scaled platform ranges, if late playtesting shows the fixed 4-hex sub range
  feels wrong on very large maps.
