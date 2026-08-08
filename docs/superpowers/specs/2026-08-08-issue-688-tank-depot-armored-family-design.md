# Issue 688 Tank Depot Armored Family Design

## Review outcome

The original design left several implementation-critical points implicit: the current typed family field is production-only, city healing is evaluated during turn processing, the building description is the only existing player-facing explanation, and passive effects must remain deterministic and hot-seat private. This revision makes those contracts explicit.

## Goal

Make the Tank Depot's local production and healing benefits data-driven for the typed armored family without changing unit legality or applying those benefits to anti-armor or air-defense units.

## Scope

The Tank Depot will grant the following local effects to Armored Car, Tank, Mechanized Infantry, and Main Battle Tank:

- 10% production-cost reduction while the unit is produced in the city.
- +5 healing for an eligible unit stationed in the city.

Anti-Tank Gun and Mobile Anti-Air remain outside the armored family and receive neither benefit. The existing Main Battle Tank combined-arms bonus remains independent of Tank Depot ownership.

## Gameplay and player experience

Tank Depot is a late-industrial specialization, not a new action or a mandatory global upgrade. It rewards players who establish an armored production and repair hub while leaving anti-armor and mobile air defense as distinct counter/support choices. The 10% cost reduction and +5 city healing must be meaningful but bounded: they do not alter combat strength, movement, eligibility, resource gates, upgrades, or the Main Battle Tank's adjacent-line-infantry combined-arms effect.

The building description must state both benefits in plain language, name the four eligible unit types, and name the two exclusions only where the surrounding catalog already presents exact eligibility. It must not rely on an icon, sound, color, or unexplained “family” label. This keeps the benefit understandable to younger/casual players while preserving exact values for optimizing players.

## Architecture and data design

The implementation will extend the existing typed unit-family modifier path. The unit role definition will add the armored value to the existing `productionDiscountFamily` union; Armored Car, Tank, Mechanized Infantry, and Main Battle Tank will opt into it. A typed local-infrastructure configuration will associate Tank Depot with that family, a 0.90 production multiplier, and a +5 city-healing bonus.

The production-cost evaluator and the existing turn-time healing evaluator will consume the same family/configuration data. No evaluator will branch on `tank_depot` or on a list of unit IDs. The helper must select the strongest applicable local building modifier rather than applying a Tank Depot effect twice; existing unrelated production discounts retain their documented combination behavior.

This preserves one authoritative definition of armored membership. Production, city healing, player-facing descriptions, and future infrastructure can rely on the same family metadata without duplicating eligibility checks.

## AI, difficulty, and play styles

Explorer, Standard, and Veteran use identical Tank Depot legality, discounts, healing, and information boundaries. Difficulty receives no hidden production or healing bonus. AI production already consumes city-aware cost/eligibility facts; this change must leave it on that path, so an AI city with a Tank Depot values eligible armored candidates through the real discounted cost, while an AI city without one does not. The passive healing uses the same turn manager as human units and does not require an AI-only action or privileged map knowledge.

Builder players gain a localized infrastructure payoff; aggressive and combined-arms players gain a repair base; defensive players can recover armored defenders; counter-focused players retain Anti-Tank Gun and Mobile Anti-Air as intentionally undiscounted alternatives. No play style is blocked from building or responding to armored units.

## UI, UX, and SFX

No new panel, button, queue, filter, or animation is introduced. Existing city production and building-description surfaces must present the updated Tank Depot text before the player commits production. The existing selected-unit/city information continues to show the unit and city state without inventing a transient badge that could become stale. Since the modifier is passive and may apply to many units each turn, it emits no SFX, toast, or per-turn notification; the written building description is the accessible feedback channel.

## Saves, hot seat, and determinism

This is a definition-only change. Tank Depot already persists in each city's `buildings` array, and units already persist their type and position, so no save-schema migration is required. A loaded save containing a Tank Depot gains the corrected local effects on its next normal production-cost or healing evaluation; a save without one remains unchanged. No derived modifier state is persisted.

The logic is deterministic and makes no random choices. In solo play, the player and AI use the same helpers. In hot seat, the effect is calculated only from the acting unit's friendly city and publicly owned city-building state; it creates no notification, log, sound, or preview that could reveal an inactive player's unit condition or city composition.

## Boundaries and failure cases

- The Tank Depot remains a city-local building; its effects do not apply elsewhere in the civilization.
- Multiple qualifying effects must obey the existing modifier stacking rule; this change must not introduce a second Tank Depot-derived application.
- The production discount must not change a unit's technology, building, resource, coastal, or other production prerequisites.
- The healing bonus applies only when the unit is actually stationed in the qualifying city.
- A qualifying unit in a friendly city without Tank Depot, an excluded unit in a Tank Depot city, and a qualifying unit outside the city receive no Tank Depot healing bonus.
- Anti-Tank Gun and Mobile Anti-Air stay outside the armored family even if both have similar era, movement, or combat roles.
- The feature adds no new action, queue behavior, or filtered catalog surface. Existing production and unit information must stay truthful through their current data-driven descriptions.

## Verification and regressions

Focused regressions will prove:

- every eligible armored type receives exactly the 10% local production reduction, and the two excluded types receive none;
- Tank Depot does not relax any production prerequisite and cannot stack its own modifier;
- a damaged eligible unit gains exactly +5 only while stationed in its friendly Tank Depot city, while all near-miss cases receive the existing baseline healing;
- human and AI-owned units use the same turn-time healing path, with no difficulty-specific result;
- solo and two-human hot-seat fixtures preserve owner isolation and do not create notifications or persisted modifier state;
- save normalization/loading remains schema-stable for cities with and without `tank_depot`; and
- the building description names both values and eligible category clearly enough for the existing production/catalog UI.

The change will run the mirrored city, turn-manager, AI-production, and storage tests as applicable, then source-rule checks and a TypeScript build. Any new unit-role metadata must also pass the catalog-driven AI-role and production-candidate coverage already used by the project.
