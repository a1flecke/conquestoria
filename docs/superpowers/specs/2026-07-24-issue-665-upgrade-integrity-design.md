# Issue #665 Upgrade Integrity Design

**Date:** 2026-07-24
**Status:** Approved for specification review
**Parent:** #547, delivery 1 of 63
**Audited base:** `c6279df67a70a0d85487aa0cce77b63e1fd3415d` (`origin/main`)

## Goal

Replace upgrade-as-full-heal behavior with one canonical, save-safe evaluation and
application contract. It preserves a unit's health percentage and experience, consumes
its turn, explains every blocker, and prevents cross-domain upgrades from creating an
unbased air unit.

## Scope

This delivery changes only the existing upgrade foundation. It does not add Armored Car,
Attack Helicopter, a new upgrade edge, role metadata, conjunctive prerequisites, or a
new save schema. The future Armored Car to Attack Helicopter edge in #676 will consume
the generic domain-transition contract established here.

## Design

### Canonical evaluation

`src/systems/unit-upgrade-system.ts` will expose a serializable `UpgradeEvaluation` that
is the single source for UI, human actions, and AI upgrades. It identifies the explicit
catalog target and cost, the friendly host city, the state that will be preserved, and an
ordered list of all unmet requirements. Evaluation does not stop at the first failure:
an upgrade can report its technology, building, resource, gold, position, and
cross-domain destination blockers together.

Existing callers that only need an enabled/disabled result will consume this evaluation;
they will not retain parallel eligibility checks. Explicit `upgradesTo` remains the only
way to select a target.

### Canonical application

`applyUnitUpgradeToState` first evaluates the requested target, rejects noncanonical or
blocked requests without changing state, deducts the evaluated cost, and applies the
result through one state mutation path. `applyUpgrade` preserves health percentage
against the fixed 100-point health scale and preserves experience. It consumes movement
and the action, while retaining identity and map position. Only transient state proven
incompatible with the target definition may be cleared; no unrelated orders, formation,
or saved state is reset in this issue.

### Cross-domain destination

When an explicit future edge changes a ground unit into an air unit, the evaluator
requires a friendly host city, the target's required building, a legal air-base slot,
and a valid canonical base assignment. Application delegates capacity checks and
assignment to `canCompleteAirUnitProduction` and `baseNewAirUnit` rather than mutating
an air-unit type in place. A full, destroyed, or otherwise ineligible base is a visible
blocker.

The upgrade evaluator receives a typed, read-only definition lookup and target type;
production passes the catalog lookup, while focused tests pass an in-memory lookup that
contains one explicit ground-to-air edge. This is an evaluation seam, not a test-only
global catalog mutation or an ID-specific production branch. The fixture proves legal
base assignment, capacity rejection, and transaction rollback while the concrete Armored
Car edge remains unreachable until #676.

### Player presentation

The selected-unit panel derives its upgrade presentation exclusively from
`UpgradeEvaluation`. Before confirmation it shows the source and target names, gold
cost, preserved health and experience, and every unavailable requirement. After a
successful upgrade, the still-open panel rerenders immediately with the new type and
consumed action. The action remains icon-plus-text, uses plain language, and meets the
44-pixel target requirement. Missing requirements remain explanatory rather than
silently hiding an otherwise explicit upgrade path.

For a legal upgrade, tapping the 44-pixel `Upgrade` action opens an inline confirmation
state in the selected-unit panel; it retains the source/target, cost, preservation, and
destination facts, and offers equally sized `Confirm upgrade` and `Cancel` controls.
Cancel restores the normal action surface without mutation. Confirm invokes the canonical
state helper once; success rerenders the open panel, while a late failure rerenders the
same confirmation with every current blocker. Blocked upgrade paths show their complete
text-and-icon requirement list in the normal panel and never expose a confirmation
action.

### Player truth table

| Before | Player action | Immediate visible result |
|---|---|---|
| Legal upgrade in a friendly city | Tap `Upgrade` | Inline confirmation shows source, target, gold, preserved health/experience, and destination facts. |
| Inline confirmation | Tap `Cancel` | Normal selected-unit actions return; unit, gold, and action state are unchanged. |
| Inline confirmation | Tap `Confirm upgrade` | Open panel rerenders with the target type and spent action/movement; gold and preserved values are shown. |
| Any missing requirement | View selected unit | Complete ordered blocker list stays visible; no confirmation action appears. |
| Late state change makes confirmation invalid | Tap `Confirm upgrade` | Confirmation rerenders with current blockers and no mutation occurs. |

### Misleading UI risks

- A target is not "available" merely because its technology is complete: building,
  resource, gold, city position, and air-base capacity must also pass.
- A health preview must show the percentage-preserving result, never imply a full heal.
- The confirmation must render the evaluator's complete list, rather than hiding a
  second blocker after the first one is repaired.

### Interaction replay checklist

Tests click legal upgrade, cancel, reopen/upgrade again, confirm, then confirm a stale
attempt; they assert the live DOM after each mutation. Blocked tests cover multiple
simultaneous requirements and prove that all explanatory text remains reachable.

## Error and information boundaries

All failed mutations return structured reasons and leave the supplied state unchanged.
The evaluator is deterministic, uses only the upgrading civilization's owned state, and
does not introduce viewer-specific or hidden-map information. AI upgrades call the same
state helper as a human action, so building/resource/base eligibility cannot drift.

Explorer, Standard, and Veteran use identical definitions, costs, blockers, destination
legality, and human upgrade outcomes. The existing challenge profile may continue to
vary only the AI's bounded modernization cap and ordering. Deterministic tests cover the
same legal and blocked human decision in all three modes, and separately assert that AI
uses only the profile's allowed cap difference. Fixtures cover an optimizer upgrading a
damaged veteran, a defender retaining an acted garrison, and a builder/noncombat unit
whose upgrade remains subject to the same blockers; no strategy gets a free heal.

Two-human hot-seat tests change `currentPlayer` between the confirmation and execution
paths. They prove only the selected unit's owner can act, the second player sees neither
the first player's confirmation nor its success/blocker message, and reopening the panel
after handoff derives solely from the current viewer's selected unit.

## Persistence

The existing `Unit` fields already store health, experience, movement, action state, and
air-base assignments. No persisted shape changes in this delivery. Regression coverage
will prove that upgrading an existing save-shaped state preserves these fields and that
save normalization/load round trips do not invalidate upgraded units or their legal air
assignment.

The delivery adds no upgrade SFX and emits no new audio event: the existing visual
confirmation, persistent notification, and refreshed panel are the complete feedback
path. This is intentional because no current upgrade audio contract exists; the future
audio batch may add one through the mixer with a text equivalent. Tests assert that the
upgrade result remains visually understandable with audio unavailable or muted.

Save coverage uses `createNewGame` states normalized through
`migrateSaveToCurrent`, including an unversioned schema-0-shaped save and a
`CURRENT_SAVE_SCHEMA_VERSION` save. Each is upgraded, normalized a second time, and
asserted to preserve type, health, experience, action/movement state, gold, and any legal
`airBase` assignment. No schema bump is permitted unless implementation adds persisted
fields.

## Tests and acceptance evidence

Test-first coverage will prove:

- a damaged, experienced unit preserves its health percentage and experience while
  spending movement/action;
- a valid human and AI upgrade use the same canonical mutation path;
- Explorer, Standard, and Veteran preserve identical human legality and blockers, while
  AI variation is limited to the existing typed modernization cap;
- optimizer, defender, and builder/noncombat fixtures retain the intended no-free-heal
  decision and do not gain a strategy-specific exception;
- insufficient technology, building, resources, gold, city position, and air-base
  capacity are reported as independent blockers without mutating state;
- an attempted cross-domain upgrade cannot create an unbased or over-capacity aircraft;
- the selected-unit panel renders the evaluation, keeps blockers visible, and refreshes
  immediately after confirm, cancel, stale-confirm failure, and hot-seat handoff;
- both schema-0-shaped and current-schema saves pass idempotent load coverage unchanged;
- muted/no-audio play retains complete visual and textual upgrade feedback.

## Out of scope and follow-up ownership

- #666 owns conjunctive prerequisite metadata and its production/research/Codex wiring.
- #667 owns typed upgrade-family, role, and counter metadata.
- #668 owns the broader role/counter/upgrade-chain catalog presentation.
- #676 owns adding Armored Car and making its explicit cross-domain edge player
  reachable.

## Verification

Run the mirrored unit-upgrade, AI-upgrades, selected-unit-info, air-operations, and
storage tests; run source-rule checks for every changed `src/` file; then run a build and
the full suite before publishing.
