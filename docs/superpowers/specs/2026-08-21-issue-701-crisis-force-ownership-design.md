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
serializable `crisisForces` registry, creates force-owned units, answers ownership
predicates, and normalizes persisted force state. Callers use its predicates rather
than treating `beasts` as a general neutral-owner category.

The initial record has an ID, a target civilization, and its controlled unit IDs. This
is intentionally the smallest common state required by both future crisis types;
their route, warning, command, reward, and resolution data remain owned by their
respective systems.

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
   receive treasury rewards, capture defeated units, or require a civilization entry.
5. Crisis-owned units are not added to `Civilization.units`, do not take a civilization
   turn, and are not passed into beast-lair processing. Future crisis turn sources will
   reset and act on them explicitly.
6. The registry may contain only force records whose target is an existing major
   civilization and whose unit IDs currently identify crisis-owned units. A crisis-owned
   unit must belong to exactly one record. Invalid records, duplicate memberships, and
   orphan crisis-owned units are removed deterministically.
7. Save migration adds the optional registry for legacy saves, advances the save schema,
   and is idempotent. Loading malformed persisted registry data cannot leave malformed
   crisis actors in state.
8. Any notification caused by future crisis processing must use the established
   recipient-scoped delivery path. This foundation must not create or reveal crisis
   facts to another hot-seat player.

## Error Handling and Boundaries

Normalization is conservative: a malformed record is removed along with units that
claim only that invalid record; a unit named by more than one otherwise valid record
belongs to the lexicographically first valid record and is removed from later records.
No cleanup rewrites a normal unit into a crisis unit or changes civilian ownership.

The force registry is plain serializable state. It carries no callbacks, class instances,
or references to unit objects. Deleting a force record never deletes an unrelated unit.

## Test Matrix

- Owner-kind classification, hostility symmetry, reward eligibility, movement safety,
  and AI hostility with beast contesting disabled.
- Player and AI combat against a crisis unit, proving the shared combat path does not
  create a fake civilization or permit capture by the crisis owner.
- Force registration and cleanup for valid state, unknown target, missing unit,
  wrong-owner unit, duplicate membership, and orphan crisis unit.
- Save migration from legacy, malformed saved data, and a second migration pass with
  identical output.
- Hot-seat notification-delivery regression proving this shared foundation retains
  recipient scoping when a force event is delivered later by its owning crisis system.

## Non-goals

- Stampede/Host spawn gates, actor stats, routes, movement, combat rules, warnings,
  rewards, audio, overlays, and resolution.
- Generalizing legendary beast lairs or changing their optional AI-contest behavior.
- New trainable units, diplomacy screens, or save-format changes beyond the crisis-force
  registry and its normalization.
