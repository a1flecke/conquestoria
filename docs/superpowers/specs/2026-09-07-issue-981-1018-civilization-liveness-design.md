# Civilization liveness — #981 / #1018

Status: Phase 0 design, reviewed inline; production implementation has not started.

Companion: [Terra implementation plan](../plans/2026-09-07-issue-981-1018-civilization-liveness-implementation.md).

## Scope and phase boundary

Resolve [#981](https://github.com/a1flecke/conquestoria/issues/981) and [#1018](https://github.com/a1flecke/conquestoria/issues/1018) together in one coherent implementation MR. This document chooses the survival rule, its canonical query, its lifecycle integration, and the minimum player/AI support that makes that rule usable. It does not implement or redesign [#985](https://github.com/a1flecke/conquestoria/issues/985). That design starts only after the liveness MR merges.

The user authorized the staged arc in `conquestoria_981_1018_985_full_staged_arc_prompt.md`. This phase is Astra design/planning only. Work and both reviews run inline; no subagents. Terra High implements; Sol High reviews the actual diff, fixes findings, and creates the MR; Luna watches CI and merges under the document's gate. Do not skip the model handoffs.

## Fresh audit and reproducible evidence

Fresh worktree: `.worktrees/civilization-liveness-design`, branch `codex/civilization-liveness-design`. Initial base was `e9447a3a`; after reviewing intervening changes, the worktree was fast-forwarded through the #496 audit to final audited base `824ea20e`, which includes #1004 determinism and #1006 save compatibility. Hook installation succeeded, `git config --worktree --get core.hooksPath` returned `.githooks`, mise was trusted, and worktree-local dependencies were installed with `yarn install --immutable`.

Read the current issue bodies and comments, the latest 35 commits, open PRs, recently closed/merged PRs, relevant local/remote branch refs, `AGENTS.md`, `CLAUDE.md`, and applicable rules. The GitHub CLI initially worked, then failed on network access; the connected GitHub reader completed the issue/comment and PR audit. There were no open PRs at that audit point. A local `claude/conquestoria-1004-determinism` branch pointed at the same initial base; that branch name is not evidence that its work has landed.

Important drift from the issue snapshots:

- Save schema is **28**, not 27. #496 added minor-civ compact data. #1004 moved the canonical constant to `src/storage/save-schema-version.ts`, re-exported by migrations, and stamps new games with it.
- Vassalage normalization is `src/storage/vassalage-normalization.ts`, not under `src/systems/`.
- #910 vassalage, #970 canonical transport-unload blockers, #984 production-cost context, and #1021/#982/#983 simulation RNG work are merged. Reuse them.
- #1004 is now merged: reuse `assertSimulationEquivalent` from `tests/helpers/deterministic-state.ts`. It excludes only playthrough identity and schema metadata, compares whole simulation state and reports the first divergent path. Keep `tests/app/determinism-guard.test.ts` and the new `tests/app/simulation-determinism.test.ts` in final verification.
- #1006 is now merged: reuse `tests/helpers/save-state-invariants.ts` for valid lifecycle fixtures and retain its exhaustive version matrix. The shared validators cover bilateral wars, city/unit rosters, cargo reciprocity and eliminated actors' entities/obligations. Deliberately malformed roster fixtures test query robustness separately; they must not force global roster repair.
- #496 compacts remain minor-civ state, outside `state.civilizations`; they are not major rivals.

| Area | Current implementation and consequence |
|---|---|
| Victory | `src/systems/victory-system.ts:3`: counts nonempty city rosters, disregarding owned units and the elimination marker. |
| Elimination | `src/systems/civilization-elimination-system.ts:48`: a nonempty city roster blocks cleanup; otherwise all owned units, including settlers, are deleted. |
| AI scheduling | `src/ai/ai-round-scheduler.ts:21`: cross-checks roster members against owner fields, but misses owned entities omitted from the rosters. Any remaining unit counts. Execution later checks only the marker. |
| Human rotation | `src/core/turn-cycling.ts:23`: checks only `isEliminated`. Config-only helpers still exist but are not the live state-aware eligibility rule. |
| Diplomacy | `src/ui/diplomacy-panel.ts:175–176` checks the marker AND requires an owned city, hiding a living cityless rival. New vassalage eligibility has a separate city requirement. |
| World age | `src/systems/tech-definitions.ts:62` accepts only a civilization map, so it cannot answer asset-based liveness. |
| Pirates | `src/systems/pirate-system.ts:136–137` independently treats cityless contract employers/targets as dead. |
| Founding | `src/systems/city-founding-system.ts:24` atomically consumes the settler and adds the city, but does not explicitly reject cargo. |
| AI recovery | `src/ai/basic-ai.ts:598` only founds where a settler already stands. Its administrative transport unloading at roughly 792 requires hostile territory. `ai-perception.ts` reads own entities through rosters. |
| Breakaways | `createBreakawayFromCity` transfers an actual city atomically. `reconquerBreakawayCity` can leave its former owner cityless without invoking elimination. |
| Unit removal | `removePlayerUnitFromState` removes one unit; unlike combat removal, it does not cascade cargo. Deleting a last-settler transport therefore needs a narrowly scoped correction. |
| Turn timing | `processTurn` increments `turn`, emits `turn:start`, then checks victory. `runCompletedRound` buffers phase events and rolls back on failure. |
| Presentation | `civ:eliminated` currently drives an attacker-owned audio sting; it has no general defeat text registrar. Winner presentation directly reads the winner's name. |

The following read-only runtime probe was run with `yarn tsx --eval`, using the actual source APIs and seed `audit-a1`: create a two-civ game; found the player's city through `foundCityInState`; call `processTurn`, `eliminateCivilization`, and `getLivingNonHumanMajorIds` on separate copies.

```text
baseWinner: player
aiActors: [ai-1]
afterTurn: {gameOver: true, winner: player, remainingAiUnits: 2}
eliminationDeletesSettler: true
ghostRosterWinner: null; ghostRosterActors: []
omittedSettlerActors: []; authoritative ownedAiUnits: 2
```

For the ghost case the AI owns no entities but its city roster contains `city-ghost`. For the omitted case the AI still owns its settler and warrior but its unit roster is empty. These distinguish false survival from false death.

Baseline validation at both `e9447a3a` and final audited base `824ea20e`: the four focused victory/elimination/cycling/scheduler suites passed **34 tests**, and all hook smoke tests passed; both terminal runs completed with exit 0. That proves the existing tests encode/permit the bug, not that it is fixed. No production changes or full-suite/build claim is made in Phase 0.

### Adjacent issue disposition

All adjacent issues were open in the initial fetch. Final GitHub reads confirm #1004 and #1006 are closed, with their implementations on the audited base. The other issue dispositions below retain the initial audit's scope; later phases must refresh them. The new game-creation canonicalization, schema leaf, council prose changes, helper contracts and applicable policy diff were reviewed before updating this plan. They do not change the chosen survival rule.

| Issues | Relationship / decision |
|---|---|
| #1019 / #1020 | Broad owned-city/unit APIs and roster-read migrations are **not prerequisites**. Liveness scans owner fields itself; change only the own-entity reads needed for working AI recovery and direct liveness consumers. Preserve capital ordering. |
| #996 / #997 | Their exhaustive lifecycle work remains separate. Use the structural city/unit/cargo/elimination validators now landed through #1006; add exact transition assertions here. |
| #1001 | Preserve existing teardown and repair directly exposed own obligations/cargo/turn resurrection paths. Do not add its every-GameState-key audit or long-horizon elimination framework here. |
| #1004 | Merged. Use its shared whole-state comparison and creation-time canonicalization; do not add a local equivalence projection or exclusions. |
| #1006 / #1023 | #1006 is merged: reuse the version matrix, fixtures and structural validators. No persisted field/schema bump is required here; add focused survival continuity cases. #1023's migration architecture remains separate. |
| #1002 | Reuse viewer-intel, recipient delivery and the existing handoff veil. This arc supplies differential tests for its own surfaces, not a generic privacy framework. |
| #993 | No big-moment framework dependency. Use existing HUD, notification log, handoff and victory panel; retain the existing elimination sting with recipient safety. |
| #988 | Preserve current diplomacy legality and city gates for individual offers. No war goals or negotiated settlements. |

No hard prerequisite was found. Re-audit before every later phase: newly merged ownership, save, determinism or viewer abstractions supersede this snapshot.

## Chosen game rule

**A major civilization remains in play while it owns a city or a surviving settler. An already completed elimination is terminal.** A surviving settler may found a new city without a deadline. All difficulty settings use the same rule.

| State | Verdict and consequence |
|---|---|
| Owns a city, with or without units | Living. A city's siege HP does not change ownership or liveness. |
| No city; surviving settler | Living, including before first founding. All its other units remain available. |
| No city; only soldiers, workers, spies, generals, missionaries, ships or aircraft | Defeated; remaining units stand down through canonical elimination. No military reconquest grace window. |
| No owned city or settler | Defeated. A stale roster cannot prolong the campaign. |
| Settler has spent its movement/action, is resting or was skipped | Still living. These are temporary action restrictions, not defeat. |
| Settler aboard a surviving, same-owner carrier with reciprocal cargo linkage | Living. It need not be able to unload this turn or from its current position. |
| Missing/dead host, wrong-owner host, self/nested transport, missing reciprocal cargo ID | That cargo settler cannot sustain survival. Another valid city/settler still can. |
| `isEliminated === true`, even with contradictory externally edited assets | Defeated. Do not reopen a completed elimination on load. Full corruption repair is separate. |
| Missing civ ID or non-major owner kind | Ineligible, never counted as a major actor or rival. |

Here **surviving/viable** means a real owned `settler` unit with positive finite health, and, for cargo, a real live host with valid reciprocal ownership/linkage. It is a lifecycle predicate, not a pathfinding proof. The typed gameplay state and canonical load/unload paths own terrain, ship capacity and transport-type validity; this query does not create a second cargo-capability catalog. Tests must exercise all current transport types using `UNIT_DEFINITIONS` in the test fixture, without importing that dependency graph into liveness.

Do not make liveness depend on whether a tile is presently legal to found on, whether an enemy temporarily blocks a route, movement points, visibility, or knowledge of the entire map. A healthy settler can deliberately remain unproductive or be trapped indefinitely; that is an explicit consequence of indefinite settler survival, not survival granted by an irrelevant unit. This phase offers recovery behavior, not guaranteed successful resettlement. The later #985 victory design must evaluate cleanup tedium without silently changing this survival contract.

### Alternatives considered

1. **City or settler, chosen:** preserves first-founding order and a clear escape/rebuild opportunity; eliminates irrelevant-unit cleanup. Derived state avoids a timer and migration. Costs: recovery AI and clear advice are mandatory; trapped settlers can prolong survival.
2. **Last city means immediate defeat:** easy after founding, but needs a separately persisted/derived distinction for never-founded starts, destroys viable settlers, and removes the comeback opportunity. Rejected for this arc.
3. **Any surviving unit, or a grace timer:** any-unit survival lets a ship/aircraft/spy indefinitely block the ending without a recovery economy. A timer is bounded but adds persisted timing, start/reload rules and time-pressure UI. Neither is needed to correct this arc; rejected.

### Vassals, breakaways, owners

An existing vassal with a surviving settler remains a living gameplay actor and retains its relationship. Liveness does not make it sovereign or count it as conquered. An overlord's survival does not save an assetless vassal, and a vassal's survival does not save an assetless overlord. Normal elimination ends the affected relationship bilaterally and releases surviving vassals; no automatic absorption is added.

Creating a new vassal agreement continues to require actual owned cities on both sides under #910. That is an **action-specific city requirement**, not a second liveness rule. Use owner fields for those two existence checks; keep military/peak/cost conditions intact. Cityless living actors can still be contacted and use actions whose existing rules allow them.

`createBreakawayFromCity` must return a state containing its transferred city. Creation cannot start cityless. Subsequent loss uses the same rule, including the reconquest branch that currently returns early. Full negotiated reabsorption transfers the entity set before deleting the breakaway record; it is not elimination and must not create a fictitious defeat event. Do not count minor civs, regional compacts, barbarians, pirates, rebels, beasts or crisis forces as majors, even if a malformed fixture puts such an ID in the civilization map.

## Canonical authority and API

Create `src/systems/civilization-liveness.ts` with **one exported runtime query**:

```ts
export type CivilizationLivenessState = Pick<GameState, 'civilizations' | 'cities' | 'units'>;
export type CivilizationLiveness =
  | { living: true; reason: 'city' | 'settler' }
  | { living: false; reason: 'not-major' | 'eliminated' | 'no-survival-assets' };

export function getCivilizationLiveness(
  state: CivilizationLivenessState,
  civId: string,
): CivilizationLiveness;
```

The query checks major-owner classification plus actual own membership in `civilizations`, then the terminal marker, actual cities by `city.owner`, then viable settlers by `unit.owner`. It never reads civilization rosters. Prefer short-circuit iteration; no caches, state writes, events, RNG or load-time roster repair. Its only runtime import is the leaf owner classifier. Keep viability helpers private. Consumers use `.living`; the reason is for cleanup and the owner's explanatory UI.

This leaf boundary matters: importing `unit-system`, `transport-system`, diplomacy or tech into liveness would create new cycles when those modules start consuming it. Cargo links can be checked structurally without importing the mutable gameplay graph. A future second city-founding unit type requires an explicit rule change; a catalog regression must fail if `canFoundCity` expands beyond the current settler definition.

| Concept | Meaning |
|---|---|
| Living | The canonical query returns `living: true`. |
| May take a turn | Living, plus controller/seat/once-per-round constraints. Identical survival rule for human and AI. |
| Counts against the current victory ending | Every living major, including a living vassal and a newly created breakaway. |
| May receive diplomacy | Living plus contact and action-specific legality. Owning a city is not a universal diplomacy-list filter. |
| Historically exists | The record/history may remain after elimination. Never use record existence as actor eligibility. |
| Eliminated marker | Persisted terminal transition fact. It is not a derived cache that gets reset from rosters. Unmarked assetless actors already query as defeated and are finalized at the next stable lifecycle boundary. |

No Domination progression model is added. `checkDominationVictory` preserves its existing at-least-two-major-records guard and returns the sole living major, if any. A sole remaining cityless settler can therefore be that winner. Zero living majors gives no Domination winner. Preserve historical eliminated major records as today; negotiated deletion of breakaway records remains existing behavior.

## Atomic lifecycle and timing

Keep `eliminateCivilization` the only unit/obligation teardown owner. Change its admission check to `getCivilizationLiveness(...).reason === 'no-survival-assets'`. A living actor or already completed elimination is a no-op. Permit `eliminatedBy: string | null`: null represents abandonment, disband, environmental loss or a boundary cleanup with no known victor; never invent a civ ID.

Add a coordinator beside the query, **in the elimination module**, which compares an explicit before/after pair, finalizes every unmarked defeated major in stable ID order, and returns transitions. The emitter consumes those returned transitions. It does not infer eliminations by scanning marked actors on every render. Return no transition for an already marked actor, and no transition for a newly created city's initial existence.

```ts
export type CivilizationLivenessTransition =
  | { kind: 'cityless' | 'resettled'; civId: string }
  | {
      kind: 'eliminated'; civId: string; eliminatedBy: string | null;
      removedUnitIds: string[]; removedSpyIds: string[];
      releasedVassalIds: string[];
    };
export interface CivilizationLivenessReconciliation {
  state: GameState;
  transitions: CivilizationLivenessTransition[];
}
export function reconcileCivilizationLiveness(
  before: GameState,
  after: GameState,
  eliminatedBy?: Readonly<Record<string, string | null>>,
): CivilizationLivenessReconciliation;
export function emitCivilizationLivenessTransitions(
  result: CivilizationLivenessReconciliation,
  bus: EventBus,
): void;
```

The comparison records city → settler and settler → city only for the same actor present before and after. Cleanup is based on the after state even when the actor was already assetless in the before state. A silent reconciliation can pass `(state, state)` and omit emission. There is no gameplay recursion: the query never calls elimination; cleanup never calls reconciliation.

Make the existing raw `reconquerBreakawayCity` transfer a private helper in `city-capture-system.ts`; its only two live callers are already there. Both complete capture entry points reconcile after their project/territory effects. Remove the incomplete public export from `breakaway-system.ts`, and exercise reconquest tests through `resolveMajorCityCapture`. This keeps one transition owner without introducing a capture/breakaway import cycle. `tryReabsorbBreakaway` remains a complete state-returning API with an optional final bus argument: transfer all actually owned cities, units and their territory before removing the absorbed record, then reconcile and emit once. Additional cities acquired since secession cannot be orphaned by deletion. Its diplomacy caller passes the bus; deleted records do not produce defeat events.

| Boundary | Required behavior |
|---|---|
| Capture/raze/transfer/reconquest | Finish ownership transfer, aircraft/cargo and project consequences first; reconcile, return final state and emit once from the source event path. Never eliminate a settler escape. |
| Founding | Validate actor and reject `transportId`; consume settler AND add city before reconciling. No intermediate last-settler death. |
| Unit combat/capture | Finish reward, civilian conversion, cargo/aircraft cascades and history before reconciliation. A captured settler converted to a worker does not preserve the old owner's survival. Attribute only actually affected victims. |
| Voluntary unit deletion | Canonical removal includes carried cargo; reconcile after the complete removal. Confirming deletion of the final survival asset explains defeat in advance. |
| Breakaway creation / reabsorption | Finish all city/unit transfers first; reconcile remaining majors. Creation gets a city. Removed reabsorbed records do not produce defeat messages. |
| AI round | Reconcile before normalizing/planning; eligibility comes from the query. Revalidate against working state immediately before each actor executes; reconcile afterwards, before another actor can act. |
| World turn | Reconcile before gameplay effects and after ownership/unit-loss phases. Skip defeated actors in active per-civ processing. Reconcile again before finalization/victory; no unit/economy/AI resurrection. |
| Save load | Query derives the same verdict. No liveness events, city founding, resurrection or forced new victory on load. Existing completed outcomes stay completed. Runtime boundaries finalize unmarked legacy assetless actors. |

`processTurn` retains the externally visible ending order: process current round → finish lifecycle cleanup → finalize opponent state → increment `turn` → emit `turn:start` → compute `gameOver`/`winner`/reason. Do not add a mid-human-action positive victory check in this arc. Tests pin the increment and event ordering. The authoritative query can show defeat and remove eligibility immediately after a completed action, even though the positive campaign outcome is evaluated at round completion.

Pending city-capture choice is not yet a completed capture. Do not reconcile an intermediate attacker/defender state as the final outcome. End-turn is blocked by the existing action/choice gates; preserve the current city-choice and handoff overlay ordering. Pending peace requests are not automatically victory blockers: eliminate invalid endpoints as part of teardown; unrelated pending requests must not hold a completed game open. Test these distinctions, not a blanket “any pending request blocks victory” rule.

### Teardown and history

Preserve the existing removal of owned units/spies, incoming diplomacy/war/treaty references, vassalage links, pending requests/events, AI portfolios and assignments, surveillance targets, embargoes, league membership and live trade obligations. Explicitly clear the eliminated actor's own city/unit rosters and active war/treaty/relationship obligations. Clear/terminate its active autonomy plans and targeted active pressure/crisis work that could act after defeat, using existing typed lifecycle/normalization APIs where available. Do not wholesale delete another owner's units or shared regional-compact history.

Keep civilization identity, score/tech history, discovery/contact memory, historical strategic-strike facts, notification/chronicle history, religion founder attribution, general career history and expired/completed pressure history. Generalizing a top-level elimination metadata registry is #1001, not this MR. Exact changed paths get no-resurrection tests for the human source, a non-human source and one subsequent world turn.

## AI recovery

Add `src/ai/ai-resettlement.ts`, exposing `processAIResettlement(state, civId, bus): GameState`. Call it from `processAITurnInternal` before strategic preparation/execution, then refresh the actor/perception if it changed the state. It applies only to a canonical settler-surviving, cityless, non-human actor. Established expansion remains the current strategic behavior.

Before recovery, `basic-ai` collects the recovering settler IDs and their actual host IDs into an invocation-local reservation set. Exclude these IDs from subsequent administrative founding, cargo and pillage actions. Add an optional final options argument `{ excludedUnitIds?: ReadonlySet<string> }` to `processMajorCivStrategicTurn` and `processAIUpgrades`; propagate the set through both so tactical assignments, existing upgrade routes and new upgrade candidates cannot spend a reserved unit again. This changes neither saved plans nor the recovery API's state-only return.

Use authoritative own units (also fix the two own-entity reads in `ai-perception.ts`) so omitted rosters cannot cause survival without agency. Sort settler IDs and use deterministic distance/hex-key ties. Recovery priority:

1. An unembarked settler on a legal currently observed site founds through `foundCityInState`.
2. Otherwise move one legal path step toward an observed reachable site; use the existing path/movement executors, recompute after every action, and never spend movement twice. On arrival, found only if action legality still permits it.
3. An embarked settler first tries a legal currently visible land destination, preferring one where it can establish a city. Unloading spends its action; founding waits until the next legal turn. If needed, move its ship toward a visible accessible coast with a known recovery site. Reserve recovery settlers/ships from the old hostile-only unload/reload loop and strategic orders for that turn.
4. If no known settlement site is reachable, explore toward a frontier reachable through observed terrain, revealing at most the next step through ordinary movement. If temporarily blocked, wait and reevaluate next turn. Never enumerate hidden cities to choose a better target, infer the enemy's strength from authoritative state, or search through unrevealed terrain.

Planning uses the actor's current visibility/perception: currently visible terrain and known city positions. Execution still calls authoritative founding/unloading/movement legality, exactly like human actions, and may reject an attempted action. A hidden blocker must not redirect the plan to a secret alternative before any observation occurs. No new RNG, persistent recovery targets, global map oracle, research/production strategy or difficulty-specific survival rule.

## Player experience and viewer safety

Owner-only persistent HUD text, derived on every `HudController.update()`:

- Settler survival: **“Your civilization is still in play. Found a city with a settler to rebuild.”** Use the same truthful text before first founding; no historical “you lost a city” claim is inferred from citylessness.
- Defeated current owner: **“Your civilization has no cities or surviving settlers. Its remaining units have stood down.”** For a legacy terminal marker, use **“This civilization has been eliminated.”** Do not claim why a historical defeat happened when that reason was not stored.
- Established: no liveness banner. Founding must remove the banner immediately after the live action.

Use a small `getCivilizationStatusForViewer(state, viewerId)` projection and a simple status element (`data-role="civilization-status"`), not a new modal or progress panel. Projection returns only that viewer's own status/copy. Enemy citylessness, settler IDs, counts, positions and ship names are never projected. Existing unit selection and cargo controls remain the way to act; this arc does not add an unimplemented “go rebuild” button.

Remove the redundant roster-membership filter from `getUnmovedUnitsForEndTurn`: its underlying selector already filters actual units by owner. An omitted but real settler must remain reachable through the existing end-turn action prompt. Keep the existing action/transport eligibility filters and ordering; this is a narrow recovery-agency correction, not the #1020 roster migration.

City → settler and settler → city source transitions deliver one recipient-owned log/notification; no per-round repeats. Elimination delivers owner-only explanatory copy and, to its known responsible human victor, **“The rival civilization has been defeated.”** A name may be included only through established viewer-intel entitlement; omit positions and removed-unit details. Do not call `getLivingHumanViewerIds` to deliver the victim's own defeat: a defeated viewer still owns its history.

The diplomacy panel lists a met living cityless rival using existing viewer-intel gates; it does not display why it is alive. Remove only the universal owned-city list filter. Preserve city requirements for new vassalage offers and other specific actions. A dead rival disappearing is the existing diplomatic availability fact; no new global announcement is added. An unmet rival remains absent even when alive or newly defeated.

Winner text must use viewer-intel entitlement; an unknown winner is **“Another civilization”**, not its hidden name. Keep the current victory panel and muted-audio preferences. A `civ:eliminated` event with null/unentitled attribution must not play a conquest sting for the current seat. No #993 framework or new assets.

### Hot-seat and solo outcome

Living cityless seats stay in configured order. An eliminated seat is omitted by `getActiveHumanPlayers`; `getNextActiveHumanPlayerId` and `isActiveHumanRoundComplete` already compose that helper and must preserve later-seat and wrap semantics. AI actor enumeration uses the identical query.

If a seat loses during another human's action, its private map/log/status is not shown on the active seat's screen. The handoff veil includes a static, publicly shareable seat roster: **“Out of this game: [configured player names]”** for configured humans whose canonical verdict is defeated. Show no civ identity, cause or assets. This is current roster text, not a repeated toast or a queued historical event; it needs neither a new persisted ledger nor transient event attribution. Each normal owner status is rendered only after readiness releases the veil. Reload derives the same current roster without replaying a defeat notification.

An eliminated current human may still acknowledge its own status and finish handing off; skip production/research/boon and unmoved-unit prompts for that defeated actor. Do not wait forever for a choice it cannot make. If no living humans remain, resolve `all-humans-eliminated` for solo as well as hot seat at the completed-round outcome boundary unless a positive Domination result already ended the campaign. Preserve the existing outcome priority. If a later human is eliminated mid-round, do not run the AI/world round twice or skip its completion.

### Player Truth Table

| Before | Action / transition | Immediate visible result |
|---|---|---|
| Has final city and an escaping settler | Opponent completes capture | Owner gets status/log at its entitled viewing point; its settler and other units remain. Attacker gets no escape location/count. |
| Cityless owner | Select settler / open carrier | Existing legal movement, founding and cargo actions remain reachable; status explains the goal. |
| Cityless owner on legal site | Found city | City appears, settler is consumed, status disappears without reopening a panel or waiting a turn. |
| Cityless with only one settler (or its host) | Open Delete confirmation | Explicit defeat consequence; Cancel preserves all state. |
| Same confirmation | Confirm | Complete unit/cargo cleanup; status explains defeat; turn flow remains usable. |
| Met rival is living but cityless | Open diplomacy | Rival remains listed; city-dependent offers remain unavailable; no cityless label. |
| Human A loses during B's turn | B ends turn | Neutral seat notice under the veil; no A-private information; next living seat only. |

### Misleading UI Risks

“Still in play” requires the canonical positive verdict. A military-only army, zero-health settler, orphan cargo or terminal marker must not produce it. “Rebuild” is advice, not a promise that the current tile is legal. “Eliminated” is not inferred from a missing roster. Historical marker copy must not invent a recorded reason. Two viewers must never share cached owner status or an unknown winner's name.

### Interaction Replay Checklist

Replay capture → owner handoff → select/move/unload → end turn → found → immediate HUD refresh; repeat HUD updates; cancel and confirm last-asset deletion; repeated clicks against a removed unit; close/reopen diplomacy; eliminate an intermediate configured seat; retry failed handoff persistence; reload before/after defeat. There is no new queue or ETA surface, so queue reorder/ETA cases are not applicable.

## Save and determinism contract

No new persisted fields; keep current schema 28 unless unrelated main drift changes it. `isEliminated` continues to persist terminal transitions. Do not retroactively reopen old `gameOver` saves; units deleted by an older version cannot be reconstructed.

`normalizeVassalage` and `normalizeOpponentAIState` use canonical actor eligibility. Their job is compatibility sanitation of active references, not gameplay resurrection. Preserve current migration ordering and current/future-version error behavior. Do not repair all city/unit rosters or reorder capitals on load. Query verdicts must be identical across save/load for (a) city-only, (b) settler-only, (c) embarked settler, (d) stale rosters in both directions, (e) assetless unmarked, and (f) terminal elimination states.

Test uninterrupted versus serialized/`normalizeLoadedState` continuation immediately before a final-city capture and before losing the last settler. Use the merged `assertSimulationEquivalent` helper for whole-state comparison, plus explicit liveness, outcome and schema assertions. No arbitrary exclusion of a changed simulation field. On valid gameplay transitions call `assertSaveStateInvariants`; on intentionally malformed query fixtures assert the exact survival verdict without pretending their rosters are valid. Separately test load idempotence and no duplicate notifications/stings from normalization. Stable ID order controls multi-actor cleanup; no random draws are added. Retain the existing #1006 all-version matrix in durable verification rather than creating a competing matrix.

## Structural enforcement

Enforce the new contract through the existing `scripts/check-src-rule-violations.sh` and `.claude/hooks/check-src-edit.sh`, backed by one shared checker and pass/fail tests. A small Node/TypeScript-AST checker can use the already installed TypeScript dependency; it must accept explicit file paths and parse source without executing it.

1. Reject runtime `isEliminated` reads/writes outside the canonical query's read and elimination's true assignment. Permit its type declaration; comments/string prose do not count. Catch property access, optional chaining, literal element access and destructuring. No broad folder allowlist, historical “all old matches are okay” baseline, or false exemption for storage/presentation.
2. In the four original liveness entry functions, reject roster-based conditional liveness (`cities`/`units` length/some/filter checks), while permitting elimination's roster cleanup writes and scheduler accesses needed to revalidate a specific plan target elsewhere in the file.
3. Catch a newly declared obvious `*Alive*`/`*Living*`/`*Eliminated*` predicate derived directly from a roster, as demonstrated by the pirate contract regression. Do not reject economic city counts, supply arithmetic, capital ordering, city-list empty states or last-city assault mechanics just because they use `.length`.
4. A structural integration test verifies every inventoried consumer uses the canonical query or an explicitly composed eligibility helper, and that the live HUD, registrar and controller paths are wired. Source rules are defense against known duplication shapes, not a proof against arbitrary semantic rewrites.

The checker must work from a worktree and from the existing temporary-workspace script tests. Its explicit CLI is `check-civilization-liveness.mjs --source-root <root> <absolute-target-path> [...]`. Resolve parser dependencies from the checker's repository. The calling gate resolves target paths and captures the source root before entering the mise wrapper, so a wrapper directory change cannot select another worktree's files. Source-root-relative paths drive the exact allowlist. The JSON hook derives the source root from its absolute target's `src/` ancestor, including temporary fixture workspaces. Both hook and CLI use the same implementation and preserve exit 2 diagnostics. Add no new dependency or lint platform.

## Required regression matrix

The implementation plan maps these cases to concrete test files and order.

- Core: city+units; city only; initial citylessness; settler only; military/worker/general/spy/naval/air only; no assets; spent/resting settler; each catalog transport; blocked unloading; orphan/wrong-owner/nonreciprocal/dead host; zero-health settler; terminal marker; every non-major owner kind.
- Rosters: ghost city; unrostered actual city; ghost unit; unrostered actual settler; foreign-owned IDs in both rosters. Assert canonical, victory, scheduler and hot-seat agreement.
- Lifecycle: last-city occupy/raze/transfer/reconquest; last settler combat death/capture/conversion; host destruction and voluntary removal; founding atomicity; two eliminations in one reconciliation; repeat reconciliation; previous input unchanged.
- Roles: living/defeated vassal and overlord; new vassalage city gate; breakaway creation/reconquest/reabsorption; minor-civ compact remains outside the major roster.
- AI: cityless actor scheduled, unrostered settler usable, legal land recovery, neutral shore unload then later founding, ship travel, blocked step/frontier behavior, no hidden-map plan differences, all challenge modes, no dead actor execution.
- Timing: `processTurn` exact outcome order; no units/plans resurrect next turn; rollback discards state/events; capture choice pending; unrelated peace pending; eliminated human can end/handoff; last/intermediate human loss; zero-living-human solo and hot seat.
- Presentation: immediate status refresh/removal, delete cancellation/repeat-click, diplomacy reachability/negative city gates, unknown rival/winner, two viewers, defeat recipient survives eligibility filtering, no log/audio replay on load.
- Save/guard: pre-transition roundtrip continuation, current/legacy marker behavior, normalizer idempotence, source checker deliberate violations and acceptable city arithmetic.

## Mandatory design review — completed inline

Review instruction: “perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.”

| Dimension | Finding / evidence inspected | Severity | Required fix | Resolution |
|---|---|---|---|---|
| Balancing gameplay | Any-unit scheduler conflicts with victory; a ship can sustain irrelevant cleanup. | High | Choose useful recovery asset and identical difficulty legality. | City/settler rule; no naval/air-only survival; explicit stranded-settler tradeoff. |
| Fun | Elimination deletes escape settler; indefinite survival can prolong play. | High | Preserve rebuild opportunity and describe its bounds honestly. | Settler survival chosen; no fabricated guaranteed recovery/timer; #985 assesses ending tedium later. |
| New mechanics | Timer would add undocumented save/turn semantics. | Medium | Avoid an implicit timer or pre-founding exception. | One derived rule before and after founding. |
| Ages 7–43 | Marker/audio currently gives no understandable explanation. | High | Plain owner text and destructive-action warning. | Exact HUD, log and Delete copy contract above. |
| Play styles | Expansion and escape differ from military-only reconquest. | Medium | State what remains legal. | Settler rescue supported; military-only defeat explicit; diplomacy remains reachable. |
| Difficulty modes | AI-pressure settings are orthogonal to survival. | Medium | Preserve pressure policy after canonical eligibility. | Same rule Explorer/Standard/Veteran; retain setting gates. |
| Computer players | `basic-ai` founds in place; unloading requires hostile land; perception trusts rosters. | High | Give cityless AI an executable recovery path. | Dedicated recovery before planning, own-entity fixes, explicit tactical/upgrade exclusions and fog-bounded tests. |
| UI | Diplomacy universal city gate would hide living rivals. | High | Remove universal gate, retain per-action gates. | Specified list and negative vassalage tests. |
| UX | Last-asset deletion can strand the turn behind research choices. | High | Explain deletion and allow defeated-owner handoff. | Gate choices by liveness; explicit replay cases. |
| Architecture | World-age API lacks entities; liveness imports can create cycles. | High | Widen world-age input; make query a leaf. | Exact Pick-based API; no unit/transport/diplomacy runtime import. |
| Extensibility | Raw-flag cleanup alone misses pirate roster predicates. | Medium | Guard known duplication shapes and catalog expansion. | Shared checker plus piracy and founding-capability regression. |
| Data | Roster omission still defeats scheduler; marker reversal would resurrect old saves. | High | Owner authority and terminal marker. | Query never reads rosters; no automatic marker reset. |
| SFX | Null/unseen victor could trigger misleading conquest audio. | Medium | Keep source attribution optional and recipient-safe. | No null/unentitled sting; existing mute preferences remain. |
| Saved games | Issue's v27 assumption is stale; newly merged helpers change test obligations. | High | Audit current schema, reuse shared helpers and preserve completed results. | Schema 28, no new field; #1004 whole-state comparator, #1006 invariants/matrix and focused continuity. |
| Testing | Existing passing victory tests assert the premature win. | High | Replace fixtures/expectations with regression-first cases. | Live probe captured; 38 requested categories expanded above. |
| Solo regressions | Hot-seat-only all-human defeat could leave solo empty forever. | High | Resolve zero-human outcome in solo too. | Completed-round outcome parity with existing Domination priority. |
| Hot-seat regressions | Eliminated seat will never receive a normal turn; private defeat toast could leak. | High | Separate neutral configured-seat roster from owner history. | Static veil roster, owner-scoped log, no replay ledger, retry tests. |
| Proper implementation | Reconquest early return and transport deletion bypass complete lifecycle cleanup. | High | Finish atomic operations, then shared reconciliation. | Private reconquest stage with both outer callers tested; explicit source-boundary matrix; no transient founding elimination. |

All findings above are resolved in this design contract. They are implementation requirements, not claims that the current production defects are fixed. The separate plan review must check each has a concrete task and test before handoff.

## Non-goals and escalation

No #985 progress, capital-control or vassal-victory rule; no new victory types; no #1019/#1020 global roster migration; no #1001 all-fields registry; no general save architecture, determinism/privacy framework, war goals, new audiovisual assets or distribution-specific behavior. No main-worktree production edit, subagent, automatic model switch, Phase-0 PR, push or merge.

Escalate to Astra if current main invalidates terminal-marker semantics, introduces another founding unit/cargo lifecycle, changes the victory timing contract, removes necessary source mutation boundaries, or makes recovery depend on a broad prerequisite. Mechanical source moves, new mirrored tests and use of an already merged canonical helper are drift reconciliation, not permission to redesign the rule.
