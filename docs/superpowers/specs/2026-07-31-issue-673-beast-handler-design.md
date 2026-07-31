# Beast Handler Company Design

## Scope

Implement #673 as one deployable mechanics slice. Add Beast Handler Company as the Era 2
generic detection/support successor for Scout Hound and Rome's War Hound. This slice does
not add War Elephant Corps, family-based Stable/Cavalry Academy discounts, or bespoke art
and audio.

## Player contract

Beast Handler Company is a mobile detection specialist that helps protect an army from
disguised spies. It costs 72 production, has strength 24, movement 3, vision 3, and a 35%
detection chance. It requires Horseback Riding, has no strategic-resource requirement, and
uses the normal Era 2 production and upgrade rules.

The typed upgrade graph is:

- `Scout Hound -> Beast Handler Company`
- `War Hound -> Beast Handler Company`
- `Shadow Warden` remains terminal for Persia.

War Elephant Corps is not yet a typed trainable unit. Beast Handler therefore shows an explicit
"War Elephant Corps is future content" terminal explanation in this delivery; #674 adds the
successor edge when it can satisfy the live upgrade-integrity contract.

The production and selected-unit surfaces must give a plain-language explanation first and
keep exact detection, role, counter, vulnerability, and upgrade facts reachable. They must
continue to use the current viewer in hot seat and refresh from the canonical state.

## Architecture

`UnitType`, `UNIT_DEFINITIONS`, `TRAINABLE_UNITS`, and the Horseback Riding technology own
the new unit's identity and production gate. `UNIT_ROLE_DEFINITIONS` and the existing explicit
`upgradesTo` metadata own its role and chain. The existing definition-driven detection paths
read `spyDetectionChance`; no Beast Handler-specific detection or disguise-visibility branch
is permitted.

`processDetection` must deduplicate a detected spy per detecting civilization and turn before
emitting history/notification facts. Several nearby friendly detectors, or a detector plus the
city baseline, must produce one owner-scoped record and one event, while separate detecting
civilizations may each receive their own fact. This repairs an existing issue that Beast
Handler's formation use would otherwise make more visible.

The AI consumes the existing typed detection role and legal production catalog. It must not
learn the unit through an ID-specific `basic-ai` branch. Temporary renderer and SFX catalog
mappings make the unit live and testable now; #708 replaces its sprite and #714 replaces its
audio. Those references are part of the temporary mapping documentation.

## Rules and boundaries

- The 35% chance is the unit definition's `spyDetectionChance` and is used by both normal
  detection and viewer-safe disguised-spy visibility.
- A detector with `transportId` is not on the map and cannot participate in either detection
  path; this matches the transport visibility rule and prevents below-deck information leaks.
- The generic unit remains trainable for non-Roman, non-Persian civilizations after
  Horseback Riding. Roman War Hound and Persian Shadow Warden continue to replace Scout
  Hound at their existing source gate.
- Beast Handler has no `upgradesTo` metadata until #674 introduces `war_elephant`; an absent
  target would violate the canonical upgrade-integrity contract and cause a broken player-facing
  edge.
- Existing units and queues are unchanged; this delivery introduces no persisted-shape
  change and therefore no save schema increment.
- The unit must have a valid temporary production icon, sprite catalog mapping, locomotion
  classification, and mixer-compatible SFX mapping. No bespoke asset is created here.

## Verification

Focused tests must be written first and observed failing before each production change. They
will prove the exact stat/gate contract; both predecessor edges; the terminal Persian negative
case; the explicit future-content terminal explanation; the absence of a strategic-resource
requirement; deterministic detection behavior; viewer-safe disguise visibility; catalog-driven
legal AI production; legality parity for Explorer, Standard, and Veteran; role/UI presentation;
and temporary sprite/SFX catalog coverage. A deterministic combat fixture compares the handler
with its predecessors, an intended ranged counter, and the same-era Horseman generalist without
claiming the unavailable War Elephant successor.

The detection regression exercises two same-owner detectors and a city baseline against one
spy, asserting one `recentDetections` record and one owner-scoped event; it also asserts that a
second civilization can independently receive its own record. A two-human hot-seat visibility
case proves only the owning detector's viewer sees through a disguise and that the other human
does not receive a leaked detail. A loaded detector negative case proves it cannot create a
turn-based detection or reveal a disguise.

The final verification follows the repository contract: source-rule check, mirrored focused
tests, `git diff --check`, review of committed and uncommitted deltas, then the production
build and complete test suite before publishing.

## Follow-up ownership

- #674 owns War Elephant mechanics and activates Beast Handler's successor target.
- #677 owns family-driven, non-stacking Stable and Cavalry Academy discounts.
- #708 owns the Beast Handler bespoke sprite replacement.
- #714 owns the Beast Handler bespoke audio replacement.
