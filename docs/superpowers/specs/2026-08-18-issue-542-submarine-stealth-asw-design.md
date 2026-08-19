# Issue #542 — Submarine Stealth + Anti-Submarine Detection Loop

## Problem

Submarines (`submarine`, `missile_submarine`) are always visible today, so their combat
identity is stat-only: Torpedo Warfare +8 strength, ×1.5 vs naval civilians ("commerce
raider"), ×1.25 vs autonomous frigates/battleships/missile cruisers ("ambush"), and the
destroyer's ×1.25 anti-submarine multiplier. The destroyer's counter has nothing to hunt
— a target that can't hide isn't hunted, it's just fought. `UNIT_DESCRIPTIONS.submarine`
already claims "stealth approach" with no backing mechanic (a `content-description-honesty.md`
violation this design fixes rather than creates).

## Current architecture (audited 2026-08-18 against `origin/main`, HEAD == merge-base)

**Roster today** (`unit-system.ts`, `city-system.ts`, `combat-role-definitions.ts`,
`unit-modifier-definitions.ts`):
- `submarine` — era 9 (`submarine-warfare`), coastal-required, ocean-only, str 52,
  range 2, vision 2, role `capital-ship`, `upgradeFamily: 'submarine'` (terminal).
- `missile_submarine` — era 11 (`nuclear-submarines` + uranium), str 56, range 3,
  vision 3, same family, terminal.
- `destroyer` — era 10 (`carrier-warfare`), str 55, range 2, vision 3, role `escort`,
  already described as "hunts submarines." `obsoletedByTech: 'ocean-robotics'`,
  `upgradesTo: 'autonomous_frigate'`.
- `autonomous_frigate` — era 13 (`ocean-robotics`), str 60, range 3, role `escort`,
  terminal successor of the surface-warship/escort family. Currently has no detection
  capability of its own (none exists yet) — a real gap once wired, since
  `UNIT_DEFINITIONS` fields never auto-propagate through `upgradesTo` chains, and
  upgrading a destroyer would otherwise silently remove the player's only ASW specialist.
- `pacing.role: 'naval-stealth'` is already tagged on submarine's pacing metadata —
  content already anticipated this; currently just a label, not wired to any mechanic.
- #547 (the parallel combat-roster arc, open, most of 63 items merged through #837)
  already fixed the "absurd `pre_dreadnought → submarine` upgrade" #542 flagged —
  submarine has no incoming/outgoing `upgradesTo` today. No open #547 work touches
  naval/detection files, so this feature is low-conflict with it as of this audit.

**Coastal/detection-adjacent buildings and techs already in the tree:**
- `coastal_battery` (era 8, `naval-armor` tech, `coastalRequired: true`) — "Naval defense
  +8. First naval hit each turn returns 20% damage." Lands one tech tier before
  submarines appear (era 9) — a natural, already-thematic gate for baseline city
  detection.
- `radar_station` (era 10, `radar-systems` tech) — description already says
  *"Accelerates navigation and threat detection"*, but today does nothing
  detection-related (+2 science only). This is an existing, unrelated
  `content-description-honesty.md` gap this design also fixes by giving that claim a
  real mechanic.
- `signals_hub` (era 12, `cyber-intelligence` + `cyber_defense_center`) — deliberately
  **not** reused for subs. It's 3 eras later than submarines, thematically an
  espionage/cyber building for stealth bombers, and reusing it would be a content-honesty
  stretch. No naval-specific detection building beyond `coastal_battery`/`radar_station`
  exists, and none is being invented.

**Concealment today:** two independent, hand-duplicated predicates, each re-implemented
at the call site rather than through one canonical hook:
- `isBeastConcealedFrom(beast, map, viewerUnits)` (`beast-system.ts`) — hidden while on
  habitat terrain and no viewer unit adjacent (distance 1).
- `isForestConcealedUnit(state, viewerId, unit)` (`fog-of-war.ts`) — hidden while on
  forest terrain and no viewer unit/city adjacent, gated by a civ bonus.

Call sites that AND both together today, each with a slightly different call shape:
`attack-targeting.ts`, `hex-defender-selection.ts`, `ai-perception.ts`,
`last-seen-presentation.ts`, `viewer-event-presentation.ts`,
`unit-map-presentation.ts` (renderer), `cross-cutting-helpers.ts` (beast only),
`espionage-stealth.ts`'s `getVisibleUnitsForPlayer` (beast only, also handles spy
disguise). A third concealment family needs to touch the same ~7 files today unless
consolidated first — this is the fragmentation risk #542 warned about, confirmed real.

**Targeting is a single chokepoint.** `canUnitAttackTarget` (`attack-targeting.ts`) is
called by every attacker: human input, AI (`ai-major-turn.ts`, `ai-tactics.ts` via
`getAttackTargets`), and pirates (`pirate-system.ts`). Its beast-concealment check is
**unconditional** — it does not depend on a caller-supplied `viewerId`; "viewer" is
derived from `attacker.owner`'s own units. Generalizing this one check therefore makes
every attacker type respect the new rule for free, with zero AI-specific targeting code.

**AI perception** (`ai-perception.ts`, `buildMajorCivPerception`) separately re-checks
`isForestConcealedUnit` (not beast-concealment) when building the AI's `visible`-vs-
`remembered` unit list, and already treats last-seen entries as `confidence: 'remembered'`
with age-based decay via `decayRememberedConfidence` — the "uncertain memory, not live
truth" contract already exists structurally.

**Last-seen** (`last-seen-presentation.ts`) snapshots a tile's units only while
`getVisibility(...) === 'visible'`, and already filters out forest-concealed units before
snapshotting, so a ghost never shows a currently-concealed unit as present. It does not
yet filter beast-concealed units (latent gap, harmless today since beasts rarely sit on a
"visible" tile while concealed, but should close for symmetry when subs are added).

**No per-turn "did this unit attack" tracking exists.** `Unit.hasActed` is generic (set by
any action — build, found, attack, move-to-exhaustion) and resets each turn; there is no
attack-specific flag and no persisted combat history in `GameState` to derive one from.
This matters directly for reveal-on-fire (§2 below).

**Difficulty knob precedent:** `OpponentChallengeProfile`
(`core/opponent-challenge.ts`) has an existing `crisisDispatchWeight`-style per-difficulty
multiplier (explorer 0.5 / standard 1.0 / veteran 1.5) consumed by
`ai-crisis-response.ts`. No AI escort/formation logic and no "avoid detection" tactical
preference exist yet at all.

**Typed-capability precedent:** `UnitDefinition.airDefenseProvider?:
AirDefenseProviderCapability` (radius + modifier + stacking group) is the existing
pattern for "this unit projects an area effect around itself" — the template for the new
detection field below, instead of `if (unit.type === 'destroyer')` branches.

## Goals

- Submarines/missile subs are concealed from an enemy civ unless detected.
- Detection is adjacency-based (range 1) for ordinary naval and air units, and for cities
  that have built `coastal_battery`; extended to range 2 for the destroyer and for a
  `coastal_battery` city that has also built `radar_station`; extended to range 3 for
  `autonomous_frigate` (destroyer's era-13 successor, keeping the ASW role alive through
  the upgrade chain and matching `missile_submarine`'s attack range). **Land units never
  detect submarines** — there is no real-world or in-game equipment/doctrine reason a
  land garrison would spot a submerged submarine; only naval units, air units, and
  properly-equipped cities can.
- A submarine that fires while concealed reveals its own tile to the defending civ for
  that turn only (a genuine, mechanically real return-fire window — not merely cosmetic),
  re-concealing automatically once the attacker's owner's next turn resets it. This reveal
  is a deliberate `GameState`-level fact, not a per-viewer overlay: **any** civ with fog
  visibility of that tile — not just the one attacked — can see and, if hostile, target
  the revealed submarine that turn ("an attack is loud"). It is also strictly per-unit:
  if multiple submarines share a tile, only the one that fired is revealed — its stacked
  packmates stay concealed, matching how concealment already coexists with visible units
  on the same tile elsewhere (e.g. forest).
- A submarine visible only because it just fired is presented distinctly from one visible
  because it's actively within a detector's range (badge/wording difference — "spotted
  momentarily" vs. "tracked") so the one-turn window reads as a deliberate mechanic, not a
  disappearing-unit glitch.
- A first ordinary-proximity detection (not a fire-triggered reveal, which announces
  itself via combat) fires a sighting notification, mirroring the existing
  `beast:sighted` pattern, so detection is never silent or easy to miss — especially for
  younger players.
- Every consumer (fog, renderer, targeting, selection, AI perception, AI targeting,
  last-seen) agrees on concealment through one canonical predicate.
- A concealed sub is illegal to target directly, for every attacker type, enforced at the
  canonical targeting chokepoint (not just hidden in the renderer).
- When a sub is no longer detected, the last-seen system shows a stale "last observed
  here" ghost, never a live position — reusing the existing mechanism.
- Hot-seat visibility is strictly per-viewer; no presentation/selection/last-seen state
  leaks between human players.
- No combat-notification text change. `routeCombatResolved` (`src/ui/notification-routing.ts`)
  already names the attacking civilization (not unit type) to the defender for every attack
  in the game today — verified by reading it, not assumed. Reveal-on-fire already makes the
  submarine render normally on the map that turn, so the player learns it was a submarine
  visually, the same way they'd learn any other unit's type; special-casing extra detail
  into the toast copy for submarines only would be inconsistent with how every other unit's
  attack is announced. (Earlier drafts of this spec assumed the notification needed a
  wording change — corrected after reading the actual code.)
- Existing `mass-surveillance` behavior (reveals fog tile visibility for at-war units, but
  does not today defeat forest/beast concealment) is left exactly as-is — submarine
  concealment is exempt from it too, matching current precedent rather than quietly
  redefining an existing tech's scope as part of this feature.
- AI never targets or "knows" a sub it hasn't detected; it may act on its own
  `remembered` last-seen intel like any other remembered unit.
- AI-controlled submarines prefer ending a turn outside all known enemy detection ranges
  when a position doing so is reachable without sacrificing a good attack.
- Veteran AI both prioritizes building a destroyer when it has sighted a submarine threat
  and lacks one, and routes an available destroyer to escort a vulnerable naval civilian
  near that sighting; explorer AI does neither. Difficulty changes decision quality only
  — never detection range, visibility rules, or combat modifiers.
- Destroyer, submarine, `autonomous_frigate`, and `radar_station` descriptions plainly
  explain the mechanic and the counterplay.

## Non-goals

- No sonar simulation, no probabilistic detection, no submarine-vs-submarine special
  detection rule.
- No new buildings or techs — reuses `coastal_battery` and `radar_station` exactly as
  they exist today, with no changes to either building's own gating (in particular,
  `radar_station` is not given a new `requiresBuildings` entry, since it is also a
  prerequisite for `sam_site` and touching its gating would ripple into the unrelated
  AA/air-defense system).
- No carrier detection role — nothing in current combat-role text, modifiers, or roster
  identity supports it; not assumed just because #542's design sketch parenthetically
  floated it.
- No attack-from-stealth/first-strike *combat* bonus in v1, distinct from reveal-on-fire
  (which is a visibility mechanic, not a damage multiplier). The existing commerce-raider,
  capital-ship-ambush, and Torpedo Warfare modifiers plus "the defender couldn't
  pre-target you" already give stealth attacks initiative. Explicitly deferred pending
  playtesting evidence, not silently dropped — see Balance section.
- No change to `mass-surveillance`'s existing (arguably already-inconsistent) relationship
  with concealment — out of scope for this feature, flagged but not touched.
- No AI restructuring beyond: one new difficulty-scaled escort portfolio rule (production
  + tactical routing) and one new tactical "avoid detector range" preference for AI subs.

## Design

### 1. Canonical concealment contract

New module `src/systems/concealment.ts`:

```ts
export function isUnitConcealedFrom(
  state: GameState,
  unit: Unit,
  viewerCivId: string,
): boolean {
  if (unit.owner === viewerCivId) return false;
  const viewerUnits = state.civilizations[viewerCivId]?.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u) && !u.transportId) ?? [];
  return isBeastConcealedFrom(unit, state.map, viewerUnits)
    || isForestConcealedUnit(state, viewerCivId, unit)
    || isSubmarineConcealedFrom(state, unit, viewerCivId);
}
```

This is a fold-in point, not a rewrite: each family keeps its own internal predicate and
rules; `isUnitConcealedFrom` is what every call site should use going forward. All ~7
existing call sites are migrated to call this instead of hand-rolling the AND of two
imports. `attack-targeting.ts`'s check is not viewer-scoped by an explicit option today
(it derives the "viewer" from `attacker.owner`) — the migrated call keeps that same
implicit-owner-as-viewer shape (`isUnitConcealedFrom(state, target, attacker.owner)`) so
behavior for targeting is unchanged except for the new submarine branch.

Note for implementation: the `viewerUnits` array shown above (all non-transport units,
no domain filter) is what `isBeastConcealedFrom` expects — it is **not** passed through
to `isSubmarineConcealedFrom`. The submarine predicate takes `(state, unit, viewerCivId)`
and derives its own, differently-filtered detector set internally (naval/air units only,
plus eligible cities — see §2), because its eligibility rules are not the generic
"any owned unit" rule the other two families use. Do not reuse the generic filtered array
for the submarine branch.

### 2. Submarine concealment rule

```ts
function isSubmarineConcealedFrom(state, unit, viewerCivId): boolean {
  if (unit.type !== 'submarine' && unit.type !== 'missile_submarine') return false;
  if (unit.revealedThisTurn) return false; // reveal-on-fire, see below
  // concealed unless a viewer naval/air unit, or an eligible viewer city, is within
  // ITS OWN detection range of `unit` (max across all such detectors)
}
```

- **Eligible detectors:** viewer-owned naval and air units (ordinary detection range 1
  unless the unit has `UnitDefinition.detection`), plus viewer cities that have built
  `coastal_battery` (range 1, or range 2 if the same city has also built
  `radar_station`). **Land units are never detectors** — no submerged submarine can be
  spotted by unaided visual observation, and there is no equipment/doctrine reason a land
  garrison would detect one; only cities (representing harbor watch/coastal batteries) and
  naval/air units (visual lookout, later sonar/radar) have a real basis for this.
- `destroyer`: `detection: { concealedNavalRange: 2 }`.
- `autonomous_frigate`: `detection: { concealedNavalRange: 3 }` — deliberately bumped
  past the destroyer's range (not just carried forward unchanged), since by era 13
  `missile_submarine` (era 11, attack range 3) already outranges a range-2 detector; this
  keeps the dedicated ASW specialist role meaningfully ahead of the threat it's meant to
  counter, not just parity with it.
- Submarines do not get a special "detect other submarines" rule — they detect at the
  ordinary range-1 rule like everything else, avoiding a stealth-detects-stealth arms
  race the issue explicitly warned against simulating.
- Embarked/cargo units never detect (already excluded everywhere via `!u.transportId`,
  consistent with `game-systems.md`'s transport-cargo rules).
- Allied/shared-vision behavior falls out of `state.civilizations[viewerCivId].units`
  scoping exactly as today — no new alliance-vision behavior is introduced.
- `mass-surveillance` is explicitly left unable to defeat this, matching existing
  forest/beast precedent (see Non-goals).

**Reveal-on-fire.** A submarine's ranged attack profile (range 2/3) means, unlike beast/
forest concealment (both effectively melee-range today), it can fire without ever
becoming adjacent to a detector — an "invisible sniper" gap with no counterplay if left
unaddressed. To close it: when a concealed submarine successfully attacks, the attack
resolution path sets a new field, `Unit.revealedThisTurn?: boolean`, on the attacking
unit (alongside the existing `hasActed` mutation in the same combat-resolution code).
While set, `isSubmarineConcealedFrom` returns `false` unconditionally for every viewer —
the submarine is genuinely visible and targetable that turn, not merely flashed
cosmetically, satisfying "every consumer must agree." The field is cleared the same way
`hasActed` already resets each turn (owning civ's next turn-start reset), so the window is
exactly "the rest of the current round," giving the defending civ one real turn to react
before concealment resumes. No combat-notification copy change is needed or made — the
existing generic notification (civ name, not unit type) plus the visual reveal on the map
already communicate this; see Goals for why a unit-type-specific wording change was
considered and rejected. This is the one deliberate,
minimal, justified addition to `GameState`'s shape in this feature (see §9 — every other
piece stays fully derived).

**Must be set in the shared combat-resolution helper, not per-caller.** Combat is
executed from at least three places — human input, `ai-major-turn.ts`'s `executeAttack`,
and pirate attacks via `pirate-system.ts`. Per `end-to-end-wiring.md`'s "Shared State
Mutations must be actor-complete" rule, `revealedThisTurn` must be set inside the one
canonical combat-resolution function all three paths call through (`combat-system.ts`),
not duplicated at each call site — otherwise an AI- or pirate-triggered submarine attack
could silently skip the reveal while a human-triggered one doesn't. Add a parity
regression proving both a human-attack path and an AI-attack path set the field
identically (per `end-to-end-wiring.md`'s existing convention for shared consequences).

### 3. City detection (`coastal_battery` + `radar_station`)

No city detects submarines by default. A city becomes a detector only once it has built
`coastal_battery` (range 1); if that same city has also built `radar_station`, its range
extends to 2. This is purely additive logic in the new detection resolver — **no change
to either building's own `requiresBuildings`, `techRequired`, or other fields.** This
also finally gives `radar_station`'s existing "Accelerates navigation and threat
detection" description a real backing mechanic (§10).

### 4. Targeting

`canUnitAttackTarget`'s existing unconditional beast-concealment line becomes:

```ts
if (isUnitConcealedFrom(state, targetUnit[1], attacker.owner)) return { ok: false, reason: 'not-visible' };
```

This makes a concealed submarine illegal to target for every attacker (human, AI,
pirate) by construction — no separate AI-side legality code needed, matching how beast
concealment already works today. A submarine with `revealedThisTurn` set is a normal,
targetable unit for the rest of that round.

### 5. Rendering / selection / last-seen / AI perception / notifications

All migrated to call `isUnitConcealedFrom` instead of the two-predicate AND:
`unit-map-presentation.ts`, `hex-defender-selection.ts`, `viewer-event-presentation.ts`,
`cross-cutting-helpers.ts`'s `scanBeastSightings` (extended to the general case),
`espionage-stealth.ts`'s `getVisibleUnitsForPlayer`, `last-seen-presentation.ts`'s
`visibleUnitsByTile` (also closes the latent beast-concealment gap there), and
`ai-perception.ts`'s `buildMajorCivPerception` unit loop (also closes its
beast-concealment gap for symmetry).

**Sighting notification.** A new function analogous to (but not merged with)
`scanBeastSightings` — call it `scanSubmarineSightings` — fires a notification the first
time an enemy submarine transitions from concealed to detected via ordinary proximity
(not via reveal-on-fire, whose attack itself is already the notification). This is
deliberately a *separate* function rather than a generalization of `scanBeastSightings`:
beast sightings drive bespoke beast-specific consequences (quest/lore hooks via
`recordBeastSightings`) that submarines have no equivalent of, and forest concealment has
no sighting-notification precedent to preserve — merging all three into one generic
"any concealment family, any consequence" function would be over-generalizing a
one-off need into speculative shared infrastructure the task explicitly warned against.

Net effect: concealed → not rendered, not selectable, not targetable, not present in AI's
`visible` unit set. Detected (proximity or reveal-on-fire) → normal rendering/selection/
targeting, with a notification on first proximity detection. No-longer-detected →
existing last-seen ghost only (last snapshot taken while the tile was `visible`), since
`isUnitConcealedFrom` is folded into `visibleUnitsByTile` the same way as forest
concealment already is — a concealed sub is never snapshotted as "present," so ghosts can
only ever show a stale prior position, never a live one.

**Reveal-state UI cue.** A submarine visible solely due to `revealedThisTurn` (fired,
temporary) is presented distinctly from one visible because it's within a detector's
persistent range (tracked, stays visible as long as the detector holds position) — a
badge and differing status text ("Spotted momentarily" vs. "Tracked by [detector]"), not
just identical rendering in both cases. Without this, a player could reasonably believe
they've permanently found the submarine and be confused when it vanishes next turn.

### 6. Hot-seat

No new mechanism — `isUnitConcealedFrom` takes an explicit `viewerCivId`, and every
consumer above already threads a per-viewer id (`state.currentPlayer` for the active
seat, or `getLivingHumanViewerIds` for two-human presentation building in
`viewer-event-presentation.ts`). `Unit.revealedThisTurn` is a genuine `GameState` fact
(not a per-viewer overlay), so it is visible to every civ equally once set — this is
correct, since a submarine firing is not secret information relative to who saw it fire;
it's the submarine's own concealment status that changed, symmetric to how a beast
breaking cover by attacking is visible to whichever civs have fog visibility of that tile.
Two-human regression tests (Phase 3) assert per-viewer isolation directly: civ A detects,
civ B (no detector nearby) does not, and switching the active seat does not leak A's
detection into B's render/selection/last-seen state; a separate test confirms
`revealedThisTurn` is symmetric (any civ with fog visibility of that tile sees the reveal,
not just the one that "caused" it).

### 7. AI: perception, targeting, piloting, and escort

- **Targeting:** free correctness via §4 — AI cannot target a concealed sub, structurally.
- **Perception:** AI's `MajorCivPerception.units` excludes submarine-concealed subs from
  the `visible` set (§5); it may still carry a `remembered` entry from
  `actor.visibility.lastSeen`, decayed by `decayRememberedConfidence`, exactly like any
  other remembered unit today. No special-casing for submarines in the decay model.
- **AI submarine piloting (new):** when choosing a final position for an AI-controlled
  submarine, prefer a reachable end-of-turn tile outside all currently-known enemy
  detection ranges, unless doing so would sacrifice a clearly better attack — a narrow
  tactical preference, not a full stealth-planning system.
- **AI escort behavior (new):** one portfolio rule with two parts, both gated by a new
  `OpponentChallengeProfile.submarineEscortWeight` field (explorer low/off, standard
  modest, veteran strong), following the existing `crisisDispatchWeight` pattern exactly:
  1. *Production:* when a civ has at least one `remembered`-or-better hostile submarine
     sighting and no available destroyer, prioritize training one — without this, the
     tactical rule below would be a dead rule on any game where the AI hadn't already
     built a destroyer for unrelated reasons. Per `end-to-end-wiring.md`'s "AI content
     catalogs must stay generic" rule, this must be a score boost within `ai-production.ts`'s
     existing candidate-scoring mechanism (the same kind of weighting
     `crisisDispatchWeight`-style knobs already apply elsewhere), not a special-cased
     queue-jump or a new one-off production branch.
  2. *Tactical routing:* when a civ has an available destroyer and an un-escorted
     transport/naval-civilian unit near a remembered submarine sighting, prefer routing
     the destroyer to it.
  Both parts source their "remembered submarine sighting" from `MajorCivPerception.units`
  (`ai-perception.ts`), not raw `civ.visibility.lastSeen` — `buildMajorCivPerception`
  already excludes any sighting once `decayRememberedConfidence(age) <= 0`, so staleness
  is handled for free by the existing decay math. No new confidence/decay threshold is
  invented for this feature; an occasional wasted response to an aging-but-not-yet-decayed
  sighting is acceptable AI imperfection, not a bug.
  Difficulty changes only how eagerly this preference is applied — never detection range,
  visibility, or combat modifiers, per the task's explicit constraint.

### 8. Save/load

One deliberate, minimal schema addition: `Unit.revealedThisTurn?: boolean` (§2), optional
and `undefined`-safe on old saves, requiring no migration — an absent value is simply
"not currently revealed by fire," identical in effect to `false`. Every other piece of
this feature (submarine concealment status, destroyer/frigate detection range, city
`coastal_battery`/`radar_station` gating) is derived every turn from unit/city state and
`UNIT_DEFINITIONS[type].detection` — identical in spirit to how beast and forest
concealment already work with zero persisted "is concealed" flag. Verified by an explicit
save→reload→re-derive test (Phase 3) rather than assumed.

### 9. Content honesty

- `UNIT_DESCRIPTIONS.submarine`: state plainly that it's hidden from enemies unless they
  get close, field a destroyer, or a coastal city with the right buildings spots it —
  fixes the existing unbacked "stealth approach" claim.
- `UNIT_DESCRIPTIONS.destroyer`: state plainly that it reveals submarines at longer range
  than ordinary ships, with the exact range number.
- `UNIT_DESCRIPTIONS.autonomous_frigate`: same, with its own (longer) range number.
- `BUILDINGS.radar_station.description`: extend to mention the coastal detection-range
  bonus it now actually grants (in combination with `coastal_battery`), finally backing
  its existing "threat detection" claim.
- No color-only or icon-only indicators — text explains the mechanic per
  `strategy-game-mechanics.md`'s unit-identity rule and the task's "no trial-and-error
  discovery" instruction.

## SFX

Deferred to the audio-arc backlog, per the issue's own addendum — an optional sonar ping
on reveal is not required for correctness and is out of scope for this feature.

## Balance review (before adding any combat bonus)

Per the task's instruction, run the loop with current combat values before deciding on
an ambush *combat* bonus (reveal-on-fire is a visibility mechanic already committed to,
not a combat-strength bonus, and is not what this review is deciding):
1. Lone submarine vs. unescorted naval civilian.
2. Lone submarine vs. destroyer-escorted convoy.
3. Wolfpack (2+ subs) vs. mixed fleet — does reveal-on-fire meaningfully cap how many
   consecutive free attacks a wolfpack gets before some defender can respond? Specifically
   check the "safety in numbers" case: since reveal-on-fire is strictly per-unit (§2),
   stacking multiple submarines on one tile and rotating which one fires each turn means a
   player never exposes more than one unit at a time — confirm this doesn't make stacked
   wolfpacks trivially safer than the loop intends, and if it does, that's a stacking-policy
   question, not a reason to revisit the per-unit reveal decision itself.
4. Submarine operating near an enemy city — with `coastal_battery`/`radar_station` city
   gating now explicit, does an under-built coastline still feel fair, or does the
   all-or-nothing building gate make early-game coastal cities too exposed?
5. Missile submarine late-game (range 3 attack, era 11 stats) vs. `autonomous_frigate`
   (era 13, range-3 detection) — confirm the era 11–13 window where missile subs outrange
   every available detector except reveal-on-fire.
6. Island-heavy map — does adjacency detection make non-destroyer naval escorts
   meaningfully useful, or does only destroyer/frigate coverage matter?
7. AI convoy/escort behavior once Phase 4 lands, including the new production trigger.
8. Detection-heavy fleet (multiple destroyers) — does stealth still matter, or does
   coverage trivialize it?

Decision to add or omit an attack-from-concealment *combat* bonus is made after this
review, not before, and is reported explicitly either way — see Implementation Strategy.

## Implementation phases

- **Phase 1:** `isUnitConcealedFrom` canonical contract + submarine stealth rule
  (naval/air-unit range-1 detection only; land units excluded; cities are not detectors
  at all yet — not "cities detect without the building gate," but genuinely deferred to
  Phase 2) +
  reveal-on-fire (`Unit.revealedThisTurn` field, combat-resolution wiring, plain-text
  notification) wired through targeting, rendering, selection, last-seen, AI perception,
  hot-seat presentation. Fully deployable on its own — subs are concealable, attacking
  from concealment has a real, mechanically-enforced return-fire window, and every
  consumer agrees, even before the destroyer/city specialization exists.
- **Phase 2:** Destroyer `detection.concealedNavalRange: 2`, `autonomous_frigate`
  `detection.concealedNavalRange: 3`, `coastal_battery`/`radar_station` city detection
  gating, sighting notification (`scanSubmarineSightings`), and all `UNIT_DESCRIPTIONS`/
  `radar_station` description updates.
- **Phase 3:** Two-human hot-seat tests (including `revealedThisTurn` symmetry), scenario
  fixtures (`submarine-undetected`, `destroyer-sonar-detection` — reusing #846
  infrastructure), full regression suite (beast/forest concealment unchanged, targeting,
  save/load, AI target legality).
- **Phase 4:** AI escort portfolio rule (production trigger + tactical routing) +
  `submarineEscortWeight` difficulty knob + AI submarine "avoid detector range" piloting
  preference; balance review against the 8 scenarios above; explicit decision on the
  attack-from-concealment combat bonus.

Each phase leaves the game in a valid, fully-wired state — no phase ships a renderer-only
or targeting-only half of the concealment contract.

## Test matrix

**Concealment:** enemy submarine hidden outside detection; adjacent ordinary naval/air
unit reveals it; land units adjacent do *not* reveal it; destroyer specialist detection
works at range 2; `autonomous_frigate` at range 3; outside specialist range remains
hidden; city with no `coastal_battery` never detects; city with only `coastal_battery`
detects at range 1; city with `coastal_battery` + `radar_station` detects at range 2;
owner always sees own submarine; unrelated distant civ cannot see it; `mass-surveillance`
does not defeat submarine concealment (matching forest/beast precedent).

**Reveal-on-fire:** a concealed submarine that attacks becomes targetable/visible that
turn to every civ with fog visibility of its tile; `revealedThisTurn` clears at the
attacking civ's next turn-start reset; existing combat notification text is unchanged
(no unit-type special-casing); symmetric across hot-seat viewers (not scoped to "the civ
that got attacked" only); a
third civ (not the one attacked) with fog visibility and at war with the sub's owner can
also target the revealed sub that turn; two stacked submarines where only one fires
result in exactly one revealed/targetable unit, the other remaining concealed; a human
attack path and an AI attack path both set `revealedThisTurn` identically (parity
regression); the UI shows a distinct "spotted momentarily" cue for a fire-revealed
submarine versus "tracked" for one within a detector's persistent range.

**Targeting:** concealed submarine cannot be directly targeted; detected (proximity or
reveal-on-fire) submarine can be targeted; human and AI use same legality; naval-domain
restrictions still work.

**Movement:** moving detector into range reveals; moving detector away conceals again;
submarine movement updates detection correctly.

**Last seen:** observed submarine creates appropriate last-seen information after
disappearance; ghost remains at old position, not live position; rediscovery updates
memory correctly.

**Hot seat:** A detects, B does not; handoff does not leak; last-seen information remains
viewer-specific; `revealedThisTurn` reveal is correctly symmetric, not leaked further than
fog visibility already allows.

**AI:** AI cannot target undetected submarine; AI can target detected submarine; AI
production prioritizes a destroyer when a threat is sighted and none is available, via a
score boost in the existing candidate-scoring mechanism (not a special-cased queue-jump);
AI routes an available destroyer to escort near a sighting at higher difficulty; AI
submarines prefer ending turns outside detector range when it doesn't cost a good attack;
AI does not use hidden current location when only last-seen data exists.

**Save:** save/load preserves correct derived visibility; `revealedThisTurn` round-trips
correctly (or is absent, which is equivalent to `false`) across save/reload.

**UI:** submarine description explains stealth and its counters; destroyer and
`autonomous_frigate` descriptions explain detection range; `radar_station` description
explains its coastal detection bonus; sighting notification fires and is legible; a
fire-revealed submarine shows the "spotted momentarily" cue and a detector-tracked
submarine shows the "tracked" cue, distinctly.

**Regression:** existing beast concealment still works; forest concealment still works;
ordinary fog-of-war unchanged; missile cruiser/naval targeting regressions do not
reappear; land units still cannot detect or improperly attack naval units; `sam_site`'s
existing `radar_station` prerequisite is untouched.
