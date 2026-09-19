# #1122 — Capture Force Demand and Assembly Design

**Status:** Astra design approved for a Terra implementation plan; implementation has not begun.

**Audited base SHA:** `be6d23228519c1be1455d3dafe8ad153ab9165eb` (`origin/main`, fetched 2026-09-19).

**Live issue and overlap audit:** #1122 is open with no comments. `gh pr list --state open` returned no open PRs, and remote-branch checks found no #1122/capture-force branch. #1121 merged #1088 at the audited SHA. The separate long-horizon/runtime branches found by name were not open PRs and did not collide with the proposed files; this must be repeated before Terra starts and again before Sol acceptance.

## 1. Current-main finding

The historical diagnosis is still true: `objectiveCandidates()` in `src/ai/ai-prepared-turn.ts` emits `requiredRoles: { frontline: 1, capture: 1 }` for every capture candidate. It does so after considering only whole-rival perceived strength for candidate score/eligibility. It does not use target-local city HP, fortifications, or visible garrison to size the operation.

This is not merely a score issue. The pipeline currently behaves as follows:

```
visible target → capture candidate { frontline: 1, capture: 1 }
  → portfolio plan → assignment consumes two distinct units
  → force-demand missing count drives production
  → mobilizing → advancing → tactical capture/assault
```

`assignUnitsToPortfolio()` marks a selected unit used per slot. Although several unit types can fulfill both frontline and capture, one unit cannot fill both slots. The flat plan therefore assembles at most the two-unit minimum when units exist. If one is lost, the next prepared turn recomputes the same plan, sees a missing slot, and already emits a replacement demand; loss replenishment is not the first break.

The existing domination campaign is a healthy undefended control, not a defended-target test: its human-slot cities have no defenders, and two late-era tanks capture promptly. Conversely, current deterministic tactical coverage proves that a warrior assaulting an otherwise undefended population-40 `walls` + `star_fort` city is deterministically repelled, consumes its action, and can die. Current tactical scoring knows that this assault is poor, but the strategic candidate that assembled the force did not request a larger force or support. A compact real-pipeline test must make this causal connection permanently executable before production code changes.

**Classification:** B — a candidate considered viable is supplied with a force demand that is too weak for a legitimately observed defended target. Production, assignment, and loss-demand plumbing work for the roles they receive. Tactical sequencing is deliberately not changed here (#1123), and the mobilization-deadline bypass is deliberately not changed here (#1124).

## 2. Information boundary and observed target facts

`MajorCivPerception.knownCities` currently contains only identity, owner, position, confidence, and observed turn. `MajorCivPerception.units` does contain visible/remembered unit type, position, confidence, and health band. The strategy layer must not inspect a fogged `GameState` city just because the city id remains in the global state.

For a `knownCity` with `confidence === 'visible'`, the actor is entitled to use the live city's visible HP and the two visible fortification flags relevant to city assault (`walls`, `star_fort`), plus visible enemy units occupying the city tile. The implementation will project exactly those facts into a small target assessment while the city is visible. A remembered/rumored target receives no new inspection. If it is the current capture plan, it retains its last legal force shape; otherwise it receives the safe minimum. Thus a hidden defender or unseen reinforcement cannot increase demand, and hidden weakening cannot make the AI discard a legally earned precaution.

This avoids a new broad enemy scan: one candidate reads its already-known city and indexes the already-built perception units by target tile. The implementation must build that index once per planning pass, rather than filtering all perceived units once per city.

## 3. Chosen force contract

The existing `requiredRoles` field means **critical readiness**. Add an optional `supportRoles?: Partial<Record<AIStrategicRole, number>>` field to an objective candidate and persisted strategic plan. It means **desired for assignment and production, but never required by `hasRequiredRoles()`**. This is intentionally the smallest missing semantic: it makes a support unit assignable without pre-solving #1124's deadline behavior.

Capture force sizing is bounded and deterministic:

| Observed target class | Critical `requiredRoles` | Optional `supportRoles` | Rationale |
|---|---|---|---|
| Unseen/remembered, or visible with no garrison and no wall/fort condition | `{ frontline: 1, capture: 1 }` | none | Preserves the current efficient minimum and does not infer hidden defense. |
| Visible garrison **or** visible fortification at ordinary health | `{ frontline: 2, capture: 1 }` | one trainable city-bombard-capable role | One attacker can clear a visible defender while another preserves capture capability; support may reduce the visible city-assault burden. |
| Visible garrison **and** visible fortification at HP at or above the defined healthy-city threshold | `{ frontline: 2, capture: 1 }` | one trainable city-bombard-capable role | Same hard cap; this does not grow an army with population, era, or distance. It requests the useful third unit only when the target is visibly hardened. |

The implementation must name and test the healthy-city threshold as a local constant in the capture-demand helper. It is a binary, deterministic city condition (not a combat simulation) and may not be tuned from hidden data. The initially proposed value is 60 HP: below it, the same visible fortification is already materially weakened and does not justify requesting optional support merely to perfect an assault. Terra must retain that value only if the RED fixture demonstrates the expected strength boundary; otherwise this design requires escalation, not silent retuning.

The sole optional role is chosen from currently trainable units that can legally bombard a city: prefer `siege`, then `ranged`, only if the civ can produce at least one candidate. No role is requested merely because its name exists in the catalog. A support unit that is not currently possible to train is omitted rather than creating permanent impossible demand. If technology later makes it trainable while the target is again visibly observed, the retained plan refreshes and adds it. Existing units can also satisfy the slot.

The cap is one optional support slot and two frontline slots. `maxPrimaryForce` remains the final challenge-profile cap (Explorer 4, Standard 6, Veteran 8), so this change cannot overrun the existing force budget. No personality input is added; personality continues to choose targets, not to alter basic operational competence.

## 4. Data flow and retained-plan behavior

1. `objectiveCandidates()` receives the precomputed perception-unit-by-tile index and the civ's currently trainable unit types. For visible capture cities it derives the bounded force shape; for a fogged current target it copies the plan's previous `requiredRoles` and `supportRoles`, which are earned information.
2. `AIObjectiveCandidate`, `AIObjectiveChoice.plan`, `AIPlanCandidate`, and `AIStrategicPlan` carry optional support roles without inserting them into the objective eligibility/missing-role calculation. A candidate remains eligible when critical roles are absent exactly as it is today, so normal readiness demand remains unchanged and does not recursively manufacture support.
3. `selectPrimaryPlan()` refreshes both role maps from a matching candidate. New plans clone both maps. A visible strengthening update raises the bounded demand; a visible weakening update lowers it; a hidden change does neither. The plan identity, commitment, expiry, and phase rules are unchanged.
4. `assignUnitsToPortfolio()` allocates all critical slots before optional support slots, still one distinct unit per slot and still with defense plans first. It emits force demand for unfilled optional support in the same existing demand stream, so `applyAIProduction()` can select a trainable support unit. `hasRequiredRoles()` keeps reading only `requiredRoles`; this MR does not modify `nextPlanPhase()`.
5. A dead or emergency-detached unit reopens the appropriate force demand next prepared turn. Loss of a critical slot is a hard deficit; loss of support is a production/assignment deficit but must not itself block readiness. #1124 will decide the deadline contract for hard deficits; #1123 will decide same-turn support-before-capture order.

## 5. Save, determinism, and compatibility

`supportRoles` is optional, finite, bounded by `MAX_PLAN_ROLE_REQUIREMENT`, and contains only valid strategic roles. `normalizePlan()` will normalize it exactly as `requiredRoles`, omit it when empty, and continue to accept old saves without the field. This is an additive optional plan property: no schema bump is planned, provided Terra adds a legacy-save/default test showing an absent field normalizes and the next AI turn matches an explicit-empty-field state. The field contains only plain JSON objects; no RNG, wall clock, `Map`, or `Set` enters persisted state.

Repeated preparation against identical perception must produce byte-identical plans, demands, assignments, and traces. Hot-seat remains safe because each AI observes only its own `visibility` and current plan; the implementation may not inspect a human seat's private fog state.

## 6. Required reproduction and controls

Terra must first add a compact deterministic pipeline fixture that drives `prepareMajorCivStrategicPlan → applyAIProduction/assignment → processMajorCivStrategicTurn` for a visible, fortified, garrisoned city. It must record, in assertions or a test-local diagnostic object: owner, city HP/fortification, visible garrison, known-vs-hidden defenders, critical/support roles, missing demands, assigned ids/roles, queue, travel, phase, capture odds, bombardment availability, losses, replacement demand, and ownership outcome. The RED state is a real legal capture operation that currently requests only 1+1 and then loses/stalls against a target its observer can see.

Required controls:

- undefended visible city stays exactly 1+1 with no support and captures without waiting;
- light visible garrison requests the bounded extra frontline but no impossible unit;
- hardened visible target requests at most two frontline, one capture, and one possible support;
- an unavailable support catalog leaves `supportRoles` empty; a later visible trainability change adds it;
- target strengthening/weakening changes roles only while visible; a hidden defender does not;
- critical and support losses both regenerate their own demand; emergency defense can still detach a unit without corrupting the plan;
- a retained capture plan refreshes its role maps; ownership change abandons/re-targets normally;
- Explorer, Standard, and Veteran receive the same force shape from the same observed facts, subject only to their existing force caps/timing;
- repeated and save/reload-mid-mobilization trajectories are equivalent in solo and hot-seat configurations.

## 7. Alternatives rejected

1. **Increase every capture plan to ranged/siege/frontline.** Rejected: it changes undefended operations, requests units absent from many eras, and has no observed target rationale.
2. **Scale only `requiredRoles` with no optional-role model.** Rejected: support would masquerade as a hard readiness condition and would be immediately entangled with the #1124 deadline bypass; it cannot express “build/assign if available, but do not wait forever” honestly.
3. **Use per-candidate combat simulations or full enemy scans.** Rejected: the current performance budget explicitly guards AI path and city-yield work; visible local evidence with bounded tiers is sufficient for this first causal fix.
4. **Fix tactical sequence or deadline here.** Rejected: #1123 and #1124 own those downstream seams respectively.

## 8. Non-goals

- No new units, content, strategic personality behavior, phase, generic army planner, combat-odds rewrite, human-combat rule change, or hidden-information read.
- No change to `scripts/run-ai-long-horizon.sh`, timeout/scenario policy, profiling architecture, performance-budget baselines, or unrelated campaign-gap registry.
- No resolution of the deadline condition, action ordering, or parent #1088 closure.

## 9. Mandatory design review

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.**

- **Balance, fun, ages, and play styles:** the 1+1 control is explicit, so early and opportunistic conquest remains quick. A visibly fortified/garrisoned city now merits a finite, legible response rather than suicidal feeding. The cap prevents a perfectionist siege ball or long idle buildup.
- **New mechanics and AI use:** this adds only planning metadata for existing roles and existing bombard-capable units; it does not add combat content or alter player rules. AI production and assignment consume the metadata through their current canonical path.
- **Difficulty:** observed target facts determine basic competence identically for all three tiers. Existing profile force caps and later #1124 risk timing are the only intended differences; no tier gains hidden information or impossible-unit access.
- **UI/UX, data, SFX:** no player-facing control, renderer datum, audio event, or asset changes. AI traces and tests will expose the decision for diagnosis; no UI wiring is required because no new player-computed information is introduced.
- **Architecture/extensibility:** critical and optional roles are explicit instead of relying on deadline side effects. The helper stays in capture candidate generation and uses typed strategic roles, preserving portfolio/assignment/production separation.
- **Saved games/determinism:** optional normalized JSON data and old-save defaulting are covered in §5; no migration is silently skipped. No nondeterministic operation is proposed.
- **Testing/regressions/solo/hot-seat:** §6 requires both positive and negative pipeline coverage, targeted unit boundaries, save/reload equivalence, deterministic repeats, and owner-scoped hot-seat coverage. Emergency defense retains priority.
- **Proper implementation/performance:** a once-per-pass visible-unit tile index and bounded role counts avoid candidate-by-candidate scans, paths, or combat simulations.

No in-scope finding remains unaddressed. If the defended pipeline fixture does not fail for the documented 1+1 cause, or if a city-detail cannot be safely projected from visible state, emit `DESIGN ESCALATION REQUIRED` and stop rather than broadening the behavior.
