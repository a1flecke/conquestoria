# #685 Siege Workshop Classical Siege Family Design

## Goal

Keep Siege Workshop's city-local 20% training-cost reduction correct after
Trebuchet joined the classical siege line. A city with Siege Workshop reduces
the production cost of Catapult, Ballista, and Trebuchet; it does not reduce
unrelated units or gunpowder successors.

## Design

The canonical roster role metadata is the source of truth. The production-cost
resolver will query the trainable unit's typed `productionDiscountFamily` and
apply the existing 0.80 multiplier only when that family is
`classical-siege` and the city has `siege-workshop`.

This replaces the current hard-coded Catapult/Ballista unit list. It matches
the family-driven mounted-discount pattern already used in the same resolver,
so subsequent classical-siege additions cannot silently miss the Workshop.

The building's player-facing description will name the complete current
family: Catapult, Ballista, and Trebuchet. Its `black-powder` obsolescence
remains unchanged, so the Workshop cannot discount Cannon or later artillery.

## Boundaries

- No unit definitions, upgrade chains, building availability, or balance
  values change.
- The discount remains city-local and remains the existing non-stacking best
  applicable multiplier.
- No new save data or migration is required: the behavior derives solely from
  catalog metadata and existing city buildings.

## Tests

- Prove each current `classical-siege` unit receives exactly the 20% Workshop
  discount.
- Prove an unrelated unit receives no Workshop discount.
- Prove a gunpowder successor is not classified as `classical-siege` and
  receives no Workshop discount.
- Preserve the existing Black Powder obsolescence coverage.
