# #496 — City-state leagues and regional compacts implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` inline, task by task, and TDD. Do not use subagents or fast mode. Terra implements; Sol High reviews and fixes actual code before creating each MR; Luna watches CI and performs the authorized rebase merge. Astra owns this design/plan only.

**Goal:** Add persistent regional compacts above individual city-state economies, with safe contact disclosure, bounded paid investment preferences, and delayed local defense preparation.

**Architecture:** One optional world compact container owns membership/scheduling/readiness. Existing member economies retain every queue, unit, resource and cost. Pure projection helpers supply UI, AI and recipient notices. Existing coalition/major-league/vassalage systems retain all war ownership.

**Tech stack:** TypeScript, current immutable `GameState`/EventBus conventions, Canvas map with DOM diplomacy UI, Vitest, Playwright, existing save migrations and buffered completed-round events.

**Design:** [2026-09-06-issue-496-city-state-leagues-design.md](../specs/2026-09-06-issue-496-city-state-leagues-design.md).
**Initial audit:** `ff3c7eac`; **final drift audit:** `9e3db8f65245034ce19f102dddfbacb71c71991f`, 2026-09-06. #970's two intervening commits change airborne/transport destination blockers, not compact dependencies. No open PRs at final audit. #910 is landed; save schema is 27.
**Implementation status:** ✅ MR1 merged in [#1029](https://github.com/a1flecke/conquestoria/pull/1029); ✅ MR2 merged in [#1035](https://github.com/a1flecke/conquestoria/pull/1035). This final-audit branch supplies the remaining acceptance evidence and reconciles this historical handoff with the shipped feature.

## 1. Cold start and scope contract

- [ ] Read `AGENTS.md`, `CLAUDE.md`, `.claude/rules/{game-systems,ui-panels,strategy-game-mechanics,end-to-end-wiring,spec-fidelity,incremental-mr-completion,game-balance}.md` and `docs/superpowers/plans/README.md` before editing their corresponding areas. For `.claude/rules/game-balance.md` edits, also read `.claude/rules/hooks-and-tooling.md`. Do not scan unrelated repository areas.
- [ ] Fetch origin, inspect `git status --short --branch`, and compare commits after the audit base. Inspect open PRs and overlapping #496/#497/#870/#871/#883 issues. Verify prior MR status from actual merged history, not unchecked boxes.
- [ ] Work in a fresh `codex/` worktree based on latest `origin/main`. Run `./scripts/setup-git-hooks.sh`; verify `git config --worktree --get core.hooksPath` is `.githooks`; trust this worktree's mise config. If needed run `./scripts/run-with-mise.sh yarn install --immutable` to create this worktree's PnP map.
- [ ] Carry these two Phase A documents into MR1 from the local documentation branch `codex/issue-496-design-plan` (inspect its final docs-only commit and cherry-pick that commit onto MR1). Do not assume the docs are already on origin/main or borrow another worktree's runtime files. MR1 publishes the documents with the first complete slice.
- [ ] Rerun the bounded seam searches in §4. Reconcile renames/file movement without redesigning behavior. If a central assumption is false, collect the exact evidence and use §12's escalation contract.

The supplied work brief's model stops are sequential handoffs, not permission to spawn agents. Each implementation slice starts only after the prior MR is merged and main refreshed. No Phase A implementation, PR, CI watch or merge occurs as part of authoring this plan.

## 2. Decisions Terra must preserve

| Decision | Rationale / invariant |
|---|---|
| Hybrid emergence plus authored charters | Works on procedural maps and for evolved city-states; no map-specific membership table. |
| Two–four members, one compact per minor, eight active world-wide | Bounded association, not another major faction. Geography is pairwise, not a chain. |
| Public name is “regional compact” | Distinguishes it from major defensive leagues and temporary city-state coalitions. |
| One source of membership | `MinorCivLeague.memberIds`; no mirror on minors or `Civilization` entry. |
| Production preference only | Existing queues, legal candidates, resources, progress, multipliers, caps, pending-spawn rules, levy gates and real costs remain authoritative. |
| No automatic war/pressure forwarding | Do not call coalition formation or `triggerLeagueDefense` from compact code. No new hostility or movement permission. |
| Per-member identity, alliances and quests survive | No pooled relationship, quest progress, ally bonuses, exclusive patron or shared treaty. |
| Contact grants explicitly public compact facts | Never grant undiscovered member names/counts/colors/locations or hidden military intel. Connected details stay member-scoped. |
| World opponent challenge controls pacing | Same legal/disclosure rules for every viewer; no current-player-dependent world politics. |
| Deterministic next check, IDs and readiness timestamps | No RNG outside seeded name selection; no formation/notifications on load. |
| One notice owner per committed transition | World postprocess uses buffered before/after diff; direct human mutation emits after installation. Never register raw audio or a second pending queue. |
| No #497 graduation | The future feature may remove an individual member through this lifecycle; no probabilistic statehood or inferred survival history here. |

Allowed local choices: helper-private names, test organization within the listed areas, DOM styling consistent with the existing panel, and allocation/index optimizations that preserve observable ordering. Constants, gates, persisted semantics, event recipients, economic/war boundaries and MR completeness are decided.

## 3. Exact data, constants and API contract

The spec §4 contains the exact persisted interfaces. Add them to `src/core/types.ts`; `GameState.minorCivLeagues` remains optional for legacy fixtures. MR1 stores `readiness: {kind:'quiet'}` only; MR2 implements the concern/cooling variants already reserved in the type. Runtime MR1 must not emit concern copy or apply defense preferences.

Define the following in `src/systems/minor-civ-league-definitions.ts`:

```ts
export const MINOR_CIV_LEAGUE_RULES = {
  minWorldTurn: 20,
  admissionGraceTurns: 10,
  minPopulation: 3,
  minBuildings: 1,
  radius: 10,
  minMembers: 2,
  maxMembers: 4,
  maxLeagues: 8,
  peacefulScoreBonus: 12,
  defenseScoreBonus: 25,
  knownCompactGiftBonus: 5,
} as const;
export const MINOR_CIV_LEAGUE_TIMING = {
  explorer: { checkInterval: 6, warningTurns: 3, coolingTurns: 6 },
  standard: { checkInterval: 4, warningTurns: 2, coolingTurns: 4 },
  veteran: { checkInterval: 3, warningTurns: 1, coolingTurns: 3 },
} as const;
export const MINOR_CIV_LEAGUE_NAME_KEYS = [
  'amber', 'willow', 'hearth', 'dawn', 'cedar', 'lantern', 'meadow', 'silver',
  'oak', 'reed', 'copper', 'laurel', 'stone', 'birch', 'star', 'olive',
] as const;
```

Charter metadata is `Record<MinorCivLeagueCharter, { label: string; purpose: string; preferredYieldKeys: readonly ('food'|'production'|'gold'|'science')[]; preferredBuildingIds: readonly string[] }>`. Commerce: gold, marketplace. Learning: science, library/temple/monument. Security: no yield key, walls/barracks. Cooperation: food/production, no explicit IDs. Positive yield OR matching ID earns a single bonus, not both. Assert every explicit ID exists in `BUILDINGS`. Initial values and rationale are in spec §5; add all new knobs to the Minor-Civ Economy inventory in `.claude/rules/game-balance.md` in the MR introducing each effect.

Proposed exported signatures (these functions do not yet exist):

```ts
// minor-civ-league-system.ts — no EventBus/UI imports
createMinorCivLeagueState(state: GameState): MinorCivLeagueState;
processMinorCivLeagueTurn(state: GameState): GameState;
reconcileMinorCivLeagues(state: GameState): GameState;
getMinorCivLeagueForMember(state: GameState, minorCivId: string): MinorCivLeague | null;
getMinorCivLeaguePreference(
  state: GameState, minorCivId: string, ownPosture: MinorCivPosture,
): MinorCivLeaguePreference;

type MinorCivLeaguePreference =
  | { kind: 'none'; reason: 'no-compact' | 'own-needs' | 'warning' }
  | { kind: MinorCivLeagueCharter | 'defense'; reason: 'charter' | 'preparation' };

// definitions.ts: only scalar/candidate data; never GameState
getMinorCivLeagueScoreBonus(
  preference: MinorCivLeaguePreference,
  candidate: { kind: 'building'; building: Pick<Building, 'id' | 'yields'> }
    | { kind: 'unit'; unitType: UnitType },
): number;

// storage/minor-civ-league-normalization.ts
normalizeMinorCivLeagueState(state: GameState): GameState;

// presentation: independently checked allocations, not object spreads
interface MinorCivLeaguePresentation {
  name: string;
  charterLabel: string;
  summary: string;
  readinessLabel: string;
  knownMembers: Array<{
    minorCivId: string; name: string; color: string;
    connectedDetail: string | null;
  }>;
  hasUnknownMembers: boolean;
}
getMinorCivLeaguePresentationForPlayer(
  state: GameState, viewerCivId: string, minorCivId: string,
): MinorCivLeaguePresentation | null;
getMinorCivLeaguesForPlayer(
  state: GameState, viewerCivId: string,
): MinorCivLeaguePresentation[];

interface MinorCivLeagueNotice {
  recipientCivId: string;
  message: string;
  severity: 'info' | 'warning';
}
interface MinorCivLeagueNoticeEvent {
  turn: number;
  notices: MinorCivLeagueNotice[];
}
buildMinorCivLeagueNoticeEvent(
  before: GameState, after: GameState,
): MinorCivLeagueNoticeEvent | null;
emitMinorCivLeagueChanges(bus: EventBus, before: GameState, after: GameState): void;
```

Place the notice builder and thin emitter in `src/systems/minor-civ-league-presentation.ts`. The emitter only emits the builder's nonnull result and never mutates state. Known DTO member IDs are permitted; no unknown IDs or raw compact ID reaches markup. `getMinorCivLeaguesForPlayer` deduplicates via an internal compact index before returning DTOs; names are unique among active compacts. Runtime membership/active checks precede every returned DTO. The renderer must not infer identity from `name` as a state lookup key.

**Lifecycle algorithm:** use spec §5's exact eligibility, admission registry, join-first order, pair ordering and greedy clique expansion. `createMinorCivLeagueState` initializes from current independent minors; `processMinorCivLeagueTurn` creates defaults if absent, registers new minors, respects `lastProcessedTurn`, reconciles, does one due admission check, and writes its turn marker. `reconcileMinorCivLeagues` returns input unchanged when the container is absent; otherwise it prunes invalid members, dissolves incompatible groups, sets grace only on an actual removal, and in MR2 updates readiness. It never registers new minors, forms groups, advances `nextCheckTurn`, or overwrites `lastProcessedTurn`.

Use `createRng(`${state.gameId ?? 'legacy'}:${id}`)` once per new name; select a vocabulary index with the seeded result, then cycle for a free name. A global cap of eight guarantees a free name among sixteen. The ID counter never decrements on runtime cleanup. A minor's lower admission population or a patron's war is not a departure trigger.

**Readiness algorithm:** a source is the member's own war/serious grievance against a living major with target-first neutral pressure era >=2. No world-unit scan. Reconciliation computes source booleans from the same input snapshot; transitions and delay/cooling semantics are spec §6. Economic preference is none for own non-settled posture; otherwise warning→none, ready concern→defense, no source/cooling→charter. An expired source cannot retain the defense bonus just because a stored record still says concern: preference checks the live source and fails closed. The presentation uses that same effective truth until reconciliation updates the stored union.

**Persistence:** migration 28 is reserved only relative to audited schema 27; take the actual next free number after re-audit and update this plan. Apply the same structural normalizer for current-version loads. Follow every rule in spec §10, including name/membership conflict ordering, record-drop grace, same-turn marker, overdue check preservation, identity bounds and malformed readiness. Separate raw identity validation from current eligibility: an established member with population 2 stays a member. Never call the gameplay reconciliation/tick from load normalization; it would reevaluate concerns or notify. New games initialize after minor placement and before initial autosave. No new migration for MR2 is required if it adds no field; normalize both reserved variants on current-version load then.

## 4. File/caller inventory and bounded drift searches

All paths below are repository-relative inside the active worktree. “New” means planned, not present on the audited base. For every source edit run its mirrored test, or the named smallest domain test if no mirror exists, following repo rules.

| File | Why / exact responsibility / callers and reuse | Tests |
|---|---|---|
| `src/core/types.ts` | New persisted types/container and `GameEvents['minor-civ:league-changed']`; no major actor/treaty type changes. | New league tests plus `tests/core/game-state.test.ts` and save tests |
| New `src/systems/minor-civ-league-definitions.ts` | Constants, neutral names, charter metadata and pure score bonus; reused by systems, UI copy and AI. | New `tests/systems/minor-civ-league-definitions.test.ts` |
| New `src/systems/minor-civ-league-system.ts` | Lifecycle, admission/scheduler, read-only preference, membership cleanup/readiness. Reuse `mapDistance`, `createRng`, minor definitions, `resolveOpponentChallenge`, target-first `resolveNeutralPressureEra`. | New `tests/systems/minor-civ-league-system.test.ts` |
| New `src/systems/minor-civ-league-presentation.ts` | Strict DTOs, connected-detail grant, safe before/after notices. Reuse `hasDiscoveredMinorCiv`, `getMinorCivPresentationForPlayer`, `isMinorCivAllianceActive`, `isMinorCivAtWar`; validate current route endpoints/foreign identity and the existing retention relationship >=-25 boundary from `scrubStaleForeignRoutes`. | New `tests/systems/minor-civ-league-presentation.test.ts` |
| `src/systems/minor-civ-economy-system.ts` | Compute preference once in `chooseMinorCivQueueItem`; add bonus only after baseline legality/cap filtering. Pass existing `posture`, not budget-overridden effective posture, to compact helper. Do not change completion/levy paths. | `tests/systems/minor-civ-economy-system.test.ts`, existing long-run file |
| `src/systems/minor-civ-system.ts` | Call league world tick; reconcile in `conquestMinorCiv` and `peacefullyAbsorbMinorCiv`. MR2 grievance prepass and post-coalition reconciliation preserve sorted processing, unit reset, quest/bonus/garrison order and final vassalage consequences. | `tests/systems/minor-civ-system.test.ts`, `tests/systems/minor-civ-integration.test.ts`, new league integration |
| `src/core/game-state.ts` | Initialize compact container after `placeMinorCivs` result is installed and before initial save. No map placement changes. | `tests/core/game-state.test.ts` |
| New `src/storage/minor-civ-league-normalization.ts` | Bounded structural recovery without gameplay. Constants/identity validation may be imported; no system tick. | New `tests/storage/minor-civ-league-normalization.test.ts` |
| `src/storage/save-migrations.ts` | Next numbered migration plus unconditional current-version normalization. | `tests/storage/save-migrations.test.ts` |
| `src/storage/save-manager.ts` | Normalize after existing quest/coalition/economy state is ready; preserve all other data and import/export shape. | `tests/storage/save-manager.test.ts`, `tests/storage/save-persistence.test.ts` |
| `src/ai/ai-diplomacy.ts` | Replace raw-minor discretionary-gift input with `MinorCivDiplomacyCandidate[]`; keep personality/relationship thresholds, sort by approved score then ID. No hidden-state access in evaluator. | `tests/ai/ai-diplomacy.test.ts` |
| `src/ai/basic-ai.ts` | Build discovered candidates, actual affordable cost from own assignment/default 25; run canonical `performMinorCivGift` on latest state, emit quest transitions once. Remove the late raw gold/relationship mutation. Existing assigned quest loop stays canonical. | `tests/ai/basic-ai.test.ts`, `tests/ai/basic-ai-treaty-contact-guard.test.ts` |
| New `src/ui/minor-civ-league-details.ts` | DOM-only builder of the approved disclosure using DTO text. Native details/summary, wrap and focus styling; no state reads or separate modal. | New `tests/ui/minor-civ-league-details.test.ts` |
| `src/ui/diplomacy-panel.ts` | Extend row DTO with safe compact projection; mount child disclosure; MR2 war help. Preserve every existing action and post-action rerender behavior. | `tests/ui/diplomacy-panel.test.ts` |
| `src/ui/advisor-system.ts` | One enabled, viewer-scoped first compact tip using nonempty safe projection. No global tip suppression for this fact. | `tests/ui/advisor-system.test.ts` |
| `src/presentation/register-diplomacy-presentation.ts` | Subscribe once to safe compact event; use happened-turn context and explicit recipient delivery; existing disposer removes subscription. | `tests/presentation/register-diplomacy-presentation.test.ts` |
| `src/app/controllers/turn-flow-controller.ts` | Add one compact notice diff in existing completed-round postprocess after state reconciliation; reuse buffer/discard/adopt-before-delivery. Assert nested DOM removed at handoff; no extra tick per human. | `tests/app/controllers/turn-flow-controller.test.ts`, completed-round tests |
| `src/app/controllers/player-action-controller.ts` | After each of two minor-conquest result installations, emit compact before/after diff once. MR2 also cover `ensurePlayerWarState` after its installed final state because #910 can join vassals to minor wars. | `tests/app/controllers/player-action-controller.test.ts` |
| `src/systems/minor-civ-actions.ts` (MR2) | Return reconciled state from successful war and peace branches and reparations. Keep current costs, permissions, quest and vassalage behavior. | `tests/systems/minor-civ-actions.test.ts` |
| `src/systems/diplomacy-system.ts` (MR2) | Final return from `applyVassalageWarConsequences` reconciles existing compacts; no events here. No changes to `DefensiveLeague`, `triggerLeagueDefense`, voting, treachery or vassal rules. | `tests/systems/diplomacy-system.test.ts`, league/vassal suites |
| `src/app/controllers/diplomacy-actions-controller.ts` (MR2) | Safe notice diff after installed state in `handleDiplomaticAction`, proposal responses/peace acceptance that may form vassal obligations, `handleMinorCivWarPeace`, and `handleMinorCivReparations`; call commit for touched state publication, then rerender the open panel as currently required. | `tests/app/controllers/diplomacy-actions-controller.test.ts` |
| `.claude/rules/game-balance.md` | Inventory the new constants and limits; label them preference/pacing, not a multiplier or combat buff. | Docs check; hooks checks if tooling rule applicability requires |
| Both #496 design/plan docs | Keep task boxes and phase status accurate in each slice MR. | `git diff --check`, content/link and spec coverage review |

Existing callers that should need no production edits: `ai-major-turn.ts` captures through the reconciled `conquestMinorCiv`; `religion-loyalty-system.ts` absorbs through the reconciled helper; `core/turn-manager.ts` already calls `processMinorCivTurn`; `register-all.ts` already registers the diplomacy registrar. Add parity tests in `tests/ai/ai-major-turn.test.ts`, `tests/systems/religion-loyalty-system.test.ts`, and `tests/core/turn-manager.test.ts` where they prove these live boundaries. Do not add redundant compact event emission to any of these sources: completed-round postprocess owns their aggregate notice.

Rerun these exact scoped searches and read the actual matches before editing:

```sh
rg -n 'processMinorCivTurn|conquestMinorCiv|peacefullyAbsorbMinorCiv|checkCampEvolution' src/systems/minor-civ-system.ts src/core/turn-manager.ts src/ai/ai-major-turn.ts src/app/controllers/player-action-controller.ts src/systems/religion-loyalty-system.ts
rg -n 'setMinorCivWarState|performMinorCivReparations|applyVassalageWarConsequences|declareMajorWar' src/systems/minor-civ-actions.ts src/systems/diplomacy-system.ts src/app/controllers/diplomacy-actions-controller.ts src/app/controllers/player-action-controller.ts
rg -n 'chooseMinorCivQueueItem|scoreBuilding|scoreUnit|evaluateMinorCivEconomyPosture|getMinorCivMobilizationBudget' src/systems/minor-civ-economy-system.ts src/systems/minor-civ-coalition-system.ts
rg -n 'evaluateMinorCivDiplomacy|performMinorCivGift|gift_gold' src/ai/basic-ai.ts src/ai/ai-diplomacy.ts
rg -n 'CURRENT_SAVE_SCHEMA_VERSION|normalizeLoadedState|normalizeMinorCiv' src/storage/save-migrations.ts src/storage/save-manager.ts
rg -n 'runCurrentCompletedRound|postprocess|closeNetworkPanelsForHandoff|commitTo' src/app/controllers/turn-flow-controller.ts src/core/completed-round-handoff.ts src/core/completed-round-orchestrator.ts
rg -n 'minorCivRows|mc-actions|onMinorCivWarPeace|onMinorCivReparations' src/ui/diplomacy-panel.ts
rg -n 'viewerScoped|withHappenedTurn|deliver|league' src/ui/advisor-system.ts src/app/ports.ts src/presentation/register-diplomacy-presentation.ts
```

If a named path moved, `rg --files` in that same domain finds its replacement before widening the search.

## 5. TDD fixtures and exact assertion matrix

Create `tests/systems/helpers/minor-civ-league-fixture.ts`, exporting `makeMinorCivLeagueFixture(options)` and `discoverMinor(state,viewerId,minorId)`. Use `createNewGame(undefined,'mc-496-fixture','small')` as a valid complete-state base. Replace the synthetic local map/minor subset explicitly; use `foundCity`/`createUnit` with the state's own `idCounters` and real minor definitions. This is test fixture work, not a production seeder.

Fixture return: `{state, ids:{a,b,c,d,e}, viewers:{a,b}, cityIds:{a,b,c,d,e}}`. Minor IDs use valid `mc-` owner IDs; assign definitions explicitly, not random array order. Set turn=40, wrap=false, width=64, population=3, one real archetype building and one owned warrior per minor. Use valid passable tiles and owned/worked tiles at positions A(4,4), B(7,4), C(10,4), D(7,7), E(13,4). Put the two viewer-owned major cities away from formation tiles; viewer IDs are `'player'` and `'player-2'` with independent visibility/diplomacy/quest/log state. Advance mature test targets through actual era tech definitions, not only `state.era`. Set admission times=30, `nextCheckTurn=40`, `lastProcessedTurn=39`; formation is due. Default archetypes all mercantile; options override count/archetypes/challenge. Discovery sets only the specified city tile to explored/visible in the specified viewer's map. Reset seeded unrelated camps/crises/AI behavior only in the test fixture when needed for controlled long runs, never production code.

The fixture builder must not prepopulate a compact unless `withCompact:true` is explicitly requested. For that option, use the proposed canonical state shape with `minor-compact-1`, neutral name `amber`, selected sorted members, formedTurn=30, quiet readiness and nextId=2. Tests of formation call the real scheduler, not a preseeded record.

| ID | Fixture/action | Exact assertion |
|---|---|---|
| F01 | Two mercantile minors, due at 40 | Exactly one commerce compact with A/B, neutral vocabulary name, nextId=2; no city/unit/diplomacy/quest changes. |
| F02 | Independently set turn=19; population=2; no building; grace=41; missing owner city | Each condition alone prevents admission. Mature+too-early and old+low-pop negative conjunctions included. |
| F03 | Only A; then A/B at distance 11 | No compact or forming UI in either case. |
| F04 | A(0,0), B(8,0), C(16,0) | A/B may pair; C cannot join because A/C >10 despite B/C<=10. |
| F05 | Five close minors | One group of four plus singleton (all same archetype); no five-member group. |
| F06 | Reverse minor/city record insertion and source array order | Same IDs, names, membership, charter and schedule; strict tie uses IDs, not iteration order. |
| F07 | Width=64, A at q=1/B at q=62 | Pair can form with wrapping; cannot form without it. No landmass assumption. |
| F08 | Existing A/B + eligible C | C joins existing group before new formation; ID/name/charter/formedTurn unchanged. |
| F09 | New evolved minor first observed turn 40 | Grace=50; no join at 49; eligible at 50 when check due. Freshly restored minor follows same rule. |
| F10 | Three members; conquer A via human then via AI fixtures | A removed immediately; B/C compact survives unchanged; real conquest state/quest cleanup still occurs. |
| F11 | Two members; peaceful religious absorption of A | Compact gone; B receives grace=turn+10; no added regional aggression, no lost transferred garrison. |
| F12 | Internal minor war, or a member moved beyond all-pair radius | Whole compact dissolves; live survivors receive grace; repeated reconcile does not extend grace. |
| F13 | Member population drops to 2 or member has two major allies | Membership remains; each preexisting alliance bonus/progress remains independent. |
| F14 | 18 eligible minors in nine separated compatible pairs | At most 8 compacts; remaining pair unassigned; no overflow of sixteen names. |
| V01 | Viewer A knows no member | Projection null, no compact DOM/advisor/notice, including color/ARIA/title/dataset/coords. |
| V02 | A knows one of three; B knows two different members | Each sees only its discovered names/colors/IDs plus one unknown-members sentence; no numeric total or unknown archetypes. |
| V03 | Known compact includes hidden founder | Public identity contains no founder name/ID/geography/sequence number. |
| V04 | Discovered+active alliance; discovered+valid viewer-owned route at peace with relationship 0 or -25 | Each grants detail only for that particular member; an existing route does not need creation eligibility rechecked. |
| V05 | Alliance without discovery; pending/broken chain; friendship-only; third-party/removed route; route still stored after war, relationship -26, endpoint capture/deletion or foreign ID mismatch | No connected detail. A raw relationship of 60 alone is insufficient; route cleanup need not have run yet. |
| V06 | Remove final known member; another viewer retains contact | First live panel loses compact, second retains only its safe members; prior log remains earned text. |
| E01 | Unit baseline score<0 due cap, positive defense preference | Unit remains excluded; no `-1+25` resurrection. |
| E02 | Legal unit/building tie fixture, charter bonus applies | Bonus is exactly 12 once; defense exactly 25 once; correct deterministic chosen item changes. |
| E03 | Existing valid queue+progress; change compact readiness | Queue/progress unchanged by reconciliation/selection policy; production cost unchanged. |
| E04 | Own recovering/fortifying/mobilizing member; compact concerned | Zero compact bonus; own worker focus, cap and levy evaluation identical to control. |
| E05 | Peaceful member with only shared concern | It never gets emergency levy eligibility or a new war; new defender requires accumulated production and original cap room. |
| E06 | Cap drop, illegal resource head, blocked spawn, pending retry | Existing #954/#952/occupancy behavior preserved, no second spawn or production multiplier. |
| R01 | A has mature-major war or own serious grievance; B peacefully settled | Quiet→concern timestamp 40; warning begins now; defense bonus zero until challenge delay. |
| R02 | Rumor/bare relation/peaceful neighbor/other compact concern/only era 1 target | No qualifying source, no concern-induced bonus. |
| R03 | Explorer/Standard/Veteran at delta delay-1 and delay | Zero before; +25 permitted exactly at 3/2/1 respectively; never turn 0. |
| R04 | Warning elapsed but source ended; source active but delay incomplete | Defense bonus zero in each case. |
| R05 | Last source peace or reparations below serious status | Cooling starts immediately, extra defense preference zero, open panel visibly updates. |
| R06 | One of two sources cooled | Concern stays; UI does not claim region is calm; no pressure transfer to peers. |
| R07 | Cooling completes; then new source during cooling | Quiet at 6/4/3 without source; new source resets full warning delay and emits once. |
| R08 | Repeated same-turn tick/reconcile/render | No repeat admission, extended grace, changed concern timestamp or duplicate notice. |
| A01 | Unknown compact with tempting raw relationship/wealth fields | AI candidate absent; decisions identical if all hidden fields/member count change. |
| A02 | Known eligible members tied except compact bonus | Approved +5 ranking; stable ID tie; no candidate/legality added by ranking. |
| A03 | AI gifts success, war denial, insufficient latest gold, assigned quest amount | Canonical cost/relationship/quest transitions correct; no negative treasury or raw bypass. |
| A04 | AI/turn owned compact policy, identical state with currentPlayer switched | Byte-identical gameplay result; only presentation differs. |
| P01 | Schema27 with no new fields | Empty compact state+grace; cities/units/queues/quest/grievance/coalition/vassalage unchanged; no events. |
| P02 | Current schema malformed unions/IDs/members/names/counters/times | Deterministic canonical repair per spec §10; no throw or new unit. |
| P03 | Membership conflicts: earlier invalid singleton, later valid pair | Invalid record reserves nothing; valid later pair survives. |
| P04 | Load twice; save at due check, warning deadline and cooling deadline | Idempotent normalize; next real turn equals uninterrupted trace, IDs/names/deadlines stable. |
| P05 | Huge/nonfinite/fractional/future values; MAX_SAFE_INTEGER ID suffix; valid MAX_SAFE_INTEGER-1 suffix with exhausted next counter | Maximum suffix record drops with grace; lower suffix survives with counter MAX_SAFE_INTEGER. Runtime refuses further formation without overflow; repeated normalization is identical; no catch-up storm. |
| U01 | Open real row; expand/collapse/reopen at 320/390px | Correct text, keyboard activation/focus, no horizontal overflow, all actions reachable. |
| U02 | Click reparations in open panel; click detached old control | Latest state gates each action; immediate text/cost/readiness refresh; no stale duplicate charge. If another valid purchase is allowed, a fresh control is required. |
| U03 | Human war button under vassalage | Remains disabled; no compact permission bypass. |
| U04 | New compact while simulation active or failing | No immediate toast during buffered simulation; failed round emits nothing; successful adopt+commit logs once with happened turn. |
| U05 | Hot-seat handoff and save retry | Diplomacy/details removed before veil; only recipient pending/log receives notice; retry/commit twice does not replay; no inactive-viewer cue. |
| X01 | Existing major defensive league and #910 vassal fixture | All arrays, leave/dissolve/defense obligations and tribute remain unchanged by compact functions; forced minor war still updates readiness. |
| X02 | 120-turn peaceful/war scenarios, all difficulties, seeded and reload fork | Existing cap/population/levy envelope preserved; compact bounds hold every sample; final traces match. |
| X03 | N=64 synthetic minors; repeated nondue calls | At most2016 unordered pair distances per formation candidate pass before bounded clique checks; no full map/unit scans; nondue/same-turn call performs no formation enumeration. |

## 6. MR1 — Peaceful regional compacts, complete and usable — merged in #1029

Dependencies: current main only; includes the Phase A documents. Scope: lifecycle, charter preferences, contact/connected disclosure, existing AI gift seam repair, persistence, advisor, safe membership notices and live panel. No concern/preparation effect or copy. If MR2 never ships this remains an understandable, useful peaceful compact feature. Merged as PR #1029; its rebase merge is the verified base for MR2.

### Task 1 — Define records, fixture, defaults and structural load handling

- [x] Add failing fixture/default/migration tests F01–F03 shape portions and P01–P05 in the new normalization suite plus `game-state` and existing save suites. Keep generated gameplay outside the normalizer.
- [x] Run `./scripts/run-with-mise.sh yarn test --run tests/storage/minor-civ-league-normalization.test.ts tests/core/game-state.test.ts tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts`. Confirm failures are missing compact behavior/assertions, not a broken fixture.
- [x] Add the types, constants/charter metadata, `createMinorCivLeagueState`, structural normalizer, next migration and current-version call, then initialize after minor placement. Implement exact acceptance order and spec §10 repair, including a dropped group's admission grace and overflow handling.
- [x] Rerun those focused tests; add a real JSON stringify/parse→`normalizeLoadedStateForTest`→next tick regression. Verify original city/unit/quest/vassal data deeply equals the input and input is unmutated.
- [x] Update the two documents' task evidence; commit this local step only when its focused tests pass. No PR for a data-only foundation.

Essential test skeleton (fixture contract is §5):

```ts
it('repairs without forming or spending, and normalization is idempotent', () => {
  const { state } = makeMinorCivLeagueFixture();
  delete state.minorCivLeagues;
  const before = structuredClone(state);
  const once = normalizeMinorCivLeagueState(state);
  expect(once.minorCivLeagues?.leagues).toEqual({});
  expect(once.cities).toEqual(before.cities);
  expect(once.units).toEqual(before.units);
  expect(once.minorCivs).toEqual(before.minorCivs);
  expect(normalizeMinorCivLeagueState(once)).toEqual(once);
  expect(state).toEqual(before);
});
```

### Task 2 — Formation, joining, cleanup and deterministic schedule

- [x] Write failing F01–F14 and R08 scheduling tests against the real new helpers. Include wrap, clique-negative, strict-majority/tie charter, shuffled insertion and overflow fixtures.
- [x] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-league-system.test.ts tests/systems/minor-civ-league-definitions.test.ts` and inspect exact failing assertions.
- [x] Implement the ordered algorithm in spec §5, using a single membership index. Seed names only at formation. Implement cleanup/rejoin grace; reconcile in both canonical conquest and peaceful absorption helpers. Call the scheduler once near the start of `processMinorCivTurn`; preserve existing member processing order in MR1.
- [x] Rerun focused files plus `tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-integration.test.ts tests/ai/ai-major-turn.test.ts tests/systems/religion-loyalty-system.test.ts tests/core/turn-manager.test.ts` in one command. Test actual capture/defection entry paths, not just manually changing `isDestroyed`.
- [x] Update phase evidence/docs and commit the local step. Do not merge before Tasks 3–5 finish.

```ts
it('cannot chain a regional compact across distant endpoints', () => {
  const { state, ids, cityIds } = makeMinorCivLeagueFixture({ count: 3 });
  state.cities[cityIds.a].position = { q: 0, r: 0 };
  state.cities[cityIds.b].position = { q: 8, r: 0 };
  state.cities[cityIds.c].position = { q: 16, r: 0 };
  const next = processMinorCivLeagueTurn(state);
  const groups = Object.values(next.minorCivLeagues!.leagues);
  expect(groups).toHaveLength(1);
  expect(groups[0].memberIds).toEqual([ids.a, ids.b].sort());
  expect(groups[0].memberIds).not.toContain(ids.c);
});
```

### Task 3 — Paid peaceful preferences and known AI gift candidates

- [x] Write failing E01–E04 peaceful portions and A01–A04. Pin a real candidate pair whose selected item changes because of the +12 preference; merely checking a helper's returned number is insufficient.
- [x] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-economy-system.test.ts tests/ai/ai-diplomacy.test.ts tests/ai/basic-ai.test.ts tests/ai/basic-ai-treaty-contact-guard.test.ts`.
- [x] Compute compact preference once in `chooseMinorCivQueueItem`; filter baseline scores below0 first, then add the bonus and preserve existing score/ID sorting. Do not modify `getMinorCivUnitCap`, `getMinorCivMobilizationBudget`, unit legality, city yields or queues already in progress. Return real reason codes for connected detail.
- [x] Define `MinorCivDiplomacyCandidate` in `ai-diplomacy.ts` with `{minorCivId, relationship, giftCost, canGift, knownCompact}`. Construct only discovered live peaceful pairs in the late `basic-ai` gift block; cost is the actor's currently assigned gold quest amount or25. `canGift` is computed against the actor's available gold and pair legality; execution revalidates via `performMinorCivGift`. Preserve existing per-candidate policy, sort by approved ranking, process against current state, and emit successful quest transitions. This removes the existing direct gold/relationship writes in that block. Do not give knowledge of other patrons to the evaluator.
- [x] Add an integration regression that runs AI with gold enough for one candidate and proves the actual paid recipient matches ranking; hide a compact member and mutate all its hidden state, then assert the AI decision is unchanged. Prove the late gift path cannot pay an at-war/unknown minor and cannot overspend stale `civ.gold`.
- [x] Rerun focused tests; run existing `tests/systems/minor-civ-economy-longrun.test.ts` once to protect the baseline envelope; update balance inventory/docs and commit local progress.

### Task 4 — Viewer projection, real diplomacy UI and advisor

- [x] Write failing V01–V06 and U01. Use real JSDOM for interactions; the legacy `tests/ui/helpers/diplomacy-fixture.ts` mock's empty event listeners do not prove clicks work. Reuse the actual JSDOM pattern from `diplomacy-panel.test.ts` or configure the new file for JSDOM.
- [x] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-league-presentation.test.ts tests/ui/minor-civ-league-details.test.ts tests/ui/diplomacy-panel.test.ts tests/ui/advisor-system.test.ts`.
- [x] Implement safe DTO allocation and connected grant in spec §7. Apply contact AND (active alliance OR valid route). For the route branch check current origin/destination ownership, matching foreign ID, peace and retention relationship >=-25; do not invent an `active` flag or call `canEstablishRoute` on an established route. War-invalid or hostile routes deny detail immediately even before cleanup. Build/mount the native details child in the existing row and set all dynamic values via text nodes. Preserve row actions and known-minor filtering. Add one viewer-scoped advisor tip, using the safe list only.
- [x] Test DOM output including `outerHTML`, accessible names and dataset strings against an undiscovered member's name, color, ID and coordinate. Assert one allowed unknown-members sentence, not one placeholder per hidden member. Test known-only/different-viewer cases and the real action catalog's reachability.
- [x] Add `tests/e2e/issue-496-compacts.spec.ts` with fixture autosave setup and `campaign-ready` diagnostic wait, following #910's existing E2E path. Open Diplo→disclosure on desktop and 390px; capture review screenshots only in this E2E/review flow. No production-only fixture hook.
- [x] Rerun focused suites and `./scripts/run-with-mise.sh yarn test:web-smoke tests/e2e/issue-496-compacts.spec.ts`; update docs/evidence and commit.

### Task 5 — Membership notices, hot-seat delivery and complete MR1 gate

- [x] Write failing U04/U05 plus a known-member loss notice regression using pre-destruction visibility. Test no notices for an entirely unknown compact and no notice for an invisible membership change whose permitted public facts remain identical.
- [x] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-league-presentation.test.ts tests/presentation/register-diplomacy-presentation.test.ts tests/app/controllers/turn-flow-controller.test.ts tests/app/controllers/player-action-controller.test.ts tests/core/completed-round-handoff.test.ts tests/core/completed-round-orchestrator.test.ts`.
- [x] Implement the before/after notice builder and thin emitter. One notice per affected compact/recipient per boundary; no coordinate target, raw state, hidden IDs or member totals. Formation/membership/dissolution copy comes from safe projections. No scheduled concern events in MR1.
- [x] Wire the existing world `postprocess` to reconcile and emit once into its passed buffer after strategic/supply work. Wire both direct player capture paths to emit after installing the reconciled result. Add the single diplomacy registrar listener with disposer and `withHappenedTurn`. Do not emit from the AI/religion/world-system capture helpers as well.
- [x] Exercise real hot-seat handoff with A/B's different member sets; confirm `#diplomacy-panel` and its detail are removed before the veil, recipient logs/pending queue are separate, simulation failure leaves no delivered message, and persistence retry cannot duplicate delivery. Existing pending-event infrastructure owns acknowledgement; do not add a compact receipt ledger.
- [x] Run targeted tests, browser replay, source rules and §10 verification. Inspect full committed AND uncommitted diff. Update all MR1 checkboxes and an honest “implemented locally; review pending” status before handing to Sol. Do not mark merged until the MR merges.

**MR1 review gate (Sol High):** actual code review across all 18 rubric dimensions; fix every real in-scope finding, especially projection markup, migration order, actor gift credit, actual capture cleanup, queue integrity and event buffering. Sol runs final verification and creates the focused MR including both design/plan documents, screenshots and the exact tested HEAD. No placeholder concern controls.

**MR1 CI/merge checkpoint (Luna):** use §11. After merge, annotate this phase as merged with actual PR number in the repository's required status form, refresh main, confirm commit ancestry, then and only then start MR2. No worktree stack that assumes an unmerged prior slice.

## 7. MR2 — Shared preparation and recoverable regional concern — merged in #1035

Dependency: MR1 merged and current main refreshed. Scope: readiness, warning delay, paid defense preference, immediate counterplay truth, vassal-war reconciliation, complete UI/AI/notification/long-run regression coverage. No new schema field or new political action. Merged as PR #1035 after the inline review corrected a hot-seat disclosure ordering bug and CI completed successfully.

### Task 6 — Source-owned concern and deterministic readiness

- [x] Write failing R01–R08, A04, X01, P04 readiness cases. Build a concern using real bilateral war or own serious grievance plus actual target era tech. Add a negative fixture with an unrelated advanced distant major and an era 1 actual target; it must not gain shared preparation.
- [x] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-league-system.test.ts tests/systems/minor-civ-actions.test.ts tests/systems/diplomacy-system.test.ts tests/systems/vassalage-obligations.test.ts tests/storage/minor-civ-league-normalization.test.ts`.
- [x] Extend reconciliation to the exact readiness union transitions. Move existing grievance updates for active, defined, independent minors to a sorted prepass in `processMinorCivTurn`, before the compact tick and economy decisions. Keep each reset/economy/plan/quest/bonus/garrison call exactly once. After coalitions and vassalage consequences, reconcile without another scheduled tick.
- [x] Return reconciled state from `performMinorCivReparations`, both `setMinorCivWarState` success branches, and the final `applyVassalageWarConsequences` return. Reconciliation must not import/call diplomacy, so the new dependency is acyclic. Conquest/absorption already reconcile from MR1.
- [x] Test three-member ID-order reversals where one member's pressure decays through 45 this turn: every peer observes the same post-decay source state. Test a coalition starts war at the end, and a major's vassal is forced into a minor war; readiness is correct without altering obligations.
- [x] Rerun relevant suites plus `tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-integration.test.ts tests/systems/diplomacy-league.test.ts tests/systems/vassalage-lifecycle.test.ts tests/integration/vassalage-lifecycle.test.ts`; update docs and commit the local step.

```ts
it.each([
  ['explorer', 3], ['standard', 2], ['veteran', 1],
] as const)('keeps the full %s warning delay', (challenge, delay) => {
  // Fixture option `matureTarget:true` gives viewers.a real era 2+ completed techs.
  const mature = makeMinorCivLeagueFixture({ withCompact: true, challenge, matureTarget: true });
  const warned = setMinorCivWarState(mature.state, mature.viewers.a, mature.ids.a, true).state;
  const waiting = { ...warned, turn: warned.turn + delay - 1 };
  const ready = { ...warned, turn: warned.turn + delay };
  expect(getMinorCivLeaguePreference(waiting, mature.ids.b, 'settled').kind).toBe('none');
  expect(getMinorCivLeaguePreference(ready, mature.ids.b, 'settled').kind).toBe('defense');
});
```

Add the source-ended negative from R04 to this boundary coverage: at the same ready turn, making peace with the only source must remove the defense preference immediately.

### Task 7 — Economy integration and immediate visible counterplay

- [x] Write failing E01–E06, U02/U03 and connected-detail R03–R07. Reuse current levy evaluation and cap-drop regression fixtures as controls.
- [x] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-economy-system.test.ts tests/systems/minor-civ-league-presentation.test.ts tests/ui/diplomacy-panel.test.ts tests/app/controllers/diplomacy-actions-controller.test.ts`.
- [x] Enable defense bonus only under the exact preference/legality rules. Extend DTO copy and connected reasons, and add the compact help beside the actual member war action. No cap/posture override, no queue cancel, no worker focus rewrite, no enemy identity in copy.
- [x] In touched direct diplomacy controller functions capture before state, install reconciled after state with `session.commit`, rerender the open panel, and emit the safe diff once. Include `handleDiplomaticAction`, accepted proposal/peace paths that change vassal obligations, minor war/peace and reparations. In player actions include the final installed result of `ensurePlayerWarState`. All world AI/religion/coalition changes still rely on round postprocess, not an extra caller emission.
- [x] Replay actual reparations interaction: sole source pressure 55→35 goes concern→cooling immediately at the same turn; multiple source fixture remains concerned. Detached old button must not charge again; a fresh eligible button may perform a second legitimate payment. Ensure click closures bind current viewer/pair and revalidate current state. Do not incorrectly add a global once-per-turn reparations cooldown.
- [x] Rerun focused tests and the expanded compact E2E test, including vassal action denial and both hot-seat member sets. Add preparation/cooling notices by comparing effective before/after public phase, including elapsed delay; repeated frame renders have no emitter. Update balance inventory/docs and commit locally.

### Task 8 — Full actor, save, long-run and MR2 review gate

- [x] Add new `tests/systems/minor-civ-league-integration.test.ts` for canonical turn/war/peace/quest/absorption parity, and `tests/systems/minor-civ-league-longrun.test.ts` for X02/X03. Implement 120-turn peaceful and war variants across all challenge modes; mirror existing long-run fixtures and preserve their assertions.
- [x] Compare original state against a JSON-save/reload fork on a due formation turn, warning boundary, readiness activation, cooling boundary and after destruction. Compare deterministic relevant state traces and emitted safe notice payloads, not UI animation timing.
- [x] Add integration with existing major league and vassalage fixtures: compact formation/readiness does not change `defensiveLeagues`, treaty/tribute/war obligations, allied quest state or world tactical orders. Then independently trigger an existing legal war and prove its canonical consequences still occur.
- [x] Count scheduler work on N=64 and nondue turns. Membership limits are invariant, not a benchmark threshold. Do not inflate timeouts or widen economic caps to hide a regression. If long-run tests need slow-tier registration, read and follow current `scripts/run-test-suite.sh`/tooling rules and add the smallest classification regression.
- [x] Run focused/integration tests, source rules, both distribution builds because save loading changed in the arc, compact E2E and §10 verification. Review the entire branch delta from origin/main plus local delta. Update documents and phase status with actual evidence, then stop before MR creation for Sol.

**MR2 review gate (Sol High):** perform actual-code review and fixes across every dimension; special scrutiny on early-game source gates, own recovery precedence, per-viewer connected data, vassal forced wars, readiness lag, baseline-negative-score resurrection, save deadline preservation, duplicate events and discarded-round logs. Fix every real in-scope issue with exact regressions; do not invoke Astra for a mechanical fix.

**MR2 CI/merge checkpoint (Luna):** use §11; after merge refresh main, verify ancestry and run the final arc audit in §13. MR2 closes #496 only when the actual merged feature satisfies the design; do not mark #497 complete.

## 8. Player Truth Table

| Before | Action/event | Internal mutation | Immediate visible truth | Denied/unavailable explanation |
|---|---|---|---|---|
| Unknown compact | Open Diplo | None | No entry, detail, rumor, advisor or member placeholder | Nothing was earned; no hidden teaser |
| A is known, B is hidden; shared compact | Expand A's detail | UI disclosure only | A name, compact identity, charter and one unknown-members sentence; B absent from all markup | Connected detail absent until its explicit grant |
| Known peaceful compact | Normal queue selection on world turn | Legal candidate gets charter preference; pays existing production | Public charter purpose stays truthful; connected detail describes preference, not actual queue | Own non-settled posture says own needs take priority |
| Known member faces mature war | Declare War through existing legal action | Bilateral war/quest consequences, readiness concern begins | Row war status, concern warning and individual war explanation update | Existing vassal restriction still blocks declaration |
| Concern waiting period | Advance to exact deadline | No new war; preference becomes eligible | Preparing-local-defenses label; one safe transition notice | Warning label remains before deadline |
| Sole serious grievance, peace, enough gold | Pay Reparations | Canonical charge and 55→35 pressure; cooling | Cost, remaining eligibility and cooling update in open row | At war/poor/no active grievance uses existing reason |
| Two concerns | Pay one member | Only its own grievance changes | Still preparing if another valid cause persists | No claim of league-wide payment or mediation |
| Old reparations DOM reference | Repeat old click | Reject stale interaction; no second debit | Current row remains correct; fresh eligible action still reachable | Stale reference is not a new authorized current control |
| Concern ended, valid defense queue exists | Make Peace / source decays | Extra preference stops; valid queue/progress persist | Cooling says normal future choices; no “army disbanded” claim | Remaining ordinary grievance/coalition rules shown independently |
| A/B/C compact | Conquer/absorb A | Remove A, preserve B/C identity | Known safe survivor list refreshes; no unknown name/count leak | Two→one dissolves; no fictional substitute member |
| A is current hot-seat viewer | End turn | Existing handoff transaction | Detail/panel gone before veil; B gets only B's earned facts | Suppressed/inactive viewers hear no compact cue |
| Legacy/current save | Load | Structural migration/repair only | No formation burst or replayed warning; actual saved valid contact state renders | Unknown/future schema handled by existing loader |

## 9. Misleading UI Risks and Interaction Replay Checklist

Misleading UI risks to pin with negative assertions:

- “Preparing” must mean a live qualified source AND completed warning, never only the persisted union or a neighbor's posture.
- “Local priority” is a preference, not an exact queue item or promised completion. Check own recovery, cap exclusion and active valid queue.
- “Other members not yet met” is one intentional existence fact, never an exact count, inferred charter of hidden members, or a list of hidden colored slots.
- A connected member does not grant connected details for its peers. Alliance without discovery and third-party routes stay insufficient.
- Cooling does not mean peace, immunity, erased pressure, canceled training or a refund.
- Gift/quest success must not be described as buying the whole compact or reducing another member's grievance.
- Hidden IDs must not leak in links, accessible labels, dataset values, tooltip/title text or notification map targets.
- A compact does not add defenses to the major league UI, treaties list or vassal permission controls.

Replay in an actual browser using fixture saves and the existing autosave helper:

- [ ] Install solo fixture, await `campaign-ready`, open Diplo, expand/collapse/reopen compact detail, keyboard-toggle it, resize to 320/390px, and inspect readable/wrapped text and all individual actions.
- [ ] Discover only A, confirm hidden B has no DOM trace; reveal B using a new prepared fixture and confirm both names now appear without an exact total when C remains hidden.
- [ ] Grant alliance and viewer-owned trade separately; compare missing/pending/broken/foreign-route fixtures, then declare war with the route still stored and verify connected detail disappears immediately.
- [ ] Declare war against a known member, read immediate warning, advance through each challenge's delay, and observe preparation without additional peer war declarations.
- [ ] Pay sole-source reparations, inspect same-panel cooling and affordability, try old detached control, then use a fresh valid control if eligible. Repeat with another continuing source.
- [ ] Capture a member through both empty-city entry and defender-defeat live player paths; use AI and religious defection integrations for the other owners. Confirm survivor identity/dissolution.
- [ ] Run a real hot-seat handoff with different discovery sets and connected grants; confirm panel removal at veil, B's safe rows, A-only pending notice, and no duplicate after save retry.
- [ ] Save/reload at warning and cooling deadlines; verify no event on load, then exactly one appropriate transition after advancing.

**Queue and ETA checklist:** this arc adds no player-visible queue, queue action, or ETA. Existing hidden `City.productionQueue` and progress survive membership/readiness changes. Assert the compact DOM never displays queue item IDs/progress/ETA and the hidden paid queue remains valid. Do not add “show queue”, reorder or remove controls to satisfy a generic checklist.

## 10. Verification commands and evidence discipline

Phase A authoring is docs-only: review both documents, local paths, requirement coverage and `git diff --check`; no build is claimed. Baseline on `ff3c7eac`: 90 focused tests plus accompanying hooks passed; final audit moved to `9e3db8f6` through unrelated #970 changes. Do not present baseline as tests of this unimplemented feature.

For each implementation change: run the task's narrow files first. After source edits, run `scripts/check-src-rule-violations.sh` with every changed `src/` path and the union of their mirrored tests. Resolve small test-file drift by the repo's smallest-relevant-domain rule. For `.claude/hooks`, settings or hook-test changes, also run `./scripts/run-with-mise.sh yarn test:hooks`. Keep failed command sessions and stop after two materially similar failures; report rather than repeatedly retry.

Before any push, PR or merge, use separate commands:

```sh
git diff --check
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test:durable
./scripts/run-with-mise.sh yarn test:durable:status
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD
git diff
```

For a single bounded combined proof, the current repo also supports `./scripts/run-with-mise.sh yarn verify:pr` followed by `./scripts/run-with-mise.sh yarn verify:pr:status` (480-second budget, HEAD/worktree-bound). Do not chain `yarn build && yarn test`. Do not run both forms repeatedly after they have passed without a change that invalidates them. Durable status is authoritative if output truncates. When it reports an active run, poll its existing terminal session; never start a duplicate suite or push. If exit status is unrecoverable, say inconclusive.

Save-loader changes in MR1 require web and Tauri frontend builds and mirrored storage/UI tests:

```sh
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn build:tauri
./scripts/run-with-mise.sh yarn test:web-smoke tests/e2e/issue-496-compacts.spec.ts
```

Inspect generated web asset references for `/conquestoria/` before the Tauri build overwrites `dist`; then confirm relative asset references in Tauri output. No packaging/config/native API changes are planned, so a macOS bundle build is not required. Do not create distribution-specific compact state or behavior. For final arc proof, repeat builds only as required by the final changed HEAD; don't rerun unchanged focused tests merely for narration.

Sol's MR description names the exact slice and player behavior, canonical ownership, AI, difficulty, visibility/hot-seat, save/data, balance, review findings/fixes, test commands/results and screenshots. Include any omitted tasks plus the required explanation of why partial scope is safe; otherwise finish the omitted task before publishing a visible action. A green test helper in an unused module is not acceptance evidence.

## 11. Per-MR model and merge checkpoints

Terra completes one local slice with TDD and focused/integration evidence, then stops before MR creation:

`STOP — SWITCH TO SOL, HIGH EFFORT, FOR IMPLEMENTATION REVIEW AND FIXES.`

Sol reviews the actual full diff across the rubric in §14, fixes real in-scope findings, reruns affected/final checks, creates the MR, then stops:

`STOP — SWITCH TO LUNA FOR CI WATCHING AND MERGE.`

Luna inspects required CI for the reviewed/tested HEAD, mergeability and blocking reviews. Every required check must be green, except `build` may remain non-green only under the explicit exception authorized in the supplied work brief. No other red check is bypassed. Confirm the current repo/maintainer exception still applies before using it. Authorized merge method is **rebase with admin bypass**, never squash or merge commit. Use the exact current PR number when running `gh pr merge <number> --rebase --admin`.

Infrastructure/flaky/canceled CI: diagnose/wait/retry only when justified. Obvious compiler/lint/fixture/mechanical fixes: stop for Terra. Ambiguous gameplay/AI/save/hot-seat fixes: stop for Sol High. Architectural contradiction: stop for Astra xhigh. After every code fix return to Luna for the current HEAD's CI; stale green CI is not evidence.

After each merge: fetch origin, update/rebase local main without disturbing unrelated worktrees, verify the actual merged commits are ancestors of origin/main, and sync this plan's merged-phase status in the completing MR according to repository policy. If more slices remain:

`STOP — SWITCH TO TERRA FOR THE NEXT IMPLEMENTATION SLICE.`

## 12. Escalation contract

Terra may reconcile straightforward file drift, implement private algorithms consistent with the exact ordering, and fix ordinary regressions. Sol may resolve a local ambiguity in code or tests when the approved behavior stays unchanged. Neither may replace contact-based disclosure with full membership, raise caps, add sanctions/war/treasury/units, erase individual alliances, change the admission/readiness contract, or drop a required live caller to fit a slice.

A central contradiction includes: current main no longer has independent minor economies; war ownership cannot remain separate; newly shipped intel rules forbid the explicitly approved contact disclosure; or the planned migration/state cannot preserve save determinism without changing its semantics. Record the affected spec section, current code evidence and smallest alternatives, then:

`DESIGN ESCALATION REQUIRED — SWITCH TO ASTRA, XHIGH EFFORT.`

Sol uses the supplied bounded architectural-conformance handoff only if the correct architecture itself becomes uncertain. Do not return to Astra for flaky infrastructure, a missing import, test fixture cleanup, straightforward rebase or a normal implementation bug.

## 13. Final arc acceptance

After MR2 merges, audit current main for formation/dissolution, caps, all membership paths, known/unknown projection, AI information boundaries, all difficulty gates, real economy/levy limits, quest/alliance/grievance/coalition distinction, major league/#910 regressions, new/legacy/malformed saves, solo/hot-seat UI/advisor/notices, deterministic performance and #497 extension boundaries. Trace the actual live UI and world-round callers. Any concrete regression gets a focused corrective MR with the same Terra→Sol→Luna review/verification flow.

The final report must list design/plan paths, MR links in order and each slice outcome, design/plan review corrections, actual Sol findings/fixes, CI/test evidence, rebase/admin merge confirmation, current-main verification, deferred non-goals and readiness for #497. “Ready for #497” means clean individual-member removal and retained economy/compact facts; it does not mean a graduation design or implementation exists.

### 2026-09-06 final-arc audit evidence

- [x] Reconciled the design status and MR2 record with the merged production slices: [#1029](https://github.com/a1flecke/conquestoria/pull/1029) established formation, lifecycle, disclosure, persistence, AI and notices; [#1035](https://github.com/a1flecke/conquestoria/pull/1035) added source-owned concern, delayed preparation, recovery, hot-seat disclosure repair and UI truth.
- [x] Audited the live formation/dissolution, membership cap, presentation, war/peace reconciliation, save normalizer, turn scheduling and browser UI paths against the final-acceptance scope.
- [x] Added canonical turn/save/war/peace integration coverage, 120-turn deterministic solo runs across Explorer, Standard and Veteran, 64-minor admission/nondue bounds, slow-tier registration, and desktop/390px browser replay with partial discovery.
- [x] Confirmed the audit coverage keeps compact consequences bounded: no added war obligation, levy, population change, unit, cap or production multiplier; member-specific diplomacy and the #497 graduation boundary remain intact.
- [x] Deferred [#497](https://github.com/a1flecke/conquestoria/issues/497) as its own graduation design and implementation arc. It may consume retained individual compact facts, but is not implemented or implied by #496.

## 14. Inline multidimensional implementation-plan review — resolved

Rubric applied verbatim:

> perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.

For each dimension the review checked whether Terra can implement it without hidden reasoning, whether callers/migrations/UI/AI/hot-seat assertions are explicit, and whether each MR remains useful if later work never ships.

| Dimension | Concrete plan finding | Severity | Required correction | Resolution |
|---|---|---|---|---|
| Balancing gameplay | Adding +25 before filtering a baseline -1 revives illegal units. | High | Filter negative scores first; check actual completion/cap controls. | §3, Task 3/7, E01/E05/E06. |
| Fun | A schema/lifecycle-only MR would have no understandable value. | High | MR1 includes paid peaceful effects, contact UI/advisor and safe notices. | §6 gate explicitly includes Tasks 1–5. |
| New mechanics | Concern could be confused with automatic coalition entry. | High | No coalition mutation; explicit war help and X01 parity tests. | Decisions §2, Tasks 6–8 and truth table. |
| Ages 7–43 | Tooltips and optimizer numbers alone would leave young players confused. | Medium | Exact first sentence, native progressive disclosure, phone/keyboard replay. | Spec §8, Task 4 and §9. |
| Play styles | A hidden patron/compact score could override individual alliances. | High | Pairwise gifts/quests, bounded ranking only, coalition/ally controls. | F13/A02/A03/X01 and Tasks 3/8. |
| Difficulty modes | Era fixture set only on `state.era` would test the wrong gate. | High | Set target completed techs through canonical era definitions. | Fixture §5, Task 6 and R02/R03. |
| Computer players | Raw gift mutation would survive if only a new evaluator were tested. | High | Change the actual late basic-ai caller and verify paid recipient/quest transitions. | File inventory and Task 3 integration. |
| UI | Mock DOM helpers do not execute listeners; a stored route can already be invalid. | High | JSDOM clicks and actual browser flow; independently test live route validity before cleanup. | Task 4/7, V04/V05 and U01/U02. |
| UX | Repeat-click test could accidentally prohibit valid repeated reparations. | Medium | Reject detached stale control only; fresh legal action remains reachable. | Task 7 and Player Truth Table. |
| Architecture | Emitting from each capture caller and the world diff would double-notify. | High | One buffered world postprocess, direct human emissions only after installation. | File inventory, Task 5/7, U04/U05. |
| Extensibility | Phase A docs might be absent from the fresh MR1 worktree. | Medium | Carry reviewed docs-only commit into MR1, then publish with it. | Cold-start checklist §1. |
| Data | A rejected malformed group could steal a member during normalization. | High | Reserve IDs only after accepting a >=2-member valid group. | P03, Task 1, spec §10. |
| SFX | A second hot-seat pending queue would duplicate a default notification. | High | One registrar delivery; no `collectEvent` or raw cue. | Task 5, U04/U05, spec §8. |
| Saved games | Only a numbered migration misses malformed current-schema saves; maximum safe IDs cannot have a larger safe counter. | High | Shared current-version normalizer, deadline equivalence, explicit exhausted-counter boundary and idempotent repair. | Task 1/8, P01–P05 and spec §10. |
| Testing | Helpers alone do not prove the prepass, capture paths or real paid choices. | High | Exact fixture matrix and canonical caller/integration tests. | Tasks 2/3/6/8, F10/F11/E02/X02. |
| Solo regressions | No handoff in solo could tempt unscoped notification shortcuts. | High | Same safe projection and buffered delivery; unknown solo fixtures. | V01/U04 and Tasks 4/5. |
| Hot-seat regressions | Different discovery sets and failed save retries were unspecified. | High | Real veil removal, recipient isolation and once-only buffer commit. | U05, Tasks 5/8, browser replay. |
| Proper implementation | Generic MR decomposition allowed later UI to repair an earlier dark mechanic. | High | Both MR gates include their live behavior/UI/save/AI, plus full source and local diffs. | §6/7 completeness and §10/11 review gates. |

Review outcome: the handoff contains concrete decisions, APIs, fixtures, callers, two deployable slices, verification, escalation and final acceptance. All reviewed findings are addressed in the plan; implementation and actual-code review remain unstarted.
