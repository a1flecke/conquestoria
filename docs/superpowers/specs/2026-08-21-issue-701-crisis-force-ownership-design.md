# Issue 701 Crisis-Force Ownership Design

## Purpose

Issue #701 supplies the reusable ownership foundation for the Beast Stampede and Rogue
Elephant Host. It introduces a persistent, non-diplomatic crisis-force identity without
making those actors barbarian camps, rebels, pirates, fake civilizations, or legendary
beast-lair units.

This slice deliberately does not spawn a Stampede or Rogue Host, add their unit types,
or add player-facing crisis UI. Those behaviors belong to issues #702–#707.

## Architecture

Add `crisis` to the canonical `OwnerKind` boundary and reserve a stable owner ID
(`crisis-force`) for all crisis-owned units. It is always hostile to every distinct
owner, has no diplomacy or civilization record, and cannot receive normal civilization
combat rewards.

`src/systems/crisis-force-system.ts` is the lifecycle boundary. It owns the typed,
serializable `crisisForces` registry, creates force-owned units, answers ownership and
presentation predicates, and normalizes persisted force state. Callers use its
predicates rather than treating `beasts` as a general neutral-owner category.

Each record has an ID, a target civilization, controlled unit IDs, the turn created,
and a pressure-severity snapshot (`explorer`, `standard`, or `veteran`). Human targets
snapshot their own personal challenge; AI targets always snapshot `standard`. This
prevents a later difficulty setting change or another hot-seat player's challenge from
changing an already announced crisis. The record is intentionally the smallest common
state required by both future crisis types; their route, warning, command, reward, and
resolution data remain owned by their respective systems.

The foundation exposes a neutral, readable presentation identity (`Crisis Force`, with
a dedicated high-contrast color) for unit selection and map rendering. It does not add
a warning panel, route overlay, sound, or toast: those only occur once an actual crisis
has earned a recipient-scoped fact in later issues.

## Contract

1. `classifyOwner('crisis-force')` returns `crisis`; the ID is not classified as a
   major civilization, pirate, rebel, barbarian, or beast.
2. A crisis force is mutually hostile with every different owner, including minor
   civilizations, while two crisis-force units are not hostile to each other.
3. Existing movement safety, targeting, fog-visible hostile queries, city-pressure
   checks, and AI hostility obtain crisis hostility through the canonical owner-kind
   helpers. AI treats a visible crisis force as hostile regardless of the optional
   `aiContestsBeasts` setting.
4. A human or major-AI unit can attack a crisis unit through the ordinary combat path.
   Normal civilization combat rewards may be awarded to the victor; crisis owners never
   receive treasury rewards, capture defeated units, be captured as a prize, or require
   a civilization entry. Future crisis actions must use the same rule, so a crisis unit
   always destroys rather than captures a civilian it defeats.
5. Crisis-owned units are not added to `Civilization.units`, do not take a civilization
   turn, and are not passed into beast-lair processing. Future crisis turn sources will
   reset and act on them explicitly.
6. The registry may contain only force records with a non-empty ID, a target that is an
   existing non-eliminated major civilization, a valid pressure-severity snapshot, and
   one or more unit IDs that currently identify crisis-owned units. A crisis-owned unit
   must belong to exactly one record. Records are normalized in lexical record-ID order:
   duplicate unit IDs retain their first valid membership; invalid IDs are dropped; an
   empty record is removed; and every remaining orphan crisis-owned unit is removed.
7. Save migration adds the optional registry for legacy saves, advances the save schema,
   and is idempotent. Loading malformed persisted registry data cannot leave malformed
   crisis actors in state.
8. Any notification caused by future crisis processing must use the established
   recipient-scoped delivery path. This foundation must not create or reveal crisis
   facts to another hot-seat player.
9. Crisis ownership does not change unit strength, combat modifiers, visibility range,
   action economy, or AI difficulty. Difficulty affects only future force composition
   and scheduling from its per-target snapshot. This keeps the mechanic learnable for
   younger players and tactically consistent for expert players.

## Error Handling and Boundaries

Normalization is conservative and total: it never trusts save input to establish an
owner relationship. A malformed record contributes no membership, and only units whose
actual owner is `crisis-force` may survive registry normalization. A unit named by more
than one otherwise valid record belongs to the lexicographically first valid record.
After the registry is normalized, unreferenced crisis-owned units are deleted. No
cleanup rewrites a normal unit into a crisis unit or changes civilian ownership.

The force registry is plain serializable state. It carries no callbacks, class instances,
or references to unit objects. Deleting a force record never deletes an unrelated unit.
The presentation helper is data-only: it supplies a label and color, and deliberately
does not infer an event, play SFX, or expose a target civilization.

## Test Matrix

- Owner-kind classification, hostility symmetry, reward eligibility, movement safety,
  AI hostility with beast contesting disabled, and non-hostility between crisis units.
- Player and AI combat against a crisis unit, proving the shared combat path does not
  create a fake civilization, permit a crisis capture, or permit a prize capture of a
  crisis unit.
- Force registration and cleanup for valid state, each severity snapshot, AI-standard
  severity, unknown/eliminated target, missing unit, wrong-owner unit, duplicate unit
  ID, duplicate membership, empty record, and orphan crisis unit.
- Save migration from legacy, malformed saved data, and a second migration pass with
  identical output; migration must preserve every unrelated unit and civilization.
- Solo and two-human hot-seat coverage where each target snapshots only its own
  challenge. A current-player handoff and later personal-difficulty change must not
  alter a pre-existing record or surface its target through the neutral owner label.
- Selected-unit/map presentation coverage proving a crisis unit has the readable neutral
  label and dedicated color, while no warning, toast, or SFX is emitted by ownership
  registration alone.

## Non-goals

- Stampede/Host spawn gates, actor stats, routes, movement, combat rules, warnings,
  rewards, audio, overlays, and resolution.
- Generalizing legendary beast lairs or changing their optional AI-contest behavior.
- New trainable units, diplomacy screens, or save-format changes beyond the crisis-force
  registry and its normalization.
