---
paths:
  - "src/**"
---

# Caller Discipline → Structure (#1014)

A rule that says "the caller must remember X" is a **bug report against the API**, not a
solution. Every contract of that shape has either already failed (movement legality four times,
the production-cost option bag twice, one-sided war, the beast slay on every non-player executor)
or is waiting for the next caller. The categorised inventory is
[`docs/caller-discipline-inventory.md`](../../docs/caller-discipline-inventory.md); this file is
the working policy.

## Decision procedure for a new contract

Before writing "callers must…" anywhere (a comment, a rules file, a PR body), pick the strongest
row that fits and build that instead:

| If the contract is… | Build | Working example |
|---|---|---|
| **An ordering** ("A before B") | One function that runs B as a callback after doing A, and stop exporting A | `withSettlementSigned` (war-history): the settlement event can only be written by the function that then runs the peace transition |
| **A paired cost/consequence** ("also deduct/record X") | One command that validates, applies and pays; make the unpaid primitive private | `applyUnitUpgradeToState` owns the gold; `applyUpgrade` is no longer exported |
| **A consequence of a fact every executor shares** ("must be called from every path that…") | Move it into the function every path already funnels through; return a payload for the caller | Beast slay lives in `applyCombatOutcomeToState` (`beastsSlain`), announced there when a bus is given |
| **A single legal entry point** ("UI must never call the inner step") | A source rule (`scripts/check-src-rule-violations.sh` + the hook mirror + both smoke tests) **and** an importer pin in `architecture-boundaries.test.ts` | `resolveStrategicStrike` has one caller; the low-level unit movers; the single-side diplomacy writers |
| **A relationship between two parts of state** ("index A must agree with index B") | A `SAVE_STATE_INVARIANTS` assert, with an earned-control test per violation, wired into the AI-playability fixture | `beast-lair-integrity`, `cargo-reciprocity`, `air-base-integrity`, `bilateral-war` |
| **A table the AI/UI must consult** ("new X must add a row") | A data table read generically, plus a completeness test | `UNREST_RELIEF_SOURCES`, `NP_PRODUCTION_DISCOUNTS` |
| **A note about a fact** ("both sides' notifications were already logged") | Leave it. Say why it is safe. | — |

Do not convert a contract whose enforcement would cost more than the bug it prevents, and say so
in the inventory rather than leaving it unclassified.

## Rules

- **Write the mechanism into the rules text.** A `.claude/rules/` sentence that names a discipline
  is replaced by a sentence naming the thing that enforces it (and the test that pins it). If
  there is no enforcer yet, the sentence links the open issue instead of pretending.
- **A new source rule extends the two existing mechanisms** (`check-src-rule-violations.sh` and its
  `check-src-edit.sh` mirror). It ships with a script test and a hook smoke test, exempts comment
  lines, and names the sanctioned files in a `case` block.
- **A unit is removed by one function, not by `delete`.** That function does not exist yet —
  see #1198. Until it does, a new removal site must copy the *complete* cascade of
  `removeUnitFromCopies` (roster, minor roster, cargo manifest, spy record) plus the carrier air
  wing, and add a test that `assertCargoReciprocity`/`assertAirBaseIntegrity` still hold.
- **A combat executor applies a fight through `applyCombatOutcomeToState`.** Everything that is a
  *consequence of the kill* belongs inside it; everything that is a *presentation of the fight*
  is emitted from the returned payload. Remaining per-executor consequences are tracked in #1200.

## What is enforced, and where

| Contract | Mechanism | Pinned by |
|---|---|---|
| Settlement is logged before peace | `withSettlementSigned` owns the order; `recordSettlementSigned` no longer exists | `war-history-system.test.ts`, `architecture-boundaries.test.ts` "#1014" |
| Beast slay applies for every executor | folded into `applyCombatOutcomeToState`; event owned there | `combat-reward-system.test.ts` "beast slay is a consequence of the kill", architecture pin, source rule, `beast-lair-integrity` |
| An upgrade takes its gold | `applyUpgrade` private | `unit-upgrade.test.ts`, architecture pin |
| Strategic strike consequences | `resolveStrategicStrike` has one caller | source rule, architecture pin |
| Single-side vassalage mutators | importable only by `diplomacy-vassalage.ts` | architecture pin |
| Disband takes cargo/air wing with it | `removePlayerUnitFromState` cascade; confirmation names the extra units | `unit-lifecycle-system.test.ts`, `unit-turn-flow.test.ts` |
| Publication after a state write | `commit`/`batch`; no silent write | `session-publication.md` |

## Open follow-ups (evidence in each issue)

#1198 canonical unit removal · #1199 finish #1015 (hand pushes, in-place mutation) · #1200 per-executor
combat consequences · #1201 espionage consequences/recipients · #1202 trainable-unit wiring items 3–4.
