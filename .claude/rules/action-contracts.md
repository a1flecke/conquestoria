---
paths:
  - "src/systems/**"
  - "src/ai/**"
  - "src/app/controllers/**"
  - "src/input/**"
---

# Action Contracts (#1025)

The `resolveCityInteraction` convention (`game-balance.md` #974), generalised to **every gameplay action
family**. It came out of #1025: movement legality had to be re-established for a different executor four times
(#843, #845, #965, #970) before it got a structure that made a fifth bypass impossible. The audited list of
families, executors, legality sources and statuses is
[`docs/action-contract-inventory.md`](../../docs/action-contract-inventory.md); read it before adding a family or
an executor.

## The rule

For each action family (a thing a player or the AI *does*: move, attack, queue, buy, propose, issue):

1. **One legality definition.** A single function (or a small, named pair: query + executor) says whether the
   action is legal and *why not*. Nothing else decides legality.
2. **Previews and the AI consume it.** Highlights, tap previews, forecasts, panels and AI candidate generation
   call that function (or a precomputation *derived from it*, as `getMovementRangeDetails` is from the movement
   primitives — never a parallel reimplementation). "Offered ⇒ executable; withheld ⇒ explained."
3. **The executor cannot casually skip it.** Either it accepts only a value the legality function produced
   (`ValidatedUnitMove`: an un-nameable `unique symbol` brand — the bypass is a compile error), or it re-runs the
   same check before its first write and returns a typed `ok:false` (`canParadrop`/`executeParadrop`,
   `canUnloadUnitFromTransport`, `getRushBuyQuote`/`rushBuyActiveProduction`, `evaluateUnitUpgrade`/
   `applyUnitUpgradeToState`). A new executor that does neither is a bug, not a style choice.
4. **A rejection that reaches a player is typed and has copy.** A string union (or a result object with a
   `reason`) plus a message map — not a thrown `Error`, not an identity-returned `state`, not a free string.
5. **Omniscient validation is not the player's preview.** Validation may read the whole state; what a viewer is
   shown goes through a viewer-scoped projection (`getMovementBlockerReason`, `battle-forecast-projection`,
   `air-strike-forecast-projection`). Never collapse the two.
6. **Events are outputs.** Emit them from the executor's result; never mutate in response to an event
   (`game-systems.md`).
7. **World actors are exempt only by name.** Beasts, pirates, minor civs and crisis forces may follow their own
   targeting rules, but each exemption is marked in source and pinned by a test (`movement-contract-exempt:`).

Use the repository-native shape that fits the family. This rule does **not** ask for a generic command bus,
event sourcing, or a uniform `validate()` signature: movement's branded command and the paired
`can*`/`execute*` functions are both acceptable. `caller-discipline.md`'s decision table says which structural
mechanism to build when a contract is "the caller must remember".

## Adding or changing an action

- [ ] Find the family in the inventory. If it is new, add a row (executors, legality, denial type, projection,
      enforcement, status) in the same change.
- [ ] Wire previews and AI to the family's legality function; do not copy a predicate "because it is three lines"
      (`canPillageTile` already repeats part of `applyPillageToState` — that is the cautionary example).
- [ ] Give every player-reachable rejection a typed reason and copy.
- [ ] If an executor can run without the check (a status of **partially-structural** or **caller-discipline**),
      the change either closes that gap or names the open issue in the inventory row.

## Where this is enforced today

Movement: `check-src-rule-violations.sh` + the `check-src-edit.sh` mirror + `architecture-boundaries.test.ts`
(see `movement-actions.md`). Unit removal, combat consequences, trainable-unit completion, strategic strikes and
single-side diplomacy writers: the pins in `caller-discipline.md`. Unit-vs-unit attacks (#1219): every `resolveCombat` call is
preceded by `resolveUnitVsUnitAttack`/`canUnitAttackTarget` in its function or carries an `attack-contract-exempt:`
marker (`preview`, `world-actor`, `air-mission`) listed in `tests/helpers/attack-contract-boundaries.ts`. Diplomatic actions (#1221): `applyDiplomaticAction` and the AI's decision loop both ask `resolveDiplomaticAction` (the offer table plus contact/vassal/own predicates) before their first write, and the panel lists `getAvailableDiplomaticActions`; pinned by `architecture-boundaries.test.ts` "#1221". Everything else relies on the paired
`can*`/`execute*` convention and tests. Prefer a focused follow-up issue and a structural change over a
speculative regex rule; add a source rule only for a bypass that has demonstrably recurred.
