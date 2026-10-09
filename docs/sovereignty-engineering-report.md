# Sovereignty engineering evidence

Four independently scoped issues/PRs deliver this bounded arc. No new victory
conditions, assets, lifecycle flags, serialization pathway, runtime coordinator,
type barrel, or AI production/research changes were introduced. Work was serial.

## 1. Lifecycle contracts

- Issue [#1416](https://github.com/a1flecke/conquestoria/issues/1416), PR [#1417](https://github.com/a1flecke/conquestoria/pull/1417).
- Audited source: `707a3e9f809776f5c784617b9b907555421442b0`; implementation `618be6e41b63449cdb63f79f5c6df7d54ee6bb23`; main merge `a4c7d1b7e2797d2df299118d915c4b0fc8cd9b75`.
- Confirmed defect: breakaway reconquest's special early returns skipped canonical liveness reconciliation in combat capture and settlement transfer. Final-city military-only losers retained operational state until a later turn.
- Existing protection: ordinary capture reconciled correctly; local reconquest tests proved special city behavior without proving former-owner teardown.
- Counterexample: reconquer the breakaway's only city with military but no settler. Both entry points failed immediate elimination assertions before the fix.
- Change: reconcile at both special return boundaries and carry capture elimination metadata into the existing event publisher. Eligible settlers remain living.
- Proof: ownership/rosters/capital, eliminated-area inventory, once-only elimination events, input purity, deterministic repetition, idempotent reconciliation, reload/resettlement parity. Privacy was not newly proved by this slice.
- Verification: source rules, 113 targeted tests, build, exact-HEAD verify-pr (577 seconds; latency warning), durable 759 files / 13,684 passed / 3 skipped and hook checks. CI green before authorized admin rebase merge.
- Limit: initially bounded to reconquest; later slices broaden the sequence proof.

## 2. Diplomatic and historical integrity

- Issue [#1419](https://github.com/a1flecke/conquestoria/issues/1419), PR [#1420](https://github.com/a1flecke/conquestoria/pull/1420).
- Audited source: `a4c7d1b7e2797d2df299118d915c4b0fc8cd9b75`; implementation `62c8c24b04c582e49b025fd467c99a925d98bb76`; main merge `4578e5865acca5189d4bd6762e8a48a81d21f61c`.
- Confirmed defects: final capture bookkeeping happened after elimination ended history; partial bilateral peace retired a participant still fighting another opposing actor; refused independence wrote hostility without its historical declaration; same-side membership and intersecting wars confused active-pair lookup/join decisions.
- Counterexamples: final-city occupation/raze loses its capture event; A–B peace while A–C remains active loses A's operational membership; refused independence has reciprocal hostility without an active record; a shared-participant bridge either treats allies as opponents or discards the separate record's facts.
- Existing local two-party tests did not conserve relationships over these sequences. New regressions failed on the audited behavior.
- Change: bookkeep capture before teardown; retire participants only after their last opposing edge; pass independence through the canonical war owner; query opposing sides and preserve intersecting records when both actors already have active wars.
- Proof: reciprocal operational wars, earned history retention, one conclusion/settlement, competing peace/settlement, overlord/vassal elimination, reload writer equivalence, input purity and command idempotence. Viewer projection continues through the existing contact-aware owner; privacy is broadened by slices 3/4.
- Verification: source rules, 215 targeted tests, build, exact-HEAD verify-pr (525 seconds; latency warning), durable 759 files / 13,694 passed / 3 skipped and hooks; all CI gates green before authorized admin rebase merge.
- Limit: no exhaustive settlement-term combination or overlapping-vassal-join enumeration; these remain hypotheses, not accepted defects.

## 3. Dynamic territorial access

- Issue [#1422](https://github.com/a1flecke/conquestoria/issues/1422), PR [#1423](https://github.com/a1flecke/conquestoria/pull/1423).
- Audited source: `4578e5865acca5189d4bd6762e8a48a81d21f61c`; implementation `784b3a881e75365e0623a6b6879bc962dedd66b4`; main merge `835fea56a577c2bc67a7db8e419c37796f2980be`.
- Confirmed defect: a loaded army inherited the transport's coastal territorial owner as if it occupied that land, granting egress to unload onto a closed foreign shore.
- Counterexample: place a hull with loaded warrior on rival-owned claimable coast; without access (including revoked Open Borders), preview and executor wrongly allow unload. Original unclaimed-coast coverage missed this shape.
- Change: cargo does not receive a standing-on-territory egress origin. Ordinary occupying land units keep existing stateless egress; movement categories remain unchanged. One conditional replaces one tile lookup; no world scan/allocation is added to neighbors.
- Proof: canonical treaty/war/peace/release/independence sequences, multi-owner paths, expiration and standing orders, cargo negative and admission controls, preview/range/path/executor parity. Viewer-safety and hot-seat differential controls retain hidden identity/private route protection and react to earned observation; existing AI known-border tests pass.
- Verification: source rules, 181 targeted tests across eight files (final updated subset 96), build, exact-HEAD verify-pr (457 seconds), durable 759 files / 13,703 passed / 3 skipped and hooks. CI all green before authorized admin rebase merge.
- Performance limitation: sanctioned baseline performance run passed in 20 seconds. The post-change detached launcher exited without recoverable result. It is **inconclusive**, not a pass; user permission for a new measured run was requested under the repository's no-automatic-retry rule. No before/after performance claim is made. Required full-suite algorithmic budgets passed.
- Persisted egress equivalence is established by slice 4; this slice introduced no persisted flag.

## 4. Save continuity and global invariant proof

- Issue [#1424](https://github.com/a1flecke/conquestoria/issues/1424); PR and exact implementation commit are recorded in its GitHub delivery evidence.
- Audited source: `835fea56a577c2bc67a7db8e419c37796f2980be`.
- Confirmed writer defects: `acceptVassalage` put the vassal-oriented treaty on the overlord as well; pirate activation warnings recreated live bookkeeping for eliminated actors on subsequent rounds. Existing presence-only treaty assertions and elimination-at-teardown tests did not prove continued writer validity.
- Minimal counterexamples: accept player-2 as player-3's vassal during war → treaty reciprocity fails; eliminate the overlord then process a round → eliminated-area invariant fails on `activationWarningDeliveredByCiv`. The new campaign matrix demonstrated both failures before production edits.
- Change: mirror the treaty with the recipient as `civA`; skip terminal eliminated recipients in activation warnings. The Domination sovereignty reader also required both copies to face the vassal, contradicting the existing save reciprocity contract. Align its endpoint check with the mirrored writer, retaining all existing victory and malformed/duplicate-link expectations. Add strict endpoint-orientation and reload-equality controls. No migration repair/schema change hides these writer errors.
- Preventive guardrails: register active-war-history integrity in the existing shared invariant helper, with rejecting controls and preservation of ended history. Enumerate legal canonical action sequences A–D, transported survival, two human actor seats, direct/reloaded/repeated continuation, and two subsequent rounds.
- Save/privacy proof: actual save-file serialize/parse/normalize pathway; no normalization of the direct branch; existing documented nonsemantic exclusions only. Compare states/events, byte-stable repeated saves, current player, pending recipient, war DTOs for all four viewers, hidden war differential and earned-contact control. No hidden discovery is granted by load.
- Determinism/performance: seeded bounded enumerations, no randomized fuzzing or new runtime scans. The treaty fix creates one small mirrored record; the warning guard is constant work per existing recipient iteration. No pathfinding runtime change in this slice.
- Verification: 191 focused sequence/domain tests, 103 shared-invariant/continuity tests, and 169 existing victory/continuity/registry regressions passed during development. The first full run found the registry-count test and treaty-orientation consumer mismatch; those were corrected without changing accepted victory assertions. Source rules and build passed. Exact-HEAD build/durable/status and CI evidence are recorded in the PR after final verification. This document does not substitute for those required execution records.
- Limits: selected two-round campaigns are not a long-horizon proof. Legacy records are not fabricated. No new corruption-repair behavior is asserted. Issue #1125 and AI production/research remain excluded.

## Classification and bounds

Confirmed defects above have failing reproductions and canonical fixes. Intentional
rules retained include cityless settler survival without city income/capital,
military-only elimination, inherited wars after vassal release, and stateless
egress for occupying armies. The shared active-history invariant and replay/privacy
matrix are preventive guarantees, not claims that all prior saves were broken.
Pirate contract city ownership, every settlement-term ordering, and every overlapping
vassal history join remain unverified hypotheses. The post-change measured
performance gap is explicit. No excluded long-horizon simulation was launched.
