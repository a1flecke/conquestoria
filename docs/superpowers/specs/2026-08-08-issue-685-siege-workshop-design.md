# #685 Siege Workshop Classical Siege Family Design

## Goal

Keep Siege Workshop's city-local 20% training-cost reduction correct after
Trebuchet joined the classical siege line. A city with Siege Workshop reduces
the production cost of Catapult, Ballista, and Trebuchet; it does not reduce
unrelated units or gunpowder successors.

## Design

The canonical roster role metadata is the source of truth. Extend its typed
`productionDiscountFamily` union with `classical-siege`, then assign that
family only to Catapult, Ballista, and Trebuchet. The production-cost resolver
will apply the existing 0.80 multiplier only when that family is
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

## Inline Cross-Dimension Review

| Dimension | Review and resolution |
| --- | --- |
| Balance and fun | This repairs a missed successor rather than raising the 20% value or widening the era window. It makes the established siege choice consistent without creating a new economic advantage. |
| New mechanics and play styles | No new mechanic is introduced. Turtle and siege-focused players receive the same city-local incentive whether they choose Ballista or Trebuchet; rush, mixed, and naval strategies remain unaffected. |
| Ages 7–43 | The building description names every discounted unit and uses the existing plain-language percentage. No new control, hidden state, or terminology is added. |
| Difficulty and computer players | The shared production-cost path is used for every civilization. AI production receives the same legal cost calculation and no difficulty-specific exception or hidden information is introduced. |
| UI and UX | The already-visible production catalog uses the canonical production-cost result, so its price updates without a new UI surface. The description precisely explains the discounted family at the decision point. |
| Architecture and extensibility | A dedicated typed discount family separates the classical era boundary from the broader `siege` upgrade family, which includes Cannon. The resolver uses the same data-driven pattern as mounted discounts. |
| Data, SFX, and saves | Only static roster metadata and text change. No runtime state, serialized schema, migration, sprite, or sound asset changes are needed. |
| Testing and regressions | Test-first coverage will prove all three eligible units, an unrelated unit, and Cannon's explicit exclusion; existing Black Powder obsolescence coverage remains. This covers solo and hot-seat because both use the same city production resolver. |
| Implementation discipline | Keep the existing 0.80 best-discount rule and city-local scope. Do not alter unit availability, upgrade chains, tech gates, or AI policy. |
