# Issue #985 — Domination victory implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` task by task **inline**. No subagents and no fast mode. Steps use checkboxes for implementation tracking. Terra High implements; Sol High reviews and fixes the actual diff; Luna Medium creates the MR, watches CI and merges after its gate. Do not skip the human model-switch stops.

**Goal:** Ship the reviewed sovereignty-based Domination path, visible observer-safe progress, useful rival warnings, and purposeful legal AI pursuit/counterplay.

**Architecture:** One authoritative adapter consumes canonical liveness and a small rule kernel. An observer-neutral knowledge layer uses own facts and earned intelligence; UI formatting and AI doctrine are separate consumers. Existing capture, diplomacy, round processing, save registries, panel routing and warning delivery own mutations and lifecycle.

**Tech stack:** Existing TypeScript, Vitest/jsdom, Canvas/DOM, EventBus/GameEventBuffer, Yarn/mise, Playwright and IndexedDB/localStorage/file saves. No new dependencies.

Repository destination: `docs/superpowers/plans/2026-09-08-issue-985-domination-victory-implementation.md`.
Controlling contract: [Domination design](../specs/2026-09-08-issue-985-domination-victory-design.md).

## Status and preserved decisions

- Phase A: current-main audit, design, plan, and both inline reviews complete. No production implementation.
- MR1, MR2, MR3 and MR4: **not started**.
- All Terra/Sol/Luna gates and merge confirmations: **not started**.

Final source baseline: `8e7bbb512669b716f453849c3cac7798cd0577b4`. The initial audit used `644c9d64a6171cb5eeffaf1008b5e55a449a7388`; #1041 landed during Phase A and its two commits/source hunks were inspected after rebase. #995 and #1039 then landed through PRs #1052/#1053; their relevant source, repair, validator and guard changes were inspected and the worktree rebased again. #995 is closed, its merge prerequisite is satisfied, and no open PR remained at the final check. Any major-war load must reuse the newly landed `majorCivWarOpponentIds`; raw count is intentionally retained for ambience. Worktree: `/Users/aaronfleckenstein/development/github/conquestoria/.worktrees/issue-985-domination-design`; branch `codex/issue-985-domination-design`. Preserve these documents when rebasing. A documentation commit may be ahead of the source baseline. The initial victory/liveness baseline passed 2 files / 22 tests. After the final rebase, victory/liveness plus the landed bilateral-war suite passed 3 files / 35 tests and all hook checks, exit 0. Counts are historical evidence, not expected forever.

### Decisions Terra must not redesign

1. “Be the last independent empire: defeat the other empires or make them your vassals.” No Science/Culture, new surrender demand or progress buff.
2. Consume `getCivilizationLiveness`; viable settlers block and a sole independent viable settler may win. No new city-only winner requirement, timer or roster liveness.
3. Only valid direct bilateral #910 vassalage counts. No inheritance of a defeated overlord's subjects, cycles, nesting or pending-offer credit.
4. Provisional secession requires every condition in design §5, including exactly one actual city and a qualifying independent city-owning established origin. Zero-city settler, growth, deadline or origin loss removes the exception. Do not change the existing 50-turn mechanism.
5. At least two founding non-breakaway major records are required for a competitive campaign. Established breakaways can win such a campaign.
6. Finalize once at the completed world round, turn N+1, before `turn:start`; preserve every eligible human/AI's opportunity and completed outcomes.
7. Only live actionable candidate-vassal independence petitions defer finalization. Pending capture blocks round entry. Unrelated peace offers are not a veto.
8. Exact own earned progress; no global visible denominator. Rival reports use earned identities, dates, and unconfirmed status. Unknown status counts as unresolved for warnings.
9. Persist earned intelligence only, with next ordered schema step (29 at baseline), empty legacy backfill, and structural repair. No persisted progress/cache/countdown.
10. AI uses shared knowledge, ordinary legal actions, existing readiness and known-map limits. MR4 requires #995 merged. Do not implement against an anticipated unilateral fallback.
11. Four complete MRs and human model handoffs. No MR creation by Terra; no merge by Sol.

## Task 0 — Fresh drift check before each phase and slice

**Read:** current repository `AGENTS.md`, `CLAUDE.md`, matching `.claude/rules/` files; both design/plan documents; issue #985 comments; #1050 merged result; open PRs and #995/#993/#1002 status. For UI, read `.claude/skills/button-styling.md` and `docs/superpowers/plans/README.md`. Repository/user instructions override skill delegation suggestions.

- [ ] Fetch and inspect the active worktree without switching another checkout:

```bash
git fetch origin main
git status --short --branch
git log -30 --oneline --decorate origin/main
git diff --stat HEAD..origin/main
git diff --stat origin/main...HEAD
git diff --stat
git config --worktree --get core.hooksPath
gh issue view 985 --repo a1flecke/conquestoria --comments
gh issue view 995 --repo a1flecke/conquestoria
gh pr list --repo a1flecke/conquestoria --state open --json number,title,headRefName
```

Use the GitHub connector equivalents if CLI authentication/network is unavailable. Read-only API calls do not authorize comments/messages. If upstream moved, inspect changed relevant files and rebase the active clean branch with `git rebase origin/main`. Preserve existing user changes; never reset them. Recheck policies/toolchain and changed lockfile; use `bash scripts/run-with-mise.sh yarn install --immutable` only when necessary. For a new slice worktree, run `./scripts/setup-git-hooks.sh`, verify `.githooks`, and trust that worktree's `mise.toml`.

- [ ] Compare active PR files/hunks with this slice's exact inventory. #1051/#1052/#1053 all landed during the design audit. Preserve their major-war count helper, bilateral war/peace APIs, repair/invariant and movement-focus fixes; do not treat these former dependencies as still open. Stop for an actual conflicting active implementation, identifying PR, file and hunk. Do not silently absorb #1041/#995/#1039.
- [ ] Record source SHA and current actual statuses in the working notes. New source drift is reason for focused validation; unchanged docs do not justify repeated full suites.
- [ ] For initial MR1, run the narrow baseline once:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/victory-system.test.ts tests/systems/civilization-liveness.test.ts
```

Expected: assertions pass and command exits 0. Preserve a running session until it exits. After **two materially similar failures**, stop and report instead of retrying. Distinguish an assertion failure from a fixture/import/tool failure; a broken fixture is not TDD evidence.

## Contracts and caller inventory

New contract names below are proposed definitions, not existing APIs. Type declarations belong in `src/systems/domination-types.ts` except the persisted GameState type reference, which belongs in `src/core/types.ts`. The design §7–§10 supplies exact data fields.

```ts
// domination-rules.ts: pure facts, no GameState/renderer/storage imports
classifyDominationRival(fact: DominationActorFact, contenderId: string):
  'exempt' | 'secured' | 'unresolved';
evaluateDominationFacts(facts: readonly DominationActorFact[], contenderId: string,
  competitive: boolean): DominationProgress;

// domination-sovereignty.ts: one canonical classifier, two bounded entry points
getDominationActorFact(state: GameState, civId: string): DominationActorFact | null;
buildDominationActorFacts(state: GameState): DominationActorFact[];

// victory-system.ts: authoritative adapter; retains existing public check name
getDominationProgress(state: GameState, contenderId: string): DominationProgress;
checkDominationVictory(state: GameState): string | null;
getDominationResolutionBlocker(state: GameState, contenderId: string):
  { kind: 'independence'; requestIds: string[] } | null;
finalizeDominationVictory(state: GameState, bus: EventBus): GameState;

// domination-intel.ts: immutable source-owned earned observations
recordDominationDefeat(before: GameState | null, after: GameState,
  event: { civId: string; eliminatedBy: string | null }): GameState;
recordDominationPoliticalReport(state: GameState, observerId: string,
  contenderId: string): GameState;

// domination-knowledge.ts: shared by AI and human presentation
buildDominationKnowledge(state: GameState, observerId: string): DominationKnowledge;
deriveDominationThreats(knowledge: DominationKnowledge): DominationThreat[];

// domination-presentation.ts: formatting, never authoritative progress
projectDominationProgressForViewer(state: GameState, viewerId: string): DominationPanelModel;
projectDominationOutcome(state: GameState, viewerId: string | null): DominationOutcomeModel;
// viewerId=null requests the shared hot-seat result, not an omniscient view.

// UI: no GameState imports
createVictoryProgressPanel(model: DominationPanelModel,
  callbacks: DominationPanelCallbacks): HTMLElement;
```

`DominationThreat` is `{ contenderId: string; reportTurn: number; securedKnownRivals: number; unresolvedKnownRivals: number; confidence: 'reported' }`. `DominationPanelCallbacks` is `{ onClose(): void; onOpenDiplomacy(): void; onOpenCity(cityId: string): void; onOpenEspionage(): void }`; city IDs are only owned/entitled IDs in the DTO. General scouting guidance is text, not a button to a hidden tile.

`DominationPanelModel` is `{ viewerId, ruleText, ownStatusText, ownVassalCount, ownEarnedDefeatCount, rows, uncertaintyText, guidance }`. Each row is `{ civId, civName, evidence: 'current'|'reported'|'unknown', reportTurn: number|null, text: string, warning: boolean }`. Guidance is a discriminated union of text, diplomacy, owned-city and espionage navigation. No `totalWorldRivals`, coordinates from reports, `conditionMet`, hidden ordinal slots or raw civ references. `DominationOutcomeModel` is `{ title, outcome: 'victory'|'defeat'|'shared', winnerLabel, explanation, turn, standings: Array<{ playerName: string; won: boolean }> }`; solo standings is empty. The shared result uses configured human names and generic AI identity only.

| Owner | Existing caller / integration | Change boundary |
|---|---|---|
| `victory-system.ts` | `turn-manager.ts:processTurn` and victory tests | Keep single final formula/adapter; no UI/AI import |
| `processTurn` | `turn-flow-controller.ts:runCurrentCompletedRound`, simulation/save fixtures | Tail reconciliation → increment → finalization → start event; same world ordering |
| Capture lifecycle | `city-capture-system.ts:resolveMajorCityCapture`, `transferCapturedCityOwnership`; `input/city-assault-flow.ts:finalizePlayerCityAssaultChoice` | Preserve pre-loss state for observations; no early victory |
| Other liveness callers | `unit-lifecycle-system.ts`, `combat-reward-system.ts`, `city-founding-system.ts`, `breakaway-system.ts`, `turn-manager.ts`, `ai-round-scheduler.ts` | Recorder in canonical elimination/reconciliation; audit direct vs reconciliation calls |
| Diplomacy | `diplomacy-system.ts` #910 proposal/accept/release/independence; `ui/vassalage-controls.ts` | Read existing valid role contract; generic consequence copy; later final #995 mutation APIs |
| Espionage | `espionage-system.ts` successful `gather_intel` result application | Record filtered target-owned report before existing acquired event |
| AI preparation | `ai-prepared-turn.ts:objectiveCandidates`, `prepareMajorCivStrategicPlan` | Shared doctrine, known peaceful target preparation and bounded scoring |
| AI execution | `basic-ai.ts:canDeclareWarForPreparedPlan`, prepared diplomatic decision loop | Revalidate doctrine at execution; lawful transitions only |
| AI military/production | `ai-major-turn.ts`, `ai-unit-assignment.ts`, `ai-production.ts` existing force-demand consumers | Reuse; modify only if an identified demand fails to reach the existing consumer |
| Warnings | `strategic-warning-system.ts:derive/applyStrategicWarningTransitions` | Add human-or-AI Domination contenders, existing key/audio state |
| Warning presentation | `ui/strategic-warning-presentation.ts`, `core/hotseat-events.ts`, existing notification delivery | Current kind/payload fields, explicit recipient and acknowledgement |
| Live panels | `app/bootstrap.ts` panel registry, `panel-registry.ts`, `panel-actions-controller.ts`, `game-shell.ts` | One working launcher/factory; subscription and handoff disposal |
| Advisor | `ui/advisor-system.ts:warchief_domination_hint` | Replace the early conquest-only hint; preserve its early-turn schedule |
| Outcome | `turn-flow-controller.ts:handleVictoryIfNeeded`, `ui/victory-panel.ts` | Safe DTO, shared hot-seat result; no raw winner name |
| Presentation hook | `core/types.ts:GameEvents`, `presentation/register-civilization-presentation.ts` | `victory:resolved` once, recipient-safe message; #993 adapter if present |
| Save | `core/game-state.ts`, `core/types.ts`, storage registries + matrix | Initialize ledger; next ordered migration, separate shape repair and generated docs |

## MR1 — Rule, progress core and completed-round timing (not started)

### Task 1.1 — Pure rule and authoritative facts

**Create:** `src/systems/domination-types.ts`, `src/systems/domination-rules.ts`, `src/systems/domination-sovereignty.ts`, `tests/systems/domination-sovereignty.test.ts`, `tests/systems/domination-rules.test.ts`, `tests/systems/domination-progress.test.ts`.
**Modify:** `src/systems/victory-system.ts`, `tests/systems/victory-system.test.ts`.
**Reuse:** `tests/systems/helpers/civilization-liveness-fixture.ts`, `getCivilizationLiveness`, `isMajorCivOwner`.

- [ ] Write red kernel tests first. Use deliberately small facts; test each conjunct, then test the GameState adapter separately with actual entities.

```ts
const independent = (civId: string): DominationActorFact =>
  ({ civId, disposition: 'independent', overlordId: null });
it('requires every rival to be eliminated or directly subordinate', () => {
  const facts: DominationActorFact[] = [independent('a'), independent('b'),
    { civId: 'c', disposition: 'vassal', overlordId: 'a' }];
  expect(evaluateDominationFacts(facts, 'a', true).conditionMet).toBe(false);
  facts[1] = { civId: 'b', disposition: 'eliminated', overlordId: null };
  const result = evaluateDominationFacts(facts, 'a', true);
  expect(result.conditionMet).toBe(true);
  expect(result.securedRivalCount).toBe(2);
  expect(evaluateDominationFacts(facts, 'c', true).eligible).toBe(false);
  expect(evaluateDominationFacts(facts, 'a', false).conditionMet).toBe(false);
});
```

- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/domination-rules.test.ts`; expect a missing contract first, then actual assertion failures after declarations exist. Do not count missing imports as the red behavioral proof.
- [ ] Implement the kernel: sorted unique actor records; exclude provisional rivals; divide other actors into eliminated/direct-vassal/unresolved; independent-rival IDs are the independent subset; eligibility rejects nonliving/subject/provisional/noncompetitive. The condition is eligible AND unresolved empty. Return no references to mutable inputs.
- [ ] Add adapter tests using `makeLivenessGame()` / `withoutOwnedAssets()`: healthy actual settler even with empty roster blocks; sole settler wins; military-only and ghost roster cannot block; actual city with empty roster blocks; minors and all non-major owner kinds excluded; duplicate IDs cannot create credit; a single founding major plus its secession cannot win a sandbox. Keep all existing #1050 tests.
- [ ] Implement `domination-sovereignty.ts` with a shared private classifier. The single-actor entry returns null for a missing/non-major ID; the batch entry uses one memoized world context and sorted major IDs. Victory imports the batch query; later knowledge assembly may query the observer only, and successful spy acquisition may query that mission target only. Neither permission exposes a foreign progress total. Add agreement between single-actor and batch outputs to the sovereignty suite. Build the world facts once per check. Call canonical liveness once per major, count owned cities from `state.cities` only for secession size/origin rules, and validate direct role edges from both endpoints/treaties. Invalid role edges produce independent facts. Do not import UI, AI, storage or an alternative settler validator.
- [ ] Add vassal cases using the real existing #910 proposal/accept lifecycle for positive integration tests; malformed edges are isolated negative fixtures. Match active treaties by ID/type/endpoints and duration, using the current treaty representation read during Task 0. Cover duplicated links/treaties, one-sided link, missing treaty, nesting and cycles; none gives credit. Defeated overlord releases subjects through the existing lifecycle.
- [ ] Add secession conjunction tests: fresh one-city child qualifies; second city, no city+settler, deadline equality, established status, missing/eliminated/vassal/cityless origin, provisional origin each fails independently. Use `createBreakawayFromCity` for a real positive, then actual owned city mutations for intentional adapter fixtures. No roster length substitution.
- [ ] Run the two new suites plus victory and liveness; inspect diff; commit only this completed local step. A red checkpoint is not a pushable/MR-ready state.

### Task 1.2 — Timing and sovereign-decision blockers

**Modify:** `src/systems/victory-system.ts`, `src/core/turn-manager.ts`, `src/app/controllers/turn-flow-controller.ts`.
**Tests:** `tests/systems/victory-system.test.ts`, `tests/core/turn-manager.test.ts`, `tests/core/completed-round-orchestrator.test.ts`, `tests/core/hotseat-outcome.test.ts`, `tests/core/turn-cycling.test.ts`, `tests/app/controllers/turn-flow-controller.test.ts`.
**Create:** `tests/integration/domination-round-boundary.test.ts`, `tests/storage/domination-continuity.test.ts`.

- [ ] Write red integration tests for event ordering and round opportunity. Subscribe to `turn:start` and assert the returned session/final state is already final when the event is delivered; record event order explicitly. In a buffered real completed round, let the first human/AI become a candidate and a later actor/world effect remove that condition: no outcome. Test independence resolution before/after an actor's seat and before/after the world increment.
- [ ] Add the exact blocker helper. It returns only matching candidate/direct-vassal independence requests for which `isDiplomaticRequestLive` (current TTL is 10) and `canPetitionIndependence` are true, endpoints/ownership match, and the relationship remains credited. Return sorted request IDs. Do not let an unrelated peace/treaty/malformed/expired request block. The helper is separate from `conditionMet` so progress can explain a decision pending without redefining victory.

```ts
// Required algorithm for the existing processTurn tail.
// All earlier world stages remain in their existing order.
const liveness = reconcileCivilizationLiveness(newState, newState);
emitCivilizationLivenessTransitions(liveness, bus);
newState = finalizeOpponentRoundState(liveness.state);
newState.turn += 1;
newState = finalizeDominationVictory(newState, bus);
bus.emit('turn:start', { turn: newState.turn, playerId: newState.currentPlayer });
return newState;
```

`finalizeDominationVictory` returns unchanged state when already gameOver, no unique candidate or blocked. Otherwise return a new state with the three existing outcome fields set. The final event is added in MR3; MR1 must not emit an event with no declared contract. Do not short-circuit `processNonHumanMajorRound` on intermediate candidacy.
- [ ] At the start of `endTurn`, before SFX/deselect/simulation, explicitly reject `selection.getPendingIntent().kind === 'city-capture'`. Keep existing required-choice checks. A caller bypassing the button must still be blocked. Verify the actual occupy/raze finalizer clears intent only after the mutation returns.
- [ ] Preserve hot-seat transaction persistence/overlay order. Do not rotate active humans by sovereignty or skip vassals. Keep `resolveHotSeatPostSimulation` precedence and AI-only behavior. Tests cover cityless human, eliminated human, no active humans and an already final AI winner.
- [ ] Write the actual save continuation test. Use the same real round helper as #1006 and the exact serializer API:

```ts
const saved = parseSaveFile(serializeSaveFile(beforeFinalRound));
if (saved.status !== 'success') throw new Error(saved.message);
const reloaded = normalizeLoadedState(saved.state);
const uninterrupted = runOneRealRound(beforeFinalRound);
const continued = runOneRealRound(reloaded);
assertSimulationEquivalent(uninterrupted, continued, 'Domination final round');
expect(continued.winner).toBe(expectedWinner);
expect(continued.turn).toBe(beforeFinalRound.turn + 1);
```

Define `runOneRealRound` in the new test using `runCompletedRound`, `processImprovementTurns`, `processNonHumanMajorRound`, `processTurn`; throw if `!result.ok`. Build the state through actual game creation and normalized action fixtures, not a partial GameState cast. Repeat for near-miss, final vassal acceptance, pending independence and hot seat. Do not claim pending SelectionStore capture intent is serialized; test that half-capture cannot enter the saved completed-round path.
- [ ] Run affected targeted suites in one command, inspect failures once per change and commit the complete timing step.

### Task 1.3 — Minimal honest copy and precise guards

**Modify:** `src/ui/victory-panel.ts`, `src/ui/vassalage-controls.ts`, `src/ui/advisor-system.ts`, `src/app/controllers/turn-flow-controller.ts`, `.claude/rules/game-systems.md`, `scripts/check-src-rule-violations.sh`, `.claude/hooks/check-src-edit.sh` (matching guard).
**Tests:** `tests/ui/advisor-victory-hint.test.ts`, `tests/ui/advisor-system.test.ts`, `tests/ui/victory-panel.test.ts`, `tests/app/controllers/turn-flow-controller.test.ts`, existing vassalage UI suite; `tests/app/architecture-boundaries.test.ts`.
**Create:** `tests/systems/domination-architecture.test.ts`; extend the now-landed `tests/scripts/check-src-rule-violations.test.ts` and `tests/hooks/check-src-edit.test.sh`; preserve #995's sanctioned minor-civ exceptions.

- [ ] Add the one-sentence rule to the existing final panel and generic vassalage consequence to both formation sides. Do not expose whether the final offer would win against hidden opponents. Add DOM assertions for actual accept/offer controls, not just a string constant.
- [ ] Replace `warchief_domination_hint` with the same one-sentence defeat-or-vassalize rule. Preserve its early-turn timing. Extend its existing tests to assert the actual rule wording, vassal alternative and absence of “leave no enemy city standing”; do not require UI readers to infer the new rule from a final modal.
- [ ] Fix the touched final outcome path's existing raw winner-name leak in this MR: solo unknown winner → “A rival empire”; hot seat → generic campaign-finished text with no outgoing seat's private explanation. MR3 will add richer shared standings, not fix a known defect deliberately introduced here.
- [ ] Add narrow structural tests: banned authoritative-query imports in UI/AI; no roster-based liveness or duplicated settler viability in victory adapter; pure kernel dependency limit. Source tests inspect the active worktree. Exempt canonical modules and test-only imports explicitly; do not ban legitimate owned-city enumeration for secession size.
- [ ] Demonstrate the CLI guard with a temporary forbidden victory snippet and a lawful `getCivilizationLiveness` consumer, in test scratch files removed by a trap. Assert nonzero for the former and zero for the latter. Do not actually commit a forbidden snippet.
- [ ] Run source checks for every changed source path, focused DOM/architecture/hook checks, then the MR1 gate below. Update MR1 task status to locally verified; do not mark merged before Luna supplies the real PR/SHA.

**MR1 gate:** complete core rule, timing, safe minimal copy, focused liveness/capture/diplomacy/hot-seat/save regressions and build/durable verification. No progress button is shipped in this slice. No migration and no new saved fields. `Refs #985`.

**Terra stop:** `READY FOR SOL IMPLEMENTATION REVIEW` then `STOP HERE. Do not create the MR. The human must switch models before work continues.`

## MR2 — Earned intelligence and a working progress panel (not started)

Prerequisite: MR1 merged, refreshed main and docs. Reread #1002's actual status/harness. Preserve #995's landed bilateral-war corruption repair and generated save expectations. Check actual observer-recording source hunks against any new active work.

### Task 2.1 — Persist earned observations at their source

**Create:** `src/systems/domination-intel.ts`, `src/systems/domination-knowledge.ts`, `tests/systems/domination-intel.test.ts`, `tests/systems/domination-knowledge.test.ts`.
**Modify:** `src/systems/domination-types.ts`, `src/core/types.ts`, `src/core/game-state.ts`, `src/systems/civilization-elimination-system.ts`, `src/systems/espionage-system.ts`; only necessary pre-state threading in the lifecycle callers listed above.
**Tests:** mirrored lifecycle/capture/espionage suites, `tests/ai/ai-round-scheduler.test.ts` and new knowledge suites.

- [ ] Define the persisted `DominationIntelState` and exact report/fact shapes from design §8, including `provisional` contenderRole. New GameState writers initialize `{}`; readers tolerate absent state defensively until migration executes. No cached progress, survivor count or warning percentage.
- [ ] Write real source tests first: final city capture by human, same by AI, terminal settler loss, transport loss, visible known third-party witness, hidden/concealed victim negative, participant with no witness context, lazy reconciliation with no before evidence, eliminated observer, and a repeated reconciliation. Assert exact observer keys and immutable before state.
- [ ] Implement `recordDominationDefeat(before, after, event)` with these steps: derive participant IDs; if before exists, identify action-boundary survival-asset loss and entitled known witnesses using visibility plus concealment; for each entitled major observer, overwrite that victim's earned fact with stable name/turn/source and filtered conqueror identity; return a new ledger/state. Do not enumerate human viewers only. Do not read raw rosters for terminal truth, introduce a new viability predicate, or award witnesses from final-state absence.
- [ ] Call the recorder exactly once at the canonical elimination result. Preserve the original pre-mutation state through `reconcileCivilizationLiveness`; direct `eliminateCivilization` callers without it may record participants, not witnesses. Audit every named caller; actual capture already passes pre-action state to reconciliation. Avoid nested eliminations generating a second credited fact or reordering notifications.
- [ ] Test successful actual `gather_intel`, failed mission and missed-contact cases. In its existing successful result-application block, call `recordDominationPoliticalReport` **before** emitting `espionage:intel-report-acquired`. The snapshot is target's own current role, its direct vassals and its own earned defeat ledger; filter every referenced subject to observer-known IDs at acquisition. Do not copy target foreign reports or call authoritative world progress.
- [ ] Run the new source suites and exact mirrored changed-source tests. Confirm adding an unmet party to the target's own relationships/ledger changes neither saved filtered report nor rendered output. Later contact must not expand the old saved snapshot.

### Task 2.2 — Correct ordered migration and save continuity

**Create:** `src/storage/migrations/steps/domination-intel.ts`, `tests/storage/domination-intel-migration.test.ts`.
**Modify:** `src/storage/save-schema-version.ts`, `src/storage/migrations/ordered.ts`, `src/storage/migrations/repair.ts`, `src/storage/migrations/pipeline.ts`; `tests/storage/fixtures/save-compat/{manifest.ts,persisted-shape-snapshot.json,golden-migration-digests.json}` as justified; generated `docs/save-compatibility.md`.
**Tests:** `new-game-completeness`, `save-persisted-shape-ratchet`, `save-compat-coverage`, `save-migration-registries`, `save-migration-equivalence`, `save-compat-matrix`, `save-persistence`, `save-file-transfer` and MR1 continuity suite.

- [ ] Recheck the current schema before allocating it. At the audit it is 28: add ordered version 29 with a unique ID/reason; use current+1 after drift, never overwrite another migration. Add a distinct structural repair to `repair.ts` and the explicit unconditional order. Do not smuggle required initialization through compatibility defaults.
- [ ] Write migration behavior tests before the step implementation: legacy ledger absent→empty; current valid ledger preserved byte-for-byte except ordinary serialization; malformed outer record/arrays, duplicate subjects, invalid discriminants, future/nonfinite/negative turns, missing observer; historical removed breakaway subjects retained; fake hidden global defeats not backfilled. Corruption repair must not compare historical facts with current hidden political truth.

```ts
it('does not grant old saves omniscient defeat knowledge', () => {
  const raw = structuredClone(legacyStateWithSeveralEliminatedRivals);
  delete raw.dominationIntel;
  raw.saveSchemaVersion = previousSchema;
  const loaded = normalizeLoadedState(raw);
  expect(loaded.dominationIntel).toEqual({});
  expect(projectDominationProgressForViewer(loaded, 'player').ownEarnedDefeatCount).toBe(0);
});
```

`previousSchema` is the verified predecessor at implementation; build `legacyStateWithSeveralEliminatedRivals` through the baseline fixture with real eliminated records. This test intentionally distinguishes historical world truth from earned knowledge.
- [ ] Add the new field to the compatibility manifest historical strip and meaningful ledger round-trip fixtures. Run the targeted migration suite before updating expectations. Update only intended `dominationIntel`/schema-related golden keys, explaining each changed digest; no bulk unexplained acceptance.
- [ ] Regenerate registry documentation with the prescribed command, then rerun it without update flags:

```bash
UPDATE_SAVE_COMPAT_DOC=1 bash scripts/run-with-mise.sh yarn vitest run tests/storage/save-migration-registries.test.ts
bash scripts/run-with-mise.sh yarn test --run tests/storage/domination-intel-migration.test.ts tests/storage/save-migration-registries.test.ts tests/storage/new-game-completeness.test.ts tests/storage/save-persisted-shape-ratchet.test.ts tests/storage/save-compat-coverage.test.ts tests/storage/save-migration-equivalence.test.ts
```

Use the update flags actually documented in the ratchet/golden tests after reading them; do not guess shell flags or rewrite generated files by hand. After stable, run the full compatibility matrix once. Verify file export/import plus IndexedDB and localStorage fallback preserve observations and do not emit victory/intel events on load.

### Task 2.3 — Shared knowledge and viewer projection

**Create:** `src/systems/domination-presentation.ts`, `tests/systems/domination-presentation.test.ts`, `tests/helpers/domination-viewer-fixture.ts` (unless #1002 supplies its equivalent).
**Modify:** shared types/knowledge only; extend `tests/systems/domination-architecture.test.ts`.

- [ ] Implement the full design §8 contract, including `ownOverlordId` and `knownActorFacts` with entitled names, dispositions, sources and dates. Reuse the single-actor sovereignty classifier only for the observer; assemble every foreign fact from stored/earned observations. Single-actor target access is allowed only inside actual successful report acquisition. Add import/call-boundary tests for these two exceptions. Define knowledge assembly with strict precedence: current own relationships and own liveness; earned terminal observations, superseded only by newer earned visible/trusted life; current/dated treaty and political report snapshots; otherwise unknown. Conflicting same-turn foreign evidence becomes unknown; recent nonterminal roles become unknown for urgency at age6. Reuse `classifyDominationRival` only for known dispositions; unknown facts remain unresolved without pretending they are independent. Own agreement display reads own stored role/treaty facts, not a global foreign-liveness annotation. Do not derive `ownEarnedDefeatCount` from all globally eliminated civs.
- [ ] Add the dated known-rival rows. A report supplies no location. At age6 it remains visible as an old report; age0–5 is recent. Unknown role is not independent. A report containing no eligible known facts does not create a hidden-identity row/count. A newly known actor is unresolved until evidence says otherwise.
- [ ] Write differential tests that fix the observer's contact, earned snapshots, own data and entitled own legal status, mutate inaccessible foreign cities/settlers/treaties/metadata/names, and compare complete projection and shared knowledge. Test all strings and attributes in subsequent DOM tests, not just row IDs. A change to newly earned observation may legitimately change output; hidden state alone may not. Separately test the intentional entitlement boundary: a hidden origin change that legally ends the observer's provisional exemption may change only the observer's role/help, not disclose origin assets, reason, rival counts or foreign rows. A comparable change to a foreign secession must not update its role without new evidence.

```ts
const a = projectDominationProgressForViewer(base, viewerA);
const hiddenVariant = alterOnlyUnobservedForeignState(base, viewerA);
expect(projectDominationProgressForViewer(hiddenVariant, viewerA)).toEqual(a);
expect(projectDominationProgressForViewer(base, viewerB)).not.toEqual(a);
```

Define `alterOnlyUnobservedForeignState` in the focused fixture from explicit chosen unknown entities; it must preserve valid ownership/roster invariants where the test changes gameplay state. Add separate corruption tests rather than confusing invalid one-sided data with valid hidden-world variants.
- [ ] Derive the viewer DTO from shared knowledge. Reuse the canonical classification kernel for secured-versus-unresolved meaning; keep observation uncertainty separate. Do not cast partial observations to GameState or call authoritative `conditionMet`. Make “Other empires or changes may be unknown” unconditional whenever showing rival progress; a no-contact observer does not receive a count of unknown empires.
- [ ] Run knowledge/projection suites plus existing viewer-intel tests and source boundaries. No UI code may import the authoritative adapter, and no AI may import the display module.

### Task 2.4 — Live progress panel and navigation

**Create:** `src/ui/victory-progress-panel.ts`, `tests/ui/victory-progress-panel.test.ts`.
**Modify:** `src/app/controllers/panel-actions-controller.ts`, `src/app/panel-registry.ts`, `src/app/bootstrap.ts`, `src/ui/game-shell.ts`, `src/app/controllers/game-session-controller.ts` for its actual shell callback wiring, `src/app/controllers/turn-flow-controller.ts` for synchronous handoff cleanup.
**Tests:** `tests/ui/game-shell.test.ts`, `tests/app/controllers/panel-actions-controller.test.ts`, `tests/app/controllers/game-session-controller.test.ts`, `tests/app/controllers/turn-flow-controller.test.ts`, architecture and relevant Playwright smoke.

- [ ] Add a non-optional working `onOpenVictoryProgress` callback to the shell's live callback construction, a text-labelled Victory button using the existing UI kit, and the `victory-progress` PanelId/registry descriptor. Locate every `GameShellCallbacks` construction in the named controller/tests and update it in the same change. No optional inert callback pattern copied from older buttons.
- [ ] Implement `createVictoryProgressPanel(model, callbacks)` using safe text, scrollable known rows, close control, dates and no global percentage. The controller projects with the explicit current viewer and subscribes via `session.subscribe`. Dispose on close/handoff; never leave a subscription that can repaint an outgoing panel under another seat.
- [ ] Existing capture paths use `setStateWithoutRefresh`. Ensure successful capture/role/intel changes refresh this open panel through an explicit controller refresh path or a safe refresh at the existing committed state boundary. Do not assume `session.subscribe` alone sees those writes. Avoid a broad all-panel rewrite.
- [ ] Navigation callbacks open already-working Diplomacy, an entitled owned-city panel or Espionage. Re-read the current viewer and validate the owned city on each click. They never execute a strategic action themselves. Closing/reopening must show current facts, not a captured report list.

#### Player Truth Table

| Before | Action | State effect | Immediate visible result / reachability |
|---|---|---|---|
| HUD on live seat | Victory | Opens read-only panel | Rule, own role/counts, all known rows and uncertainty |
| Panel contains old report | Successful real gather-intel mission | Earned dated snapshot saved | Row/date updates while panel is open |
| Final vassal offer pending | Accept in existing Diplomacy | Revalidated relationship mutation | Reopened/open refreshed Victory reflects own agreement; no instant win modal |
| Own vassal gains independence | Existing grant/refusal/release path | Canonical role change | Own count drops; guidance changes immediately |
| Cityless owner | Open Victory | None | Recovery text; no “eliminated” or hidden-rival count |
| Recommendation names own city | Open city | Navigation only | Correct current owned city panel; invalid/stale target gives clear local feedback |
| Many known empires | Scroll/reopen | None | Every known row remains reachable; no hidden actors introduced |
| Seat A panel open | End Turn/handoff | Panel subscription disposed | No A report/tooltip/ARIA text under veil or on B's screen |

#### Misleading UI Risks

Never label historical reports as live world truth; never call zero confirmed blockers victory; never display a raw world denominator; never show a capital marker without actual intel; never render a unavailable action as a recommendation; never hide known rows because they are low priority. Negative tests cover each boundary.

#### Interaction Replay Checklist

- [ ] Open → close → open; latest state appears and only one subscription remains.
- [ ] Refresh after capture/report/independence while open; exact visible text updates.
- [ ] Click navigation twice, including a stale detached button; no duplicate mutations or wrong-seat navigation.
- [ ] Close/handoff/reopen as another seat; complete DOM, tooltip and ARIA redaction.
- [ ] All known rows reachable at 320px width and 200% text zoom; keyboard focus/close works.

No queue is introduced. Existing city/research queues remain reachable and unchanged; no ETA/reorder work belongs to this panel. Do not add queue tests that merely mirror unrelated implementation.

**MR2 gate:** whole observation→save→projection→live panel path, observer differential proof, relevant storage and hot-seat regressions, browser QA, web and Tauri frontend builds for save-boundary work, durable verification. `Refs #985`. The panel works without MR3 alerts.

**Terra stop:** `READY FOR SOL IMPLEMENTATION REVIEW` then `STOP HERE. Do not create the MR. The human must switch models before work continues.`

## MR3 — Rival warnings and safe campaign ending (not started)

Prerequisite: MR2 merged. Refresh and reread #993 and #1002. Adapt mechanically to a landed moment/harness API; preserve this design's rule, dates, recipients and no-replay behavior.

### Task 3.1 — Shared threat threshold and warning lifecycle

**Modify:** `src/systems/domination-knowledge.ts`, `src/systems/domination-presentation.ts`, `src/systems/strategic-warning-system.ts`, `src/ui/strategic-warning-presentation.ts`, `src/core/types.ts` warning kind union; relevant `src/core/hotseat-events.ts` discriminant handling if exhaustive.
**Tests:** new `tests/systems/domination-warning.test.ts`, existing strategic-warning/presentation/hotseat suites, AI-neutral knowledge tests.

- [ ] Add red threshold cases: known independent contender, two distinct secured of three currently known rival identities, one unresolved → threat; one secured → none; two unresolved → none; age5 yes/age6 no; unmet actor/provisional/subject/future report → none; newly met rival becomes unresolved and can clear threat. Never compute the denominator from only secured records.

```ts
// Shared inference algorithm. Inputs are earned knowledge only.
// For each recent known independent contender report:
const rivals = uniqueSorted([...knowledge.knownCivIds, knowledge.observerId])
  .filter(id => id !== report.contenderId)
  .filter(id => classifyKnownRival(knowledge, report, id) !== 'exempt');
// Entitled eliminated/direct-vassal facts are secured; they remain in the denominator.
// Unknown remaining rivals are unresolved; unmet actors are absent, not counted.
const secured = rivals.filter(id =>
  classifyKnownRival(knowledge, report, id) === 'secured');
const unresolved = rivals.filter(id => !secured.includes(id));
const threat = secured.length >= 2 && unresolved.length <= 1
  && 3 * secured.length >= 2 * rivals.length;
```

`uniqueSorted` and `classifyKnownRival` are private helpers defined in this task, not new public contracts. `classifyKnownRival` returns `'exempt' | 'secured' | 'unresolved'` using the contract's observation precedence and freshness. It delegates known roles to `classifyDominationRival` and returns unresolved for unknowns. The classifier must use own current relationship overrides (including `ownOverlordId`) and earned terminal facts; it cannot read GameState. Include the observer as unresolved unless its own status proves otherwise. Reported defeated/vassal IDs are deduplicated and filtered to known IDs. Exempt only a provisional fact actually entitled to this observer.
- [ ] Add transition integration for all living human recipients, human and AI contenders. Compare before/after inference, not a global AI primary plan. Use `viewer:actor:domination` key, false→true edge and ≥5 turns since prior alert. Rising from stale/cleared reports respects the same cooldown. Card state is always freshly derived even when a toast is suppressed.
- [ ] Add `domination` / `domination-eased` event kinds with current generic fields only. Use fixed uncertainty-aware message in `presentStrategicWarning`; panel shows evidence detail. A clear transition produces no cue. Reuse existing acknowledgement/audio ledger; do not mark audio consumed for another seat.
- [ ] Test real handoff delivery, save/reload before acknowledgement, repeated opening and two contenders in one round. Only one per-viewer-turn cue, no cue under veil, no duplicate toast at reload. Do not introduce an event payload field requiring a migration while claiming no save impact.
- [ ] Run warning/knowledge/DOM/hot-seat targeted suites and source guards.

### Task 3.2 — Outcome projection, event and accessible presentation

**Modify:** `src/systems/victory-system.ts`, `src/systems/domination-presentation.ts`, `src/core/types.ts`, `src/ui/victory-panel.ts`, `src/app/controllers/turn-flow-controller.ts`, `src/presentation/register-civilization-presentation.ts` and registrar dependencies only as necessary.
**Tests:** victory/presentation/turn-flow/registrar suites; add `tests/integration/domination-outcome-presentation.test.ts`.

- [ ] Add `GameEvents['victory:resolved'] = { winnerId: string; reason: 'domination'; turn: number }`. Emit only when finalization changes a nonfinished state into Domination. Calling again or loading an ended save emits nothing. Test buffered round rollback and a successful real round, not just the finalizer in isolation.
- [ ] Implement `projectDominationOutcome(state, viewerId)` exactly as the design: known solo name or generic unknown rival; solo why-win/why-loss uses own entitled state. With `viewerId=null`, public configured player names only, common rule, all configured human winner/not-winner standings; AI identity generic. Do not read private status per other seat to enrich shared copy.
- [ ] Make `handleVictoryIfNeeded` pass the safe DTO to the view. Clear outgoing private panels, release handoff blocker, then show opaque final result. Preserve failed-persistence retry; no double simulation or second outcome event on retry. Keep `all-humans-eliminated` distinct and do not reclassify legacy finished saves.
- [ ] If adding a final log entry, use `notifier.deliver` with explicit recipients and safe projected text. The raw event is not a player-facing object. Headless simulation keeps the existing durable outcome fields even without presentation listeners; log is supplementary. Do not parse it for intel.
- [ ] Use existing modal visual significance and warning cue; no guessed `SFX.victory`, no General career fabrication. If #993 is still absent, the typed event is the future chronicle/moment seam. If it landed, map this event into its actual coordinator with tested recipient/no-replay semantics. No generic framework inside #985.
- [ ] Test mute, presentation suppression, reduced motion/no animation requirement, load, duplicate finalizer, handoff retry, solo unknown AI winner, human winner before another seat next acts, eliminated humans and all-human defeat. Shared final DOM must not contain any private report/city/subject names from either seat.

#### Player Truth Table / replay

| Before | Trigger or action | Visible result |
|---|---|---|
| Old report not near threshold | New earned report crosses threshold | Dated panel card and one recipient warning; existing audio policy |
| Threat report current | Independence/new contact/age6 | Card clears/changes immediately; no “rival is safe” certainty or clear sound |
| Pending completed-round handoff | Winning final state persisted | Handoff removed, then opaque shared result; no other seat's private panel |
| Finished save loaded | Open game | Correct stored result; no old warning/final cue replay |
| Shared result | New Game | Existing game-mode selection and overlay cleanup; no phantom handoff blocker |

Replay warning→open panel→close→reopen, save→reload, handoff→ack, repeated New Game, and failure→save retry. Assert rendered text and overlay stack, not only `state.gameOver`.

**MR3 gate:** complete threshold/edge/cooldown/audio behavior, solo/shared privacy, final event once, real save/handoff and browser QA. No new persisted shape under this task. `Refs #985`.

**Terra stop:** `READY FOR SOL IMPLEMENTATION REVIEW` then `STOP HERE. Do not create the MR. The human must switch models before work continues.`

## MR4 — AI pursuit and counterplay (not started; #995 prerequisite satisfied at baseline)

### Task 4.0 — Hard dependency gate

- [ ] Fetch current main; confirm it contains #995 / PR #1052 (`a04a1c33`) and reread the current implementation. The gate is satisfied at the final Phase A baseline. Use `declareMajorWar(state, a, b, bus?)`, legal consent flows wrapping `makeMajorPeace(state, a, b)`, and `assertBilateralWar(state)` from `tests/helpers/save-state-invariants.ts`. Preserve `normalizeBilateralWar` as a no-schema-bump repair. If the required work has been reverted or is absent from the chosen base, stop only MR4 and report the dependency. Do not implement unilateral fallback, absorb the other lane, or claim this arc finished. Other unfinished independent #985 slices can continue.
- [ ] If merged, rebase and reread final war/peace/public event ownership, validator and source rules. Record which final function owns war mutation and which emits events. Map existing `declareMajorWar` / `proposeTreatyAgreement` calls to actual final APIs mechanically. Escalate only if approved legal behavior cannot be expressed.

### Task 4.1 — Doctrine inputs, preparation and tracing

**Create:** `src/ai/ai-domination.ts`, `tests/ai/ai-domination.test.ts`.
**Modify:** `src/ai/ai-prepared-turn.ts`, `src/ai/basic-ai.ts`, transient `PreparedMajorCivPlan` type if needed, `src/systems/domination-types.ts` for shared types only.
**Tests:** `tests/ai/ai-prepared-turn.test.ts`, `tests/ai/basic-ai.test.ts`, `tests/ai/ai-major-turn.test.ts`, `tests/ai/ai-objective-scoring.test.ts`, `tests/ai/ai-resettlement.test.ts`.

- [ ] Define transient doctrine input/output:

```ts
interface DominationDoctrine {
  pursuit: boolean;
  threatId: string | null;
  captureValueBonus: number;
  reasonCodes: string[];
}
evaluateDominationDoctrine(input: {
  knowledge: DominationKnowledge;
  perception: MajorCivPerception;
  personality: PersonalityTraits;
  challenge: OpponentChallenge;
}): DominationDoctrine;
```

Shared knowledge may supply only own legal role information and earned foreign evidence. Resolve personality from current civ definitions and challenge via game-wide `resolveOpponentChallenge`. All fields above are transient; no new `MajorCivPlanPortfolio` storage or persisted AI reason enum just for telemetry.
- [ ] Add red tests: aggressive independent owner with city and a legal feasible rival objective prefers it over an otherwise equal ordinary objective; trader normal scoring unchanged; cityless recovery wins over pursuit; unknown/provisional/subordinate candidates do not produce Domination intent; stale report does not create urgency. Test Explorer/Standard/Veteran bonuses 8/14/20, capped by existing 100, and shared eligibility equality.
- [ ] Extend `objectiveCandidates` only at the known peaceful-city gate. Before admitting a candidate, require contact, current canonical declaration eligibility, known-map path, required capture/frontline roles and perceived loss ratio ≤1.0. Preserve active-war/recent-attack candidates and existing distance/supply filters. Missing roles still feed ordinary force demands; an unready candidate cannot declare war.
- [ ] Apply the bonus before the existing scorer and portfolio selection, not as an unbounded extra final score. Keep existing commitment, defense plans, expiry, recovery and retreat behavior. No new distant-eligibility reason or global “last city” lookup.
- [ ] Add transient trace reasons to real `AIDecisionTrace` candidates, including why a Domination candidate was rejected. Keep candidate ordering and the existing trace cap of 12. Tests assert the actual selected prepared objective and a real action path, not only `doctrine.pursuit === true`.
- [ ] At execution, refresh shared knowledge and validate target/force legality against latest state. A prepared plan may now reference a vassal or a lost target; it must not declare merely because the old doctrine said pursuit. Preserve #1050's recovery-reserved settlers/transports and discard stale plans after recovery mutation.
- [ ] Run targeted AI, source and determinism tests before touching broader diplomacy behavior.

### Task 4.2 — Legal counterplay and diplomatic integration

**Modify:** `src/ai/ai-domination.ts`, `src/ai/basic-ai.ts`, `src/ai/ai-diplomacy.ts` only if a pure decision contract is needed; existing production/assignment owner only if required to wire demands.
**Tests:** new `tests/ai/ai-domination-counterplay.test.ts`, existing AI diplomacy/prepared/production/major-turn suites and `tests/systems/bilateral-war-invariant.test.ts`. Call `assertBilateralWar` after each new diplomatic transition and each campaign round.

- [ ] Derive threats with the shared inference. For equal threats, rank fewer unresolved known rivals first, more reported secured rivals next, newer report next, then contender ID. It must not read hidden actual progress to break ties.
- [ ] Feed existing defense/force-demand machinery for an **observed** threat to an owned city. No direct queue replacement or unconditional global military spam. Let existing plan/production catalogs select trainable roles and protect recovery/economy.
- [ ] Add at most one doctrine-driven diplomatic proposal per actor/world turn: legal peace to a known active-war third party excluding the threat; otherwise legal alliance to a known independent non-threat partner using current relationship/era/consent rules. Deterministic candidate ordering; existing pending proposals suppress duplicates. No new league mechanics are necessary.
- [ ] Known threat alone is not a war declaration. If pursuit/retaliation yields a ready legal prepared target, the existing final #995 API may execute it; otherwise defense/scouting/diplomacy is the response. Vassals use only their current legal independence/protection actions. Do not force human recipients to accept a coalition/peace offer.
- [ ] Do not change #910 acceptance, loss eligibility or tribute. Existing weak-AI vassal offers remain legal; Domination awareness can prefer a non-threat eligible alternative when one exists, but must not invent an unapproved surrender cap or guaranteed refusal behavior.
- [ ] Tests: shared known threat produces actual defended-city demand and one proposal; unknown/old threat does not; hidden-world perturbation leaves full trace/proposal identical; no unsolicited distant war; no unilateral/duplicate war edges; existing treaty refusal and NAP/era restrictions still apply; final API emits once; no repeated proposal on re-entry in the same turn.

### Task 4.3 — Deterministic campaign proof and bounded regression

**Create:** `tests/simulation/domination-playability.test.ts` and a focused fixture beside it if needed.
**Reuse:** `tests/simulation/ai-playability-fixture.ts:initializeScenario`, real completed-round runner and canonical invariant helpers; `tests/helpers/deterministic-state.ts`.
**Modify:** existing simulation metrics only if the new test genuinely needs a reusable trace/capture observer; do not rewrite the simulation engine.

- [ ] Build a deterministic **three-empire occupied scenario**, with an aggressive AI and at least two living independent opponents, legal technology/units/terrain, known starting operational fronts and real economy. No pre-eliminated final rivals, direct winner assignment, forced vassal state, mid-test gift of victory, or mocked AI executor. Record exact seed, starting setup and allowed human command schedule in the test.
- [ ] Run real preparation, diplomacy, combat/capture, improvements and world rounds, bounded to 200 rounds. Stop the test runner on a real `gameOver`. Require an AI Domination winner, pursuit traces and at least two actual rival status changes through real capture/elimination/consent paths. No “its score increased” substitute for reaching victory.
- [ ] Save before a fixed intermediate round, reload through serialize/parse/normalize, continue the same commands and compare complete final state, winning turn, report/warning outputs and decision traces. No additional deterministic exclusions. Add a second near-win test where observed independence reverses progress before finalization.
- [ ] Run legality/knowledge/counterplay tests across all three modes; the full campaign proof can use Standard with explicit bounded Explorer/Veteran competence regression scenarios. Run the existing short AI-playability matrix and the new dedicated long-horizon test after stable. Inspect candidate/path caps, planning errors, repeated proposals and report loops. Do not increase candidate/path budgets or weaken the victory assertion to make it pass.
- [ ] After two similar failed campaign attempts, stop with seed, traces and first blocking behavior. A central gameplay/legality assumption requires Astra escalation; an ordinary implementation defect stays in Terra/Sol's phase. Do not tune the entire game or cherry-pick endless seeds silently.
- [ ] Run final source/architecture checks and relevant focused suites, then build/durable and browser regression once stable. Update all task statuses honestly. Final MR may use `Closes #985` only if the full design acceptance is proved.

**Terra stop:** `READY FOR SOL IMPLEMENTATION REVIEW` then `STOP HERE. Do not create the MR. The human must switch models before work continues.`

## Common validation and release gates

Run the narrowest mirrored changed-source tests first. The inventories above are expected paths at the audit, not a reason to run nonexistent files after drift. Resolve a moved test by its current export/caller; do not silently skip coverage. Batch all existing mirrored tests for a changed slice into one focused command. When no mirror exists, use the smallest relevant domain suite. Follow the repository's stop-after-two-similar-failures rule.

For source changes:

```bash
git diff --check
scripts/check-src-rule-violations.sh <each-actual-changed-src-file>
bash scripts/run-with-mise.sh yarn test --run <existing-focused-test-paths>
```

The angle-bracket arguments above mean the reviewed actual changed-path list, not literal shell input. The exact focused commands for the new feature suites are:

```bash
# MR1
bash scripts/run-with-mise.sh yarn test --run tests/systems/domination-rules.test.ts tests/systems/domination-sovereignty.test.ts tests/systems/domination-progress.test.ts tests/systems/victory-system.test.ts tests/systems/civilization-liveness.test.ts tests/integration/domination-round-boundary.test.ts tests/storage/domination-continuity.test.ts tests/systems/domination-architecture.test.ts
# MR2
bash scripts/run-with-mise.sh yarn test --run tests/systems/domination-intel.test.ts tests/systems/domination-knowledge.test.ts tests/systems/domination-presentation.test.ts tests/storage/domination-intel-migration.test.ts tests/ui/victory-progress-panel.test.ts
# MR3
bash scripts/run-with-mise.sh yarn test --run tests/systems/domination-warning.test.ts tests/integration/domination-outcome-presentation.test.ts tests/ui/strategic-warning-presentation.test.ts tests/ui/victory-panel.test.ts tests/app/controllers/turn-flow-controller.test.ts
# MR4
bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-domination.test.ts tests/ai/ai-domination-counterplay.test.ts tests/ai/ai-prepared-turn.test.ts tests/ai/ai-major-turn.test.ts tests/ai/ai-resettlement.test.ts tests/simulation/domination-playability.test.ts
```

Expected: all assertions plus hook smoke exit 0. Add every actual changed source's existing mirror from the preceding task inventories, including controller, storage, diplomacy and renderer/UI tests affected by integration. The list of newly created suites alone is not sufficient proof.

Once a slice is stable, before push/PR/merge:

```bash
bash scripts/run-with-mise.sh yarn build
```

Run that separately; then use the bounded repository combined proof:

```bash
bash scripts/run-with-mise.sh yarn verify:pr
bash scripts/run-with-mise.sh yarn verify:pr:status
bash scripts/run-with-mise.sh yarn test:durable:status
git diff --check
git diff --stat origin/main...HEAD
git diff --stat
```

`verify:pr` owns its bounded build/durable suite; status must match the current HEAD and worktree. Alternatively use the repo-prescribed standalone durable command once, followed by status. Do not start a second equivalent verification while the first session may still be active. Preserve IDs and inspect the same process until final exit; incomplete output is inconclusive, not green. Read the full relevant committed and uncommitted diffs, not just the stats. After a material fix, rerun only affected checks first, then final required gate for the changed HEAD.

For MR2 save-boundary changes also run `bash scripts/run-with-mise.sh yarn build:tauri`, and the save compatibility matrix. Verify PWA `/conquestoria/` and Tauri relative frontend paths. Native packaging is outside scope unless actual packaging files change.

Browser/manual QA for every new visible surface: run `bash scripts/run-with-mise.sh yarn dev`, open the existing local app and use repository-supported fixtures. Check solo and two-human hot seat, 320px mobile viewport, desktop, 200% text zoom, keyboard/touch targets, open-panel live changes, all known rows reachable, stale repeated navigation, cityless/vassal help, no-contact state, old spy report, pre-final capture choice, pending independence, handoff veil, winner/loser shared result, mute and save reload. Use the current Playwright fixtures and `bash scripts/run-with-mise.sh yarn test:web-smoke`; add focused browser scenarios for the new live path rather than asserting only isolated DOM creation. Record actual commands/outcomes and screenshots only where useful; no claims of manual QA from a unit test.

## Sol inline review gate for every MR

Review actual production code, tests, AI, UI, projections, warnings, saves, events/SFX, hot seat, difficulty, both diffs and docs. Use the exact requested review:

“perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.”

For each dimension, record inspected paths/behavior, concrete finding, severity, required fix and resolution. If no issue, state the inspected evidence and why it is acceptable. Fix every real in-scope defect; add a regression for each review-found defect; rerun affected checks and review dimensions after material changes. No MR with known in-scope defects. Prepare a cohesive description of the final scope; do not create or merge it in the wrong model phase.

Sol stop: `READY FOR LUNA MR AND CI` then `STOP HERE. Do not merge. The human must switch models before work continues.`

## Luna MR, CI, merge and next-slice gate

Every MR description contains Scope, Design contract, Player-visible behavior, AI behavior, Viewer safety, Hot seat, Save/determinism, Difficulty, Pre-MR inline code review and Verification. Intermediate MRs use `Refs #985`. Partial implementation needs an accurately narrowed title/body, explicit omissions and why every shipped surface is complete; no dead launcher/action. Prefer completing the planned slice.

Before creation, verify branch freshness, reviewed HEAD and local evidence; do not rewrite the approved design during mechanical rebase. Watch each required CI check to completion; classify failures. Every required **non-build** CI check must be green. Build is excluded from the user's required-green remote gate, but repository local build still must run and a proven in-scope build defect still blocks. No unresolved blocking review or known defect may be bypassed.

Merge only with rebase plus admin bypass after that gate (`gh pr merge <actual-number> --rebase --admin`). Do not squash or create a merge commit. Record merged SHA, refresh `origin/main`, confirm the merged commit is on it and inspect newly landed overlaps. Use an appropriate worktree for the next slice based on refreshed main; do not rewrite another active checkout. Update this plan's merged phase annotations and actual PR references in the phase-completing MR per repository policy; distinguish local completion from confirmed merge.

Luna may handle runner/cancelled/flaky environmental/metadata or obvious mechanical rebase issues. Compiler/lint/import/fixture or straightforward deterministic implementation corrections return to Terra. Ambiguous victory/privacy/hot-seat/AI/save/architecture issues return to Sol. Central approved design invalidation returns to Astra with the escalation report below. No background monitor or message to others is created merely because this plan mentions CI; perform only the phase the human has authorized.

## Design escalation format

Output `DESIGN ESCALATION REQUIRED`, then identify the approved assumption, contradictory source/test evidence, affected MR/design section, alternatives, AI consequences, hot-seat/privacy consequences, save/determinism consequences, migration implications and gameplay/balance implications. Then: `STOP HERE. Switch back to Astra xhigh before continuing.`

Do not silently replace the rule, change secession size/time conditions, invent global standings, weaken liveness or hide a schema change in a normalizer. Mechanical file/API/schema-number drift can be adapted after inspection without changing this contract.

## Final cross-arc read-only audit

After MR4's confirmed merge, refresh main and audit the actual shipped path: canonical rule/liveness; all vassal and secession conjuncts; minor exclusion; own and known-rival progress; viewer/AI import boundaries and hidden-state invariance; warning threshold/cooldown/expiry; at least one pursuing AI and one legal responding AI; long-horizon real AI victory; capture/independence/round/handoff timing; full save/determinism; solo/hot-seat and three-mode regressions; small-screen clarity and SFX suppression. Confirm #985 state and current main SHA. Report the four actual PR links, scopes, verification, review fixes, CI/merge method and merged SHAs. Name only genuinely separate remaining issues/playtest risks. Do not begin another feature.

## Inline implementation-plan review and incorporated corrections

Review performed inline with the same mandatory multidimensional prompt, against the written contract, audited APIs and real test runners. This is plan review, not a claim to have reviewed future production code.

| Dimension | Finding / severity | Incorporated correction |
|---|---|---|
| Balancing gameplay | High: “provisional” could be implemented with only deadline, exempting a large/orphaned empire | Task1.1 enumerates every negative conjunct, actual-city count and origin conditions |
| Fun | Medium: test suite could prove counts while leaving the player hunting an unlocatable final settler | Knowledge/scouting copy, no hidden target oracle, legitimate vassal route; keep human pacing playtest as a real release observation |
| New mechanics | High: plan could accidentally create a surrender action or new coalition layer | Existing consent-only vassalage and peace/alliance APIs; no new action control |
| Ages 7–43 | Medium: reports and vassal role explanation could be hidden in docs | Task1.3 generic consequence in live controls; Task2.4 prominent rule, plain uncertainty and rendered tests |
| Play styles | High: AI production response could replace a builder's queue | Existing AI role-demand pipeline only; read-only player navigation; no queue rewrite |
| Difficulty | High: same-looking tests might omit per-human-vs-global challenge distinction | Three-mode truth/legality tests plus explicit game-wide doctrine resolution |
| Computer players | High: new module could raise scores without passing the prepared-plan war gate | Task4.1 peaceful target legality/readiness bridge; actual prepared/action assertions and 200-round production proof |
| UI | High: callback/registry/subscription integration could leave an inert launcher | Exact game-shell→session-controller→bootstrap→panel-actions inventory; required callback and live tests |
| UX | High: `setStateWithoutRefresh` means a subscription-only panel stays stale | Task2.4 explicitly refreshes after committed capture/role/report paths and tests visible immediate updates |
| Architecture | High: a human-only event listener would omit AI/headless observation history | Task2.1 source-owned immutable recorder and AI-neutral witnesses; no ledger mutation in listeners |
| Extensibility | Medium: assuming future API names without checking the actual merge can miswire ownership | #995 final exports/validator/repair are now named and audited; #993 retains an inspect/map gate; no speculative API fallback |
| Data | High: using only reported secured entries as the denominator makes every two-vassal report look near victory | Task3.1 counts all currently known identities, unknowns unresolved; new-contact negative test |
| SFX | Medium: reusing warning path without its acknowledgement can play for the wrong seat | Task3.1 real handoff/ack/save tests and one cue per viewer turn; no clear/reload cue |
| Saved games | High: snapshot field can bypass schema ratchet or leak historical backfill | Task2.2 ordered next schema, separate repair, historical strip, per-key goldens and real storage continuation |
| Proper testing | High: fabricated late-game state might “prove” AI can win without playing | Three occupied independent empires, real executor, two actual rival transitions, bounded seed and trace proof |
| Solo regressions | High: new ending could overwrite already finished or settler-only outcomes | Task1.2 legacy terminal preservation and canonical full-state continuity |
| Hot-seat regressions | High: controller might show result for leftover currentPlayer or leak outgoing DOM | Task2.4 synchronous disposal; Task3.2 shared safe DTO and every configured human in public standings |
| Proper implementation | High: MR boundary could defer a known ending privacy bug or ship dead warning UI | MR1 safe minimal redaction; MR2 complete panel; MR3 complete alerts; all separate gates and honest statuses |

Additional review corrections: Task1.3 now covers the audited stale advisor copy; Task1.1 owns one shared sovereignty classifier; Task2.3 defines the own-status entitlement and its contrasting foreign-state regression; Task3.1 removes only entitled provisional actors before calculating its denominator. These are contract/plan corrections, not production changes.

Cold-execution checks: all proposed public types/APIs are defined; source owners/callers and named new/mirrored tests are assigned; observer boundaries and report aging are explicit; the migration and generated expectations are owned; each intermediate MR is independently useful; #995's satisfied prerequisite has an explicit ancestry/API recheck; source rules and UI guardrails are included. Implementation checkboxes intentionally remain empty. All legitimate plan-review findings above have been incorporated. No production code or MR has been created in Phase A.

**Phase A handoff:** `READY FOR TERRA IMPLEMENTATION`.

**STOP HERE. Do not begin implementation. The human must switch models before work continues.**
