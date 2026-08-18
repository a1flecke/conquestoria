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
  already described as "hunts submarines."
- `pacing.role: 'naval-stealth'` is already tagged on submarine's pacing metadata —
  content already anticipated this; it is currently just a label, not wired to any
  mechanic.
- #547 (the parallel combat-roster arc, open, most of 63 items merged through #837)
  already fixed the "absurd `pre_dreadnought → submarine` upgrade" #542 flagged —
  submarine has no incoming/outgoing `upgradesTo` today. No open #547 work touches
  naval/detection files, so this feature is low-conflict with it as of this audit.

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

**Difficulty knob precedent:** `OpponentChallengeProfile`
(`core/opponent-challenge.ts`) has an existing `crisisDispatchWeight`-style per-difficulty
multiplier (explorer 0.5 / standard 1.0 / veteran 1.5) consumed by
`ai-crisis-response.ts`. No AI escort/formation logic exists yet at all.

**Typed-capability precedent:** `UnitDefinition.airDefenseProvider?:
AirDefenseProviderCapability` (radius + modifier + stacking group) is the existing
pattern for "this unit projects an area effect around itself" — the template for the new
detection field below, instead of `if (unit.type === 'destroyer')` branches.

**Buildings:** `signals_hub` (era 12, `cyber-intelligence` + `cyber_defense_center`) is an
espionage/CDC building that already makes stealth bombers targetable within 2 hexes. It
is 3 eras later than submarines and thematically an air/cyber building, not naval — not a
good fit for ASW detection (would be a content-honesty stretch and confuses two unrelated
stealth systems). No naval-specific detection building exists.

## Goals

- Submarines/missile subs are concealed from an enemy civ unless detected.
- Detection is adjacency-based for ordinary units/cities (matching the existing
  beast/forest convention exactly) and extended (range 2) for the destroyer, via a
  generic, extensible capability field.
- Every consumer (fog, renderer, targeting, selection, AI perception, AI targeting,
  last-seen) agrees on concealment through one canonical predicate.
- A concealed sub is illegal to target directly, for every attacker type, enforced at the
  canonical targeting chokepoint (not just hidden in the renderer).
- When a sub is no longer detected, the last-seen system shows a stale "last observed
  here" ghost, never a live position — reusing the existing mechanism.
- Hot-seat visibility is strictly per-viewer; no presentation/selection/last-seen state
  leaks between human players.
- No save schema change — visibility stays fully derived.
- AI never targets or "knows" a sub it hasn't detected; it may act on its own
  `remembered` last-seen intel like any other remembered unit.
- Veteran AI escorts vulnerable naval civilians with a destroyer when it has sighted a
  submarine threat; explorer AI does not. Difficulty changes decision quality only —
  never detection range, visibility rules, or combat modifiers.
- Destroyer and submarine descriptions plainly explain the mechanic and the counterplay.

## Non-goals

- No sonar simulation, no probabilistic detection, no submarine-vs-submarine special
  detection rule.
- No new building or tech (`signals_hub` deliberately excluded; no new "sonar" tech).
- No carrier detection role — nothing in current combat-role text, modifiers, or roster
  identity supports it; not assumed just because #542's design sketch parenthetically
  floated it.
- No attack-from-stealth/first-strike bonus in v1. The existing commerce-raider,
  capital-ship-ambush, and Torpedo Warfare modifiers plus "the defender couldn't
  pre-target you" already give stealth attacks initiative. Explicitly deferred pending
  playtesting evidence, not silently dropped — see Balance section.
- No AI restructuring beyond one new difficulty-scaled portfolio rule for escort
  preference.

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

### 2. Submarine concealment rule

```ts
function isSubmarineConcealedFrom(state, unit, viewerCivId): boolean {
  if (unit.type !== 'submarine' && unit.type !== 'missile_submarine') return false;
  const detectionRange = (detectorUnitType) =>
    UNIT_DEFINITIONS[detectorUnitType].detection?.concealedNavalRange ?? 1;
  // true if no viewer unit or city is within its own detection range of `unit`
}
```

- Ordinary units and cities detect at range 1 (adjacency) — identical convention to
  beast/forest concealment, chosen deliberately for consistency and explainability over
  a bespoke number.
- Air units, civilian naval units, and cities all count as "ordinary detectors" at range
  1 — no per-domain carve-out, since the existing beast rule already treats "any adjacent
  unit" uniformly.
- Submarines do not get a special "detect other submarines" rule — they detect at the
  ordinary range-1 rule like everything else, avoiding a stealth-detects-stealth arms
  race the issue explicitly warned against simulating.
- Embarked/cargo units never detect (already excluded everywhere via `!u.transportId`,
  consistent with `game-systems.md`'s transport-cargo rules).
- Allied/shared-vision behavior falls out of `state.civilizations[viewerCivId].units`
  scoping exactly as today — no new alliance-vision behavior is introduced.

### 3. Destroyer as the ASW specialist

Add to `UnitDefinition` (`core/types.ts`):

```ts
export interface NavalDetectionCapability {
  concealedNavalRange: number;
}
// on UnitDefinition:
detection?: NavalDetectionCapability;
```

`destroyer: { ..., detection: { concealedNavalRange: 2 } }` in `unit-system.ts`. Generic
and data-driven — a future sonar tech, ASW aircraft, or building adds another
`{ concealedNavalRange }` source (taking the max across sources, same pattern as
`getVisionBonus`) without touching `attack-targeting.ts`, the renderer, or AI code. Not
implementing any of those future sources now — just leaving the shape open, per the
task's explicit "don't build speculative future systems" instruction.

No building or tech grants detection in v1 (see Non-goals).

### 4. Targeting

`canUnitAttackTarget`'s existing unconditional beast-concealment line becomes:

```ts
if (isUnitConcealedFrom(state, targetUnit[1], attacker.owner)) return { ok: false, reason: 'not-visible' };
```

This makes a concealed submarine illegal to target for every attacker (human, AI,
pirate) by construction — no separate AI-side legality code needed, matching how beast
concealment already works today.

### 5. Rendering / selection / last-seen / AI perception

All migrated to call `isUnitConcealedFrom` instead of the two-predicate AND:
`unit-map-presentation.ts`, `hex-defender-selection.ts`, `viewer-event-presentation.ts`,
`cross-cutting-helpers.ts`'s `scanBeastSightings` (extended to the general case),
`espionage-stealth.ts`'s `getVisibleUnitsForPlayer`, `last-seen-presentation.ts`'s
`visibleUnitsByTile` (also closes the latent beast-concealment gap there), and
`ai-perception.ts`'s `buildMajorCivPerception` unit loop (also closes its
beast-concealment gap for symmetry).

Net effect: concealed → not rendered, not selectable, not targetable, not present in AI's
`visible` unit set. Detected → normal rendering/selection/targeting. No-longer-detected →
existing last-seen ghost only (last snapshot taken while the tile was `visible`), since
`isUnitConcealedFrom` is folded into `visibleUnitsByTile` the same way as forest
concealment already is — a concealed sub is never snapshotted as "present," so ghosts can
only ever show a stale prior position, never a live one.

### 6. Hot-seat

No new mechanism — `isUnitConcealedFrom` takes an explicit `viewerCivId`, and every
consumer above already threads a per-viewer id (`state.currentPlayer` for the active
seat, or `getLivingHumanViewerIds` for two-human presentation building in
`viewer-event-presentation.ts`). Two-human regression tests (Phase 3) assert this
directly: civ A detects, civ B (no detector nearby) does not, and switching the active
seat does not leak A's detection into B's render/selection/last-seen state.

### 7. AI perception vs. targeting vs. escort

- **Targeting:** free correctness via §4 — AI cannot target a concealed sub, structurally.
- **Perception:** AI's `MajorCivPerception.units` excludes submarine-concealed subs from
  the `visible` set (§5); it may still carry a `remembered` entry from
  `actor.visibility.lastSeen`, decayed by `decayRememberedConfidence`, exactly like any
  other remembered unit today. No special-casing for submarines in the decay model.
- **Escort behavior (new):** one portfolio rule added to AI planning — when a civ has at
  least one `remembered`-or-better submarine sighting (owner hostile to the AI) and an
  un-escorted transport/naval-civilian unit within some radius of that sighting, prefer
  building or routing a nearby destroyer to it. Gated by a new
  `OpponentChallengeProfile.submarineEscortWeight` field (explorer low/off, standard
  modest, veteran strong), following the existing `crisisDispatchWeight` pattern exactly.
  Difficulty changes only how eagerly this preference is applied — not detection range,
  visibility, or combat modifiers, per the task's explicit constraint.

### 8. Save/load

No schema change. Everything above is derived every turn from unit positions,
`UNIT_DEFINITIONS[type].detection`, and per-civ unit/city rosters — identical in spirit
to how beast and forest concealment already work with zero persisted "is concealed" flag.
Verified by an explicit save→reload→re-derive test (Phase 3) rather than assumed.

### 9. Content honesty

- `UNIT_DESCRIPTIONS.submarine`: state plainly that it's hidden from enemies unless they
  get close or field a destroyer (fixes the existing unbacked "stealth approach" claim).
- `UNIT_DESCRIPTIONS.destroyer`: state plainly that it reveals submarines at longer range
  than ordinary ships, with the exact range number.
- No color-only or icon-only indicators — text explains the mechanic per
  `strategy-game-mechanics.md`'s unit-identity rule and the task's "no trial-and-error
  discovery" instruction.

## Balance review (before adding any bonus)

Per the task's instruction, run the loop with current combat values before deciding on
an ambush bonus:
1. Lone submarine vs. unescorted naval civilian.
2. Lone submarine vs. destroyer-escorted convoy.
3. Wolfpack (2+ subs) vs. mixed fleet.
4. Submarine operating near an enemy city (city itself detects at range 1).
5. Missile submarine late-game (range 3 attack, era 11 stats).
6. Island-heavy map — does adjacency detection make non-destroyer escorts meaningfully
   useful, or does only destroyer coverage matter?
7. AI convoy/escort behavior once Phase 4 lands.
8. Detection-heavy fleet (multiple destroyers) — does stealth still matter, or does
   coverage trivialize it?

Decision to add or omit an attack-from-concealment bonus is made after this review, not
before, and is reported explicitly either way — see Implementation Strategy.

## Implementation phases

- **Phase 1:** `isUnitConcealedFrom` canonical contract + submarine stealth rule
  (ordinary range-1 detection only) wired through targeting, rendering, selection,
  last-seen, AI perception, hot-seat presentation. Fully deployable on its own — subs are
  concealable and every consumer agrees, even before the destroyer specialization exists.
- **Phase 2:** Destroyer `detection.concealedNavalRange: 2` + `UNIT_DESCRIPTIONS` updates
  for submarine/destroyer.
- **Phase 3:** Two-human hot-seat tests, scenario fixtures
  (`submarine-undetected`, `destroyer-sonar-detection` — reusing #846 infrastructure),
  full regression suite (beast/forest concealment unchanged, targeting, save/load,
  AI target legality).
- **Phase 4:** AI escort portfolio rule + `submarineEscortWeight` difficulty knob;
  balance review against the 8 scenarios above; explicit decision on the ambush bonus.

Each phase leaves the game in a valid, fully-wired state — no phase ships a renderer-only
or targeting-only half of the concealment contract.

## Test matrix (see task prompt's full matrix — summarized here as spec commitment)

Concealment, targeting, movement, last-seen, hot-seat, AI, save, UI, and regression
coverage as enumerated in the issue. Regression coverage for beast and forest concealment
is mandatory given the shared-predicate refactor — both existing test suites must still
pass unmodified in behavior, only in implementation path.
