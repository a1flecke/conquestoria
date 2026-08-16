# Issue 698 Camp-Local Pressure Design

**Issue:** #698 — Add camp-local armor and air pressure observations
**Parent:** #547, Wave 5
**Status:** Approved
**Base:** `origin/main` at `efce4a05aad3350f7b91614fde9e512d0c340cae`

## Goal

Persist fair, coarse knowledge that a barbarian camp has encountered nearby armor or air
pressure. The data prepares #699's reinforcement chooser without allowing omniscient or
stale counter-spawns.

## Data model

Add a serializable plain-object record keyed by camp ID. Each value has only optional
last-observed turn numbers:

```ts
interface BarbarianCampPressure {
  armorLastObservedTurn?: number;
  airLastObservedTurn?: number;
}
```

The record must never retain unit IDs, coordinates, owners, aircraft bases, combat logs,
or copied `Unit` objects. A pressure kind is active when its observation is at most ten
turns old. The boundary is inclusive: an observation from turn `T` is usable through
turn `T + 10` and expires at `T + 11`.

## Canonical observation rules

The pressure module exposes focused observation, normalization, and active-fact helpers;
it does not own combat execution, camp assignment, or save orchestration. “Visible to a
camp” means within the existing camp sensing radius through the camp or a unit assigned to
that camp. It never means globally present in `GameState` or visible to a human player.

- Armor is recorded only when a sensed armored unit is within six hexes of the camp, or
  when a non-barbarian attacker attacks a unit whose current home-camp assignment is that
  camp.
- Air is recorded only when a sensed aircraft has a valid `airBase` and its base is within
  six hexes of the camp, or when a non-barbarian air strike resolves against a tile within
  six hexes of the camp. The strike's canonical resolution payload, rather than a final
  state scan, supplies this provenance.
- Distant, unsensed, unbased, transported, destroyed, or stale entities cannot create
  either fact.
- Recording a fact only updates that camp and pressure kind. Repeated observations renew
  its turn rather than stack counters.
- Destroying a camp removes its pressure record in the same canonical mutation. Cleanup
  also removes records for absent camps during normalization.

## Integration and safety

The observation helper returns a new state and receives the current turn explicitly.
Combat and turn-flow callers invoke it only from their existing mutation paths, so a
single attack or strike records at most one fact and a repeated render cannot re-emit it.
The active-fact query is pure and returns only `armor` and/or `air`; it cannot disclose a
unit, base, position, owner, or source action. A future unit type participates through
typed combat-role and air-operation metadata, never a unit-ID branch.

## Information, difficulty, and player experience

The record is camp-owned world state, not human-specific intelligence. It creates no new
panel, notification, audio cue, animation, or clickable action in this issue, so it
cannot leak facts at a hot-seat handoff. Explorer, Standard, and Veteran use identical
collection, expiry, persistence, and legality rules. Difficulty does not grant a camp
hidden observations.

## Save compatibility

Add the next save schema version only after this branch has been based on current main.
The migration initializes the record to `{}`. Normalization accepts missing legacy data,
removes malformed values and unknown camp IDs, rejects non-finite/negative turn values or
values later than the saved turn, and is idempotent. Migration tests use schema-0, schema
13 (the immediately previous schema on this rebased base), current saves, malformed
input, and an in-progress turn save. The current-schema round trip must preserve valid
pressure facts and must not retain a stale record for a destroyed camp.

## Scope boundary

This issue does not alter the live barbarian roster, spawn cadence, force composition,
combat resolution, AI strategy, production catalog, UI, renderer, or audio. #699 alone
may pass active coarse facts to the already-dark #697 composer and introduce bounded
adaptive reinforcements.

## Tests

Use test-first regressions for armor sensing/range and assigned-camp attack provenance;
based-aircraft and strike-impact provenance; global, distant, unsensed, unbased, and
transported negative cases; renewal and expiry boundaries; destruction cleanup;
serialization and migration; and proof that stored pressure contains only coarse scalar
facts. Include solo Explorer/Standard/Veteran parity and a two-human hot-seat save/reload
fixture proving that the record creates no current-viewer UI, notification, audio, or
animation leak.
