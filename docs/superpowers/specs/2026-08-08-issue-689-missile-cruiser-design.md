# Issue 689 Missile Cruiser Design

## Goal

Add Missile Cruiser as the Era 11 capital-ship successor: a high-mobility, range-three
fire-support ship that gives adjacent friendly forces +10 defense against air attacks
without becoming a same-era strict upgrade or removing the submarine answer.

## Roster contract

- Add `missile_cruiser` at Carrier Warfare, Radar Systems, and Rocketry: cost 285,
  strength 70, movement 5, vision 3, and ranged attack range 3 against units and cities.
- Require a coastal city to produce it and show it through the ordinary, complete
  production catalogue; no recommendation may hide another legal production choice.
- Extend the explicit fighting-line chain to
  `Pre-Dreadnought → Battleship → Missile Cruiser`. Battleship becomes obsolete only
  when the complete three-technology Missile Cruiser gate is satisfied. A new explicit
  all-of obsolescence field and shared `isUnitObsolete` helper will drive catalogue
  visibility, production-queue removal, upgrade integrity, and save-loaded queues; the
  existing single-tech field remains compatible for every other unit.
- The unit is capital fire support, not a replacement for Destroyer's escort role,
  Carrier's air base, or Submarine's undersea strike role. Submarines retain their
  documented capital-ship ambush advantage against Missile Cruiser.

## Typed air-defense rule

Missile Cruiser declares a typed `airDefenseProvider` capability with radius 1, a flat
`+10` defense modifier, the existing air-defense stacking group, and an explicit
`protectedDomains: ['naval']` scope. The canonical coverage resolver continues to select
the strongest available provider, rather than summing overlapping Missile Cruisers or
combining Missile Cruiser with weaker Mobile Anti-Air or Anti-Air Battery coverage.
Existing providers retain their current all-domain behavior when that optional scope is
absent. The new scope prevents a ship parked by a coast from shielding adjacent land
troops, making "fleet anti-aircraft" true in the rules as well as the description.

The rule is derived from serializable unit definitions and current game state. It does
not create cached coverage state, a new event, random behavior, a save version, or a
Missile-Cruiser-specific combat branch. The shared combat context supplies its applied
and superseded facts to both combat execution and preview, so every caller uses the same
result.

## Player experience, UI, and privacy

The first player-facing description sentence will explain the role in plain language:
"Fast capital fire support that protects nearby ships from aircraft." It will also state
the exact +10 radius-one anti-aircraft value, the three technology requirements, the
explicit upgrade direction, and submarine vulnerability through the existing expandable
unit, production, and combat-fact surfaces. Carrier Warfare remains the primary unlock
catalogue entry; until Radar Systems and Rocketry are also complete, that surface names
the missing requirements instead of presenting Missile Cruiser as buildable.

No new button, queue model, panel, or persistent UI state is introduced. Existing
production presentation remains the full legal catalogue and refreshes normally after
production or upgrade state changes. Existing combat preview/result views must render
the applied or superseded anti-air fact, using text alongside the existing icon. The
coverage fact follows the existing viewer-scoped redaction path: it must not reveal an
inactive hot-seat player's aircraft, provider, or otherwise hidden unit.

## AI, difficulty, and play styles

AI discovers Missile Cruiser through the same trainable-unit and strategic-role
catalogues as human players. Its typed roles include naval combat, escort, and air
defense, so research, coastal-city production, and fleet-escort positioning do not need
a Missile-Cruiser ID branch. The escort helper targets visible strike aircraft and
eligible nearby friendly naval units only; hidden aircraft and adjacent land units
cannot create an action or alter the ranking. Explorer, Standard, and Veteran retain
identical unit values, legality, combat math, coverage, and information boundaries;
difficulty may only influence already-typed decision-quality fields.

Casual players receive a single readable reason to build the unit, while optimizers keep
the exact modifier and strongest-source facts. Builders can choose coastal investment,
defenders can protect a fleet against visible air threats, and opponents retain the
affordable submarine counter. The unit must not make Destroyer, Mobile Anti-Air, or
Submarine strategically obsolete.

## Visuals, audio, saves, and determinism

The mechanics delivery registers valid existing naval sprite and audio fallbacks through
the ordinary catalogues; bespoke visual and audio work remains separate. Air defense
has visible/text combat facts, so it does not rely on sound, motion, or color alone;
existing mute, volume, reduced-motion, and hot-seat privacy behavior remains in force.

Static unit/tech metadata and derived coverage require no save migration. Old saves stay
valid, existing Battleships remain valid, and queued Battleships only become obsolete
when all three new prerequisites are complete. Export/import remains a plain-object
round trip. Every evaluation is deterministic.

## Boundaries and failure cases

- Completing one or two prerequisites never makes Missile Cruiser trainable or
  obsoletes Battleship; all three are required.
- A non-coastal city cannot produce it, and loss of coastal access dequeues an invalid
  Missile Cruiser using the shared city-processing path.
- Radius-zero, hostile, cargo, and out-of-range providers do not defend a target.
- Missile Cruiser protects only adjacent friendly naval defenders; a nearby land unit
  and a city defender receive no Missile Cruiser defense.
- Only air attackers receive the defense; land and naval attackers do not.
- Multiple applicable providers use the strongest single value, and a weaker source is
  visibly represented as superseded rather than silently summed.
- Submarine and missile-submarine capital-ship counters include Missile Cruiser; other
  surface ships do not gain that vulnerability merely by sharing an era or range.
- AI support behavior stays bounded to observable threats and cannot leak fog-of-war or
  another hot-seat player's information.

## Verification and regressions

Focused regressions will prove the exact unit, production, technology, chain, coastal,
and sprite/audio catalogue entries; all three prerequisite positives and each missing
prerequisite negative; Battleship availability under every partial gate and retirement
only under the complete gate; range-three fire support; capital-ship submarine counter
and non-capital negative; naval-only radius-one +10 coverage; strongest-source facts;
land, city, non-air, and out-of-range negatives; AI research/production/visible-threat
fleet-escort behavior; human and non-human shared combat paths; solo and two-human
viewer isolation; and save/queue round trips with no schema change.

The delivery will run the mirrored unit, city, tech, modifier, combat-context, AI,
renderer/UI, and storage tests as applicable, then source-rule checks, TypeScript build,
durable full-suite status, and committed/uncommitted diff review.
