# Sovereignty lifecycle contract

Audited baseline: `707a3e9f809776f5c784617b9b907555421442b0`.
This reference describes the existing canonical contract and the bounded
breakaway-reconquest proof. It does not define new lifecycle state or victory rules.

## Distinct questions

| Question | Authority | Meaning |
| --- | --- | --- |
| Does the actor exist? | `state.civilizations[id]` | The record can remain after elimination for history. |
| Is a major civilization living? | `getCivilizationLiveness` | A terminal elimination marker wins; otherwise an authoritative city or eligible settler preserves life. Military units alone do not. |
| Which cities or units does it own? | `getOwnedCities`, `getOwnedUnits` | Entity `owner` fields are authoritative; rosters are maintained indexes. |
| Does it have a capital? | `getCapitalCityId` | The first city in its roster must exist and belong to it. A cityless survivor has no capital. |
| Can it take a turn? | `turn-cycling`, per-civ round phase | Living major civilizations remain eligible, including cityless settlers. |
| Can it declare a major war? | `declareMajorWar` | Both actors must be living and satisfy the canonical diplomacy restrictions. |
| Does it have city income or production? | City economy/production systems | These require an actual owned city; liveness does not manufacture one. |
| Can a pirate contract continue? | `pirate-system` contract processing | Currently requires city ownership for employer and target. This is a distinct predicate; its design intent is not established by the lifecycle audit. |

`nearDefeat` is a presentation/recovery signal, not an elimination predicate.
Founding a first replacement city preserves the signal; founding a second city
clears it. Existing capture and founding regressions own their respective recovery
behavior. No new persistent lifecycle flags are needed.

## Transition responsibilities

`reconcileCivilizationLiveness(before, after, attribution)` derives transitions.
It delegates assetless teardown to `eliminateCivilization`, preserves eligible
settlers, and records attributed defeat through the existing sovereignty owner.
Reconciliation of an already reconciled state produces no new transition.

Every final-city ownership loss must pass this boundary, including reconquest.
Reconquest's special population, unrest, occupation, and General-progress rules
do not exempt the former owner from the survival contract.

The combat capture result carries elimination data into
`emitMajorCityCaptureEvents`, used by both human and AI capture paths. Settlement
ownership transfer returns the reconciled state to its existing caller. Historical
records survive according to `ELIMINATED_CIV_AREAS`; active obligations are removed
by the existing teardown rather than a reconquest-specific cleanup.

## Bounded executable matrix

| Entry | Former owner's survival assets | Required result |
| --- | --- | --- |
| Combat reconquest | Military only | Eliminated immediately; military and live relationships removed. |
| Settlement ownership transfer | Military only | Same lifecycle result. |
| Combat reconquest | Eligible free settler | Living, cityless, roster and diplomatic relationships preserved. |
| Settlement ownership transfer | Eligible free settler | Same survival result. |
| Repeat the reconciled final state | Either outcome | No new lifecycle transitions. |
| Repeat from identical input | Military-only cases | Equivalent semantic state; input unchanged. |
| Repeat an already completed capture | Eliminated former owner | No second elimination event. |
| Reload before reconquest and continue one round | Military only, both entries | Equivalent state, shared save invariants, writer output unchanged by load normalization. |
| Reload a cityless checkpoint and found a city | Settler survivor | Equivalent resettled state and exactly one `civ:resettled` event in each branch. |

The matrix lives in `tests/systems/city-capture-system.test.ts` and
`tests/storage/civilization-liveness-continuity.test.ts`. It reuses
`assertSaveStateInvariants`, the eliminated-civilization area inventory, and
`assertSimulationEquivalent`; there is no second state model or serializer.

## Proof boundary

This slice establishes reconquest lifecycle parity. It does not complete the
broader multiparty-war, transport-malformation, dynamic-border, hot-seat privacy,
or multi-round replay audits. Existing settler/cargo, founding, elimination, and
capture suites remain useful protections, but passing them is not proof of every
sequence in the engineering arc. Privacy was not newly proved by this matrix.
