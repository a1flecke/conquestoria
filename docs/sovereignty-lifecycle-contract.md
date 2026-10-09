# Sovereignty lifecycle contract

Audited baseline: `707a3e9f809776f5c784617b9b907555421442b0`.
This reference describes the canonical contract and bounded transition proofs
delivered by the sovereignty engineering arc. It defines no new lifecycle state or victory rules.

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

The campaign matrix additionally enumerates the following sequences for two
independent human actors in a seeded four-seat world:

| Sequence | Checkpoint | Continuation |
| --- | --- | --- |
| A | Final city captured, free settler survives, war remains active | Resettle, capture a second city, recover from near defeat, continue two rounds. |
| A transport | Final city captured, settler aboard a reciprocal transport | Reset actions, unload, reset actions, found a replacement, continue two rounds. |
| B vassal/overlord | Vassalage during war, pending settlement, actor's final city razed | Check cleanup and surviving war, reconcile again, continue two rounds. |
| C | Enter with Open Borders, cancel bilateral access with army inside | Reload, use egress, deny reentry, renew treaty, continue movement and rounds. |
| D | Conquest goal fulfilled, capital captured, second city remains, settlement pending | Reject wrong recipient, accept reparations once, retain settled history, continue rounds. |

Each checkpoint uses `serializeSaveFile` / `parseSaveFile` and the existing
loader. The direct branch is not normalized to conceal writer drift. Direct,
loaded, and repeated branches must agree in semantic state and meaningful events;
repeated saves must be byte-identical. Only the existing deterministic-state
helper's `playthroughId` and `saveSchemaVersion` exclusions apply. Input purity,
current seat, recipient, canonical capital, living turn roster, and all shared
ownership/cargo/diplomacy/elimination invariants remain checked.

Active historical participants must be living and retain a reciprocal war edge
to an active participant on the opposing side. Ended records retain their facts.
Legacy bilateral wars need not be backfilled with unearned historical records.
The invariant's negative controls reject stale actors and empty opposing edges.

War-history tests cover partial peace, intersecting wars, redeclaration,
independence, final capture, and sovereignty cleanup. Border tests cover direct
legality, preview, range/path/executor parity, orders, cargo, and AI known geography.
Viewer-safety differential controls cover hidden owner identity and hot-seat
observations; the save-path control keeps an unobserved war private while earned
contact changes its presentation. This is a bounded enumerated proof, not
exhaustive verification of every legal sequence or corrupted input.

Malformed settler survival links are separately enumerated (missing host or
manifest, wrong owner, dead/nested host, self-link); the cargo invariant owns the
larger persisted-shape contract. Pirate contract city ownership remains a
distinct domain rule whose design intent has not been established here.

See [the engineering report](sovereignty-engineering-report.md) for source
commits, counterexamples, verification evidence, and remaining limitations.
