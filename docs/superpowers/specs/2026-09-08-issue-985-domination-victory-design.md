# Issue #985 — Domination victory design

Date: 2026-09-08. Phase A: design and inline review complete; implementation has not started.

Repository destination: `docs/superpowers/specs/2026-09-08-issue-985-domination-victory-design.md`.
Companion: [implementation plan](../plans/2026-09-08-issue-985-domination-victory-implementation.md).

## 1. Decision and scope

**Player rule: “Be the last independent empire: defeat the other empires or make them your vassals.”**

An empire is a major civilization, not a minor civilization, compact, barbarian owner, pirate, or beast. A valid vassal remains alive and playable but cannot win independently. A small provisional secession has the narrowly bounded exception in §5. Domination becomes final at the end of a completed world round, after every eligible human and AI has had that round's opportunity. The rule is identical on Explorer, Standard, and Veteran.

This chooses sovereignty as the strategic objective. Cities, armies, sieges, diplomacy, protection, and rebellion are ways to change sovereignty; there is no new capture-point currency, percentage buff, capital objective, or forced surrender mechanic. Existing #910 vassalage is a consent-based alternative to total elimination. It is not a “Demand surrender” action.

The deliverable has four implementation MRs (§18). This document defines a concrete implementation contract for the requested staged workflow; it does not claim that the human has reviewed the resulting game-design choices. Human review/model switching remains the implementation handoff gate.

## 2. Current-main audit and drift baseline

Initial audited source: `644c9d64a6171cb5eeffaf1008b5e55a449a7388`, fetched on 2026-09-08. The worktree is `.worktrees/issue-985-domination-design`, branch `codex/issue-985-domination-design`. Main was clean, rebased to the fetched tip, and the new worktree created from it. Hooks report `.githooks`. The initial focused baseline passed: 2 files, 22 tests, plus repository hook smoke checks; exit 0. That is baseline evidence, not implementation verification.

Read the current [#985 body and comment](https://github.com/a1flecke/conquestoria/issues/985). Its audit at `9e3db8f` is stale: victory is no longer based on a city roster. [PR #1050](https://github.com/a1flecke/conquestoria/pull/1050) is merged at the audited tip. Its final victory/rotation/outcome changes and current lifecycle implementation were inspected. Its design is `docs/superpowers/specs/2026-09-07-issue-981-1018-civilization-liveness-design.md`. That liveness decision is authoritative and outside #985's redesign scope.

The audit followed named owners and their direct callers; it did not scan unrelated repository areas. Searches covered domination/victory/outcome in turn and presentation owners, liveness consumers, capital fields in City/Civilization and founding/capture, vassal and breakaway lifecycle, warning projection, viewer/contact/visibility, hot-seat handoff, and AI planning/diplomacy. No Domination pursuit code exists in `src/ai` or its mirrored tests at this base. `City` has no durable original-capital identity; current capital conventions cannot recover original capitals reliably from older saves.

| Concern | Current owner / API | Current behavior | Missing or unsuitable | #985 responsibility |
|---|---|---|---|---|
| Liveness | `systems/civilization-liveness.ts:getCivilizationLiveness` | Actual city ownership OR healthy viable settler, terminal elimination honored | None to redesign | Consume it for every authoritative participant |
| Lifecycle | `civilization-elimination-system.ts:reconcileCivilizationLiveness` | Canonical teardown and returned transitions | No persistent observer record of defeat | Add narrowly scoped observation recording without changing verdicts |
| Victory | `systems/victory-system.ts:checkDominationVictory` | Sole living major, at least two major records | Vassals remain blockers; no progress contract | One rule/query, vassal and secession semantics |
| World timing | `core/turn-manager.ts:processTurn` | Increments turn, emits `turn:start`, then checks victory | Start event precedes final outcome | Resolve at same round boundary, before start event |
| Round ordering | `completed-round-orchestrator.ts:runCompletedRound` | Cloned improvements → major AI → world → postprocess, buffered events | No special Domination work needed in orchestrator | Preserve ordering and rollback |
| Human rotation | `turn-cycling.ts`, `hotseat-outcome.ts` | Canonical living humans only; finished outcome takes precedence | No sovereignty-specific change | Vassals and viable settler humans retain turns |
| Capture | `city-capture-system.ts`, `input/city-assault-flow.ts` | Begin assault, pending choice, finish occupy/raze; owner mutation owns result | Pending choice lives outside saved GameState | Block round entry while choice is pending; no mid-action winner |
| Vassals | `diplomacy-system.ts`, #910 | Bilateral consent, role links, treaty, protection and independence | Current private active-edge query is not a Domination contract | Validate existing relationship facts; do not change consent/balance |
| Breakaways | `breakaway-system.ts` | One-city secession, 50-turn establishment, reabsorption; metadata retained | Current ending treats every secession identically | Bounded small-secession exception, no liveness/AI exception |
| Minors | `core/owner-kind.ts`, minor leagues/coalitions | Separate owner domain and state containers | No major-victory claim | Explicit exclusion; existing military pressure remains |
| Viewer knowledge | `viewer-intel.ts`, `last-seen-presentation.ts` | Contact and current inspection; trusted observed snapshots | No political progress DTO | Shared observer evidence, then display projection |
| Espionage | `espionage-system.ts` / `EspionageCivState.intelReports` | `gather_intel` earns dated treaty/tech/treasury snapshots | No bounded report of target's earned conquest record | Extend successful existing mission with filtered political report |
| Warnings | `strategic-warning-system.ts` | Before/after events, per-viewer keys, existing audio acknowledgement | No Domination kind; existing major warnings exclude human actors | Add conservative known-rival warning for human or AI contenders |
| AI pursuit | `ai-prepared-turn.ts`, `ai-objective-scoring.ts`, `ai-plan-portfolio.ts` | Perception-based candidates, loss/travel/readiness gates and defense portfolios | Capture candidates start only from war/recent attack | Bounded conquest preference and lawful peaceful-target preparation |
| AI execution | `basic-ai.ts`, `ai-major-turn.ts`, `ai-round-scheduler.ts` | Frozen planning snapshot, revalidation, canonical actions | No Domination intent/counterplay | Use shared evidence, existing execution and #995 APIs |
| Difficulty | `core/opponent-challenge.ts` | Global opponent competence separate from per-human pressure difficulty | No Domination weights | Only competence weights; never new knowledge or legal privileges |
| UI | `app/bootstrap.ts` registry, `panel-actions-controller.ts`, `ui/game-shell.ts` | Live registry and panel factories; `victory-panel.ts` only final modal | No progress launcher/panel; global winner name can leak | Working panel, safe outcome copy, close across handoff |
| Advisor | `ui/advisor-system.ts:warchief_domination_hint` | Early-turn hint says to conquer every rival and leave no enemy city | Contradicts both canonical settler liveness and the new vassal rule | Replace live hint copy and mirrored regression in MR1 |
| Save | `storage/migrations/{ordered,compatibility,repair,pipeline}.ts` | #1023 registries, schema 28 | New earned history needs explicit storage | One new schema step for intelligence, no persisted progress |
| Determinism | `tests/helpers/deterministic-state.ts` | Complete simulation comparison, only identity/schema exclusions | No Domination continuity proof | Same commands, snapshots, winner, warnings and traces |
| SFX / moments | `ceremony-coordinator.ts`, audio suppression/mixer | Wonder-specific queue; no victory SFX in `SFX` | #993 framework absent | Reuse final modal and existing warning cue; small final event seam |
| Chronicle | `great-general-career.ts`, Hall of Fame; notification log | Chronicle is General-specific; viewer log capped at 50 | No general campaign journal | Outcome hook and retained outcome/log; do not fabricate a General event |

### Adjacent work

- [#995](https://github.com/a1flecke/conquestoria/issues/995) is now closed: [PR #1052](https://github.com/a1flecke/conquestoria/pull/1052) landed at `a04a1c33` during Phase A. Its actual transitions are `declareMajorWar(state, a, b, bus?)` and `makeMajorPeace(state, a, b)`. Low-level single-side functions remain exported for sanctioned minor-civ callers; source guards constrain other callers. Reuse `assertBilateralWar` from `tests/helpers/save-state-invariants.ts` and `tests/systems/bilateral-war-invariant.test.ts`. `normalizeBilateralWar` is a corruption repair, with no schema bump; schema28 remains current. MR4's merge prerequisite is satisfied at this baseline, but its API/ancestry refresh still applies.
- [#993](https://github.com/a1flecke/conquestoria/issues/993) is open. Use its framework if it lands before MR3; otherwise use the existing ending, not a new general ceremony framework.
- [#1002](https://github.com/a1flecke/conquestoria/issues/1002) is open. Reuse its actual viewer-safety harness if it lands. Until then add a focused differential helper for Domination, not an unrelated five-panel migration.
- [#1051, #1041 war counts](https://github.com/a1flecke/conquestoria/pull/1051) landed during Phase A. The first refresh rebased this worktree to `eb51b7e38d0f9365997dbadd983aa7dbe5a28e2a`. Inspected both new commits and all changed source/rule hunks: `majorCivWarOpponentIds` now owns major-war counts, including AI vassal-consent load and hot-seat enemy-empires lists. Raw war count remains intentional for ambience. The rebased victory/liveness baseline again passed 2 files / 22 tests plus all hook smoke checks, exit 0. No Domination assumption changes. Use this new read helper for any major-war load in MR4; do not rewrite it. The final refresh then incorporated #995 and [#1039 / PR #1053](https://github.com/a1flecke/conquestoria/pull/1053), rebasing to source tip `8e7bbb512669b716f453849c3cac7798cd0577b4`. Inspected the diplomacy/repair/validator/source-rule changes and the selection/render callback changes. #1039 restores the movement focus timer and completion delivery; preserve those paths. At this final source tip, the focused victory/liveness/bilateral-war baseline passed 3 files / 35 tests and all hook checks, exit 0. No open PR remained at the final check. Refresh before each implementation slice; stop for an actual conflicting active implementation. These adjacent issues are landed work to reuse, not part of #985.
- The fresh victory-issue search found the existing [#986 Science path](https://github.com/a1flecke/conquestoria/issues/986) and [#1026 umbrella](https://github.com/a1flecke/conquestoria/issues/1026), not another current Domination implementation. Neither is included here.

## 3. Alternatives evaluated

The columns below compare complete definitions, not cosmetic progress displays. “Sovereign” here means last independent major, counting accepted vassalage. “Hybrid” is that sovereignty rule with the bounded provisional-secession exception chosen below.

| Criterion | Last living major, no vassals | All original capitals | Share of original capitals | Territory/population share | Defeat or vassalize every major | Chosen hybrid sovereignty |
|---|---|---|---|---|---|---|
| Ages 7–43 / one sentence | Very simple, but killing settlers is opaque | Simple goal once capital explained | Fraction adds teaching burden | Percentages and changing denominator | Simple “defeat or rule” plus vassal explanation | Same simple main rule; secession note on relevant row |
| Strategic depth | Military finish only | Raids and capital defense | Target selection and racing | Expansion/economic/conquest mix | Conquest, peace, protection, independence | Same, plus stabilizing or containing rebellion |
| Tedious cleanup | Highest; every last settler/city | Low if capitals survive | Low | Low, but map painting incentives | Lower through vassalage; revolt cleanup remains | Tiny temporary revolts do not reset finish |
| Map scaling | More rivals = more cleanup | More capitals = longer campaign | Scales, but rounding dominates small maps | Terrain/population imbalance matters | Number of empires, not every map tile | Same; no map-size-specific victory percentage |
| Snowball | Strong army wins faster | Sniping can bypass empire building | Early threshold can amplify starts | Population/land engines snowball | Tribute snowball already has obligations | No new buff; inherited obligations preserved |
| Comeback | Settler recovery, slow return | Recapture a capital | Deny threshold capital | Grow or flip enough population | Independence, protect rivals, defeat overlord | Same; a growing/established secession is a real rival |
| Vassals | Must eventually betray or eliminate | Need arbitrary capital-credit rule | Same ambiguity | Need arbitrary ownership aggregation | Direct relationship has clear meaning | Direct, valid relationships only |
| Breakaways | Every one restarts cleanup | No original-capital inheritance rule | Objective dilution/inheritance complexity | Change share by changing owner | Immediate new obligation | Existing establishment deadline plus strict size/origin guards |
| AI tractability | Chase every last asset | Requires new strategic capital memory | Requires threshold coordination | Needs broad global estimates | Existing capture/peace/vassal/defense actions | Small scoring layer; uncertainty is explicit |
| Viewer-safe progress | Global survivors are hidden | Hidden ownership remains hidden | Exact denominator possible, numerator hidden | Exact world denominator leaks | Own agreements exact, rival information partial | Same, with earned snapshots and uncertainty |
| Existing mechanics | Current ending, but ignores #910 | No reliable original-capital ledger | Same new ledger plus thresholds | New global balance formula | Strong fit with #910 and #1050 | Adds only bounded victory classification |
| Hot-seat feel | Later seats can be cut off if instant | Surprise sniping unless timing fixed | Threshold surprises | Denominator surprises | Consent must warn about losing independently | End-round opportunity and explicit consent copy |
| Nation building / conquest loop | Rewards demolition and pursuit | Rewards a few surgical raids | Can skip much empire development | Can reward passive farming | Rewards conquering, administering and protecting | Same without a last-minute one-city revolt chore |
| Save cost | Minimal | Original capitals cannot be reconstructed honestly | Same | Derived but changes every live campaign's balance | Derived rule | Derived rule; only earned intelligence persists |

Rejected: retain the present rule solely because it is implemented; infer “original capital” from `cities[0]`; invent global population targets; grant progress bonuses; silently add surrender demands; turn temporary breakaways into a permanent exemption. Capital control remains a useful tactic, not the victory definition.

The hybrid adds an exception, so its explanatory cost is real. It is preferable to requiring every tiny late uprising to be extinguished, exempting all future breakaways forever, or adding a second persistent countdown. Adults can inspect exact conditions; the affected player sees a plain warning: “This small secession will count as a rival when it grows or becomes established.”

## 4. Canonical liveness and vassal semantics

`getCivilizationLiveness(state, civId)` is the **only** liveness predicate. A cityless civilization with a viable settler remains alive indefinitely and normally blocks a rival's win. Military-only remnants do not. Stale city/unit rosters cannot decide participation or victory. Transport viability, terminal elimination and recovery remain exactly #1050. A sole surviving independent settler owner can still win; preserve the existing positive test. Victory eligibility and AI/human scheduling can differ on sovereignty, but must never disagree on whether that actor is living.

A Domination vassal edge must have distinct living major endpoints, reciprocal role links and matching active vassalage treaty on both sides, with `civA = vassal`, `civB = overlord`. It must be direct: the overlord is independent, and the vassal is not also an overlord. Duplicated or malformed edges give no victory credit; malformed members count as independent until canonical repair/lifecycle resolves them. This is a conservative read of #910's valid relationship, not permission for #985 to rewrite malformed diplomacy. No traversal can turn a cycle into an automatic win.

- An independent overlord can win when every other participating major is eliminated or its direct valid vassal.
- A vassal is alive, retains its seat and recovery opportunities, but cannot be the winner while the relationship is active. Its cities/capital are not transferred and do not create capital points.
- Voluntary and any existing legally formed vassalage have identical victory effect. #985 adds no new forced-formation path.
- Pending offers give no credit. Acceptance is revalidated and bilateral; an accepted final offer can create an end-round candidate, not an immediate modal.
- Independence, release, failed protection or overlord elimination remove credit immediately. Defeating an overlord frees its vassals; they are not inherited by the conqueror.
- Existing era, peak-loss, contact, peace, consent, tribute, protection, treachery and military independence thresholds remain unchanged. Deliberately deleting one's own army to qualify is an inherited #910 balance risk; no secret anti-collusion rule is added.
- Formation/petition controls must say “A vassal cannot win independently. If every other empire is defeated or a vassal, the overlord wins when the round finishes.” Show the generic consequence without leaking whether a hidden empire currently blocks victory.

## 5. Breakaway semantics

A living non-vassal breakaway is **provisional for Domination only** exactly while all of these are true:

1. Its `breakaway.status` is `secession` and `state.turn < establishesOnTurn`.
2. It owns exactly one actual city. A second city immediately removes the exemption; zero cities plus a viable settler also removes it.
3. Its origin exists, is living and independent, has an actual owned city, and is an established empire: no breakaway metadata, or already established by status/deadline.

Use actual `city.owner`, not either civilization's roster. The deadline already exists; do not restart it, persist another timer, or change the existing 50-turn establishment mechanic. At the exact deadline it counts even if the stored status has not yet been ticked. A directly accepted vassal is classified as a vassal before considering this exception.

A provisional secession neither blocks nor wins Domination. It still owns land, fights, receives AI turns, can deprive its parent of resources and can grow. Loss of the origin's city/liveness/independence makes it count immediately. A newly established, growing, cityless-but-living, or orphaned breakaway is a normal rival and potential winner. An established breakaway's own small secession can use the same rule. A provisional secession cannot shelter a chain of new exempt secessions because its origin is not established.

This prevents the important cheese cases: losing the last city to a revolt cannot leave a settler “ruling” a grace-exempt empire; vassalizing the origin does not silently vassalize an independent offshoot; a multi-city splinter cannot hide for 50 turns. A fresh one-city revolt in an otherwise secure empire can be left temporarily without moving the finish line. Repeated small rebellions cannot indefinitely reset the victory timer because there is no new victory timer. Meaningful rebellions can still prevent a win; no design can both honor their independence and guarantee a win regardless of rebellion.

There is no original-capital inheritance. `tryReabsorbBreakaway` and ordinary reconquest retain their existing legality/costs. A breakaway without any survival asset is eliminated by #1050 and cannot become a phantom blocker.

**Competitive-campaign guard:** require at least two founding major records (`isMajorCivOwner(id)` and no `breakaway` metadata) before Domination can end a game. Founding records survive elimination; only breakaway reabsorption deletes a civilization in the inspected paths. This keeps a one-civilization sandbox from winning merely because it spawned an exempt revolt. It deliberately narrows the old “any two records” guard. Established breakaways can still win a competitive campaign. New future creation paths must preserve or revise this documented founding-record contract rather than guessing original capitals.

## 6. Minor civilizations and compacts

`minorCivs`, regional compacts, defensive minor leagues, barbarians, pirates, beasts, rebels and crisis owners contribute no victory obligations or credit. Major classification comes from `isMajorCivOwner`. A minor city captured by a major becomes an ordinary owned city: it can give a cityless civilization a survival asset, and can make a provisional breakaway reach two cities, but it never adds a new major rival. Minor coalitions can attack, deny supplies and provoke protection duties through existing mechanics. AI counterplay can respond to that pressure; no minor votes or compact membership are counted as sovereign major control.

## 7. Authoritative APIs and contracts

Create `src/systems/domination-types.ts` for data contracts and `src/systems/domination-rules.ts` for the pure classification/counting kernel. Create `src/systems/domination-sovereignty.ts` for canonical actor classification, shared by the authoritative adapter and tightly scoped own-status/report acquisition callers. Extend the existing `victory-system.ts` as the authoritative victory adapter. Do not create a broad victory framework.

```ts
type DominationDisposition = 'eliminated' | 'independent' | 'vassal' | 'provisional';
interface DominationActorFact {
  civId: string;
  disposition: DominationDisposition;
  overlordId: string | null;
}
interface DominationProgress {
  contenderId: string;
  eligible: boolean;
  ineligibleReason: 'not-living-major' | 'vassal' | 'provisional' | 'noncompetitive' | null;
  rivalCount: number;
  securedRivalCount: number;
  eliminatedRivalIds: string[];
  directVassalIds: string[];
  unresolvedRivalIds: string[];
  independentRivalIds: string[];
  provisionalCivIds: string[];
  conditionMet: boolean;
}
// Proposed exports, defined here; not claims that they already exist.
classifyDominationRival(fact: DominationActorFact, contenderId: string):
  'exempt' | 'secured' | 'unresolved';
getDominationActorFact(state: GameState, civId: string): DominationActorFact | null;
buildDominationActorFacts(state: GameState): DominationActorFact[];
evaluateDominationFacts(facts: readonly DominationActorFact[], contenderId: string,
  competitive: boolean): DominationProgress;
getDominationProgress(state: GameState, civId: string): DominationProgress;
checkDominationVictory(state: GameState): string | null; // existing public name retained
```

`rivalCount` counts other non-provisional majors, including eliminated records. A secured rival is eliminated or the contender's valid direct vassal. A rival's vassals remain unresolved obligations while their overlord exists; defeating that overlord frees them. `conditionMet` is true only for an eligible contender with no unresolved rivals. All returned IDs are sorted by stable code-point ID ordering; never select a winner by insertion order. At most one eligible contender can satisfy the condition in valid state. If corrupt input produces multiple candidates, return no winner and surface a diagnostic in tests rather than selecting one arbitrarily.

`domination-sovereignty.ts` owns one classification implementation for both single-actor and batch queries. Missing/non-major IDs return null in the single-actor query. Batch construction sorts major IDs and memoizes canonical liveness and actual owned-city counts; it does not implement another liveness predicate. Call liveness once per major per authoritative world-fact construction. The authoritative world query may read full state. UI and AI planning must not receive this object. AI and display share the rule kernel, but consume bounded facts through §8, including unknowns. No UI percentages, raw civ roster formulas, or alternative AI victory condition.

## 8. Observer knowledge, progress and earned reports

An exact worldwide remaining-rival count is incompatible with hidden rivals and hidden defeats. The contract therefore distinguishes **exact own earned progress** from **reported known-world progress**. It does not publish an exact global denominator for the player. This is a deliberate resolution of the brief's privacy/progress tension, not an omniscient number with names hidden.

`src/systems/domination-knowledge.ts` is an observer-neutral simulation module shared by humans and AI. `src/systems/domination-presentation.ts` formats its DTO for a human; it cannot import `victory-system.ts`. The AI cannot import the formatting module.

### Knowledge sources

1. Own liveness, legal sovereignty status, owned assets and own bilateral agreements: exact current information. The single-actor classifier may be called for the observer only here. Own legal status is explicitly entitled even when a qualifying origin change ends a secession exemption; show the resulting own status without revealing hidden origin assets or reasons. The full-world fact query remains forbidden. This narrow own-status entitlement is not permission to query foreign statuses. Own direct role links give the player the status of those agreements; do not use a hidden foreign city count to annotate them. In an unreconciled malformed state, show “Agreement needs confirmation” instead of inventing valid credit.
2. Existing observer contact through `shouldListMajorCivForViewer` / AI contact, trusted last-seen city/unit observations, and current visibility/concealment. Seeing a city proves existence at that observation, not absence of other cities/settlers, independence or an exact global city count. Rumors never provide a target coordinate.
3. Earned defeat facts, captured at the lifecycle mutation (§9). They survive loss of line of sight; they are not recomputed from global `isEliminated`.
4. Existing successful `gather_intel`: record a dated political snapshot of the target's own earned defeat facts and direct vassal relationships, filtered to identities already known by the observer at acquisition. Do not query the target's omniscient progress; do not copy its entire intelligence network recursively. This is one small extension to an existing informational mission, not a new mission or global standings announcement.
5. The existing treaty snapshot in `intelReports` can corroborate the target's role at that report turn. `monitor_diplomacy` does not currently report a vassal roster and is not treated as one. A successful current mission at a target city confirms the target was living when observed.

No new contact is created. If a report contains a vassal or defeated party the observer has not met, omit the entry entirely, including its count, color, placeholder row and location. Later contact does not expand an old filtered report. Reports never grant city/capital coordinates. Locators come only from existing visible/trusted observations and retain their own observation time.

```ts
interface DominationDefeatFact {
  civId: string;
  civName: string; // name already earned at observation; survives removed breakaway records
  observedTurn: number;
  defeatedById: string | null; // null unless this identity was also earned
  source: 'participant' | 'witness';
}
interface DominationPoliticalReport {
  contenderId: string;
  observedTurn: number;
  contenderRole: 'independent' | 'vassal' | 'provisional' | 'unknown';
  directVassalIds: string[];
  defeatedCivIds: string[];
}
interface DominationObserverIntel {
  defeatsByCivId: Record<string, DominationDefeatFact>;
  reportsByContenderId: Record<string, DominationPoliticalReport>;
}
type DominationIntelState = Record<string, DominationObserverIntel>;
interface DominationKnownActorFact {
  civId: string;
  civName: string; // entitled name, never an unmet identity
  disposition: DominationDisposition | 'unknown';
  overlordId: string | null;
  observedTurn: number | null;
  evidence: 'own' | 'defeat' | 'observation' | 'report' | 'unconfirmed';
}
interface DominationKnowledge {
  observerId: string;
  turn: number;
  ownRole: 'independent' | 'vassal' | 'provisional' | 'eliminated';
  ownOverlordId: string | null;
  knownActorFacts: DominationKnownActorFact[];
  ownDirectVassalIds: string[];
  ownEarnedDefeatIds: string[];
  knownCivIds: string[];
  reports: DominationPoliticalReport[];
  unconfirmedKnownCivIds: string[];
}
buildDominationKnowledge(state: GameState, observerId: string): DominationKnowledge;
projectDominationProgressForViewer(state: GameState, viewerId: string): DominationPanelModel;
```

`knownActorFacts` includes the observer and every entitled rival identity, sorted and deduplicated. Foreign disposition is derived only from earned facts or dated reports, never a fresh foreign sovereignty query. A living observation alone leaves political disposition unknown, while superseding an older defeat. Current own facts override reports; otherwise use the newest entitled observation, treating contradictory same-turn foreign evidence as unknown. Old reports remain displayable, but their nonterminal roles are unknown for urgency after age5. A recent report may establish a provisional role only at its observation date. `classifyDominationRival` is reused for known dispositions; unknown facts are unresolved, never coerced to independent. This preserves one rule definition without feeding partial knowledge to authoritative winner evaluation.

`DominationPanelModel` contains the one-sentence rule, owner status/help, exact own direct-vassal and earned-defeat counts, known-rival rows with `current | reported | unknown` evidence labels and report turn, an uncertainty sentence, a warning card and advisory links. It contains no global totals, authoritative candidate flag, unmet ID, hidden location, or raw GameState object. Do not call a report an exact live lower bound: independence can invalidate it after acquisition. “Reported on turn N” is literal.

Own direct relationships refresh immediately. Political reports are recent for **five world turns**, inclusive ages 0–5; at age 6 they remain visible as old reports but cannot trigger near-victory warnings or AI urgency. Future-dated reports are invalid. Earned terminal defeats do not age out; a reused breakaway ID with a newer earned living observation supersedes the earlier defeat for inference, without silently reading hidden global resurrection. Deduplicate all displayed obligations by civ ID, and own-current evidence overrides an older report. Unknown status stays unknown, not independent or defeated.

Default display example:

> To win, be the last independent empire.\
> Under your rule: 2 vassals. Defeats you have confirmed: 1.\
> Reports: Rome has reportedly secured 2 of the 3 other empires you know (report from turn 84).\
> Other empires or changes may be unknown. These reports do not prove a worldwide total.

An owner with no contacts sees its own status, “No rival reports yet,” and exploration guidance. It does not see a zero-rival victory promise, opponent count, unknown-rival count, or list of hidden civ slots.

## 9. Observation mutation and persistence ownership

Add `src/systems/domination-intel.ts`, a source-owned immutable recorder. The ledger records information that cannot be recomputed safely after an event. It is not a progress cache.

For elimination, record at `eliminateCivilization` / its reconciliation path while before/after entities and attribution exist. The eliminated owner and a known attributed conqueror are participants. A third party is a witness only when it already knows the victim and currently observes a decisive lost survival asset at the action boundary: an owned city transfer/removal, or the last viable settler/transport's visible, unconcealed destruction. The source result confirms the elimination outcome; do not infer defeat from an empty visible area. A late boundary reconciliation with no before/after decisive evidence records participants only. AI observers use the same entitlement predicate as humans; do not call the human-only viewer list to determine AI rights. There is no observer-side liveness query over foreign actors.

The elimination function currently receives post-asset-loss state in several callers. Extend the reconciliation/recording seam to receive the original pre-mutation state explicitly; do not fabricate evidence from that post-loss input. `resolveMajorCityCapture` and all existing reconciliation callers must thread it. Preserve return transitions, order and immutability. Direct calls without historical context remain valid but cannot award witness evidence. An event listener must never write this ledger.

For successful `gather_intel`, in the existing result application block, build the filtered political snapshot from the target's exact own role/direct relationships and target-held participant/witness defeat records, write it to the observer ledger, then emit the existing `espionage:intel-report-acquired` event. Do not copy prior foreign reports from the target. The same mission path serves human and AI. Missing contact or stale target failure produces no snapshot. The ledger source and the mission are tested through actual mutation callers.

When a new observed living entity reuses a breakaway ID, knowledge assembly suppresses older terminal inference using the newer trusted observation. An ID's hidden re-creation alone does not alter another viewer's output. No broad breakaway-ID redesign is included.

## 10. Warning derivation and counterplay information

Create `deriveDominationThreats(knowledge): DominationThreat[]` in the shared knowledge module or a small `domination-threat.ts` leaf. It is used by AI and human presentation. It never receives omniscient progress.

A reported contender is a near-win threat only when all are true:

- It is a known rival, was reported independent, and the political report is age 0–5.
- After observer-known filtering and deduplication, at least **two** distinct rivals are reported secured by that contender (direct vassal or earned eliminated), excluding contender and observer self-credit.
- Among **all currently observer-known rival identities**, including the observer and excluding the contender, at most **one** is unresolved and secured count is at least two-thirds of that known set. An entitled provisional fact may exclude an obligation according to the shared rule classifier; entitled elimination counts as secured rather than disappearing from the denominator; an unknown foreign status cannot. The observer counts as unresolved unless its own current status proves it is the contender's vassal or eliminated.
- Every secured role used has an entitled source. Missing status counts as unresolved, so a report of two vassals cannot claim near-victory while eight other known empires are unconfirmed. Newly met empires add unresolved obligations; they do not expand an older report's disclosed facts. Unmet identities are never counted. A report is never proof of the worldwide condition.

For a two-empire game with no prior conquests there is no permanent warning from turn 1. A separate **survival warning** may say a known enemy threatens the viewer's last survival assets, using existing observed military threat/own assets. It must not assert that enemy is globally one step from Domination. This avoids turning ordinary early borders into constant victory alerts.

Exact copy: “Reports suggest Rome may be nearing Domination. Protect your independence and check the Victory panel. Other empires or changes may be unknown.” The panel supplies the dated evidence and current legal guidance. This conservative warning can miss a hidden near-win; that is a necessary information constraint, not a reason for an omniscient fallback.

Integrate with `deriveStrategicWarningTransitions` for human recipients, including human contenders in hot seat. Recompute the panel card from current knowledge so it clears on independent recovery, newer contradictory reports or staleness. Use existing `lastWarningTurnByKey` for a stable `viewer:actor:domination` key, edge-triggered false→true and a five-turn minimum re-alert interval. No repeated warning merely because the panel reopened. No sound when evidence expires/weakens; new warning audio shares the existing one-per-viewer-turn acknowledgement path. Existing `ai:strategic-warning` adds `domination` and `domination-eased` kinds with its current fields; no new persisted event payload shape is needed. Clearing copy says “Reports no longer confirm the earlier Domination threat,” not “Rome is now safe.”

Guidance order: resolve own live independence/protection decision; defend an actually threatened owned city; inspect existing diplomatic options; scout/update reports. Buttons navigate to existing working panels. The Victory panel never declares war, grants independence, accepts vassalage, or silently queues production. Do not advertise “Offer vassalage to Rome” as a way to stop Rome winning.

## 11. Exact victory timing and blockers

Keep a single simulation finalization boundary in `processTurn`. Do not put victory mutations in capture, diplomacy, renderer, UI or AI tactics.

1. Human actions finish atomically. Pending occupy/raze choices block `endTurn`, including direct/programmatic invocation. No speculative capture credit is granted.
2. All remaining living human seats take their turn. A living vassal or cityless settler human is not skipped.
3. `runCompletedRound` runs improvements, the complete rotated AI round, and world processing. Do not stop the AI list when an intermediate candidate appears.
4. At the end of world processing, reconcile liveness once more after every later city/unit-loss path, then finalize opponent-round bookkeeping. Advance `turn` from N to N+1 as today.
5. Compute the authoritative candidate. A live, legally actionable pending **independence** request between that candidate and one of its credited vassals defers finalization. Revalidate using existing request lifetime and petition legality; malformed, expired, already resolved, or unrelated requests are not vetoes. Pending peace/treaty proposals do not by themselves change sovereignty and do not grant or remove credit.
6. If unblocked, set the existing `gameOver`, `winner`, and `gameOverReason = 'domination'` atomically. Emit one `victory:resolved` event on false→true. Then emit `turn:start`, whose listeners now observe the final outcome. Existing completed outcomes are terminal and are never recomputed on load.

An independence request issued during the round gets a response opportunity before finalization; declining/granting or expiration uses existing semantics. Re-proposal cannot bypass existing duplicate/legality/TTL rules. A live valid petition can delay victory because it concerns actual sovereignty; repeated unrelated peace offers cannot stall it. If the petition resolves mid-human-turn, finalization still waits for the next completed round.

| Situation | Required result |
|---|---|
| Human 1 captures a last city before Human 2 acts | Progress changes; no final victory yet; Human 2 can counterplay if living |
| Captured rival has viable settler | Rival remains living and blocks unless legitimately subordinated/exempt under exact rules |
| Occupy/raze panel pending | Neither normal nor programmatic End Turn enters simulation |
| Pending peace / ordinary treaty inbox row | No signed credit; no global veto; open actionable UI finishes before starting a round |
| Pending valid independence of candidate's vassal | Candidate shown as awaiting sovereignty decision; no final outcome |
| AI becomes candidate early in AI phase | Later AI and world effects can remove candidacy; only final state wins |
| Tiny secession reaches deadline at N+1 | It counts in the N+1 check, even if status string still says secession |
| Handoff overlay active | Finish buffered simulation/persistence; remove handoff blocker before final overlay |
| All humans eliminated, AI has Domination | Preserve Domination outcome first |
| All humans eliminated, multiple sovereign AI remain | Existing all-humans-eliminated outcome; do not invent an AI winner |
| AI-only fixture | Never synthesize human defeat |
| Save before final action / before completed round | Reload and same commands produce same progress, final turn and winner |

An active UI choice is not a persisted simulation flag. Preserve existing save behavior for SelectionStore; the supported continuity case is the save immediately before the assault/final action. Do not claim a pending capture choice itself round-trips unless its existing save path actually supports it. The plan tests that save/round entry cannot commit a half-capture.

## 12. UI, UX and hot-seat privacy

Add a visible text-labelled **Victory** launcher to the existing game shell, one `victory-progress` panel registration in `app/bootstrap.ts` / `panel-registry.ts`, and `openVictoryProgress` in `panel-actions-controller.ts`. The view module receives only `DominationPanelModel`. Use existing panel geometry, scrolling, close button, safe text and 44px targets. No new framework, image generation, or generic modal architecture is required.

Panel order: one-sentence rule; your independence/recovery state; exact own earned counts; known-rival report rows; dated evidence and uncertainty; a maximum of three useful navigation recommendations. All known rows remain reachable through scrolling; unknown actors are absent. Do not represent unknown worldwide status with a percentage bar. Re-render after session changes while open, successful mission reports, capture/role changes and turn advancement. A repeated click must resolve against the current viewer/session, not a captured old GameState.

The vassalage controls retain every existing action, with the generic victory consequence in §4. A vassal sees independence options only when canonically available, otherwise the existing threshold explanation. Cityless humans see “You are still in play. Found a city to rebuild,” without a timer or loss claim. Provisional-origin owners see their own deadline and growth conditions; third parties do not receive hidden birth dates/city counts from live metadata.

At handoff, close/remove the progress panel synchronously before the opaque veil, alongside existing diplomacy/network/Hall of Fame closures. Discard its callbacks and subscriptions. No outgoing-viewer warning, sound, target, report name, color, tooltip, ARIA label or selected card may survive into the next seat. The incoming seat rebuilds from its explicit observer ID after acknowledgement. Do not change `currentPlayer` to inspect another seat's progress.

For the final solo screen, a known winner may be named; an unmet winner is “A rival empire.” Explain victory with the rule and own result; explain defeat from the viewer's own relationship/liveness (“Your empire is a vassal” or “Your civilization was defeated”) where known. Do not expose remaining rival identities or maps. Existing completed saves retain their stored outcome; they are not converted into a new win/loss.

For hot seat, show an opaque **shared campaign result** rather than deriving a private defeat modal from whichever `currentPlayer` happened to remain after simulation. Public configured player names may identify a human winner and list each configured human as winner/not winner, including eliminated seats and seats that never reached another turn. If AI won, say “A rival empire won by Domination.” Show the common rule and no private vassal, city, intelligence or army explanation on this shared screen. This yields clear win/loss without a cross-seat intelligence reveal or a new turn-rotation system. `all-humans-eliminated` keeps its distinct explanation.

## 13. AI pursuit and counterplay

The actual strategic owner is `ai-prepared-turn.ts`, not the older `ai-strategy.ts`. Add `src/ai/ai-domination.ts` as a bounded doctrine/scoring helper. Its inputs are shared `DominationKnowledge`, `MajorCivPerception`, own personality, own era/challenge, existing legal-action results, strengths and objective candidates. It cannot import `victory-system.ts` or enumerate foreign entities for progress. Trace reasons are observability, not a source of extra player information.

Pursuit activates for an independent, non-provisional, city-owning actor with the `aggressive` personality trait, at least one known non-subordinate rival and a feasible capture target. Recovery of a cityless actor always takes precedence. Other personalities retain their normal conquest actions and all can counter a known threat; Domination need not become every AI's sole purpose.

Use existing known-city capture candidates and allow preparation against a contacted peaceful rival only after ordinary declaration legality, known-map reachability, adequate required roles, and perceived expected-loss ratio ≤1.0 pass. Score qualifying candidates with a bounded strategic-value addition: Explorer +8, Standard +14, Veteran +20, capped at the existing 100. No new distant-eligibility reason, no hidden “last city” test, no waiver of supply/transport, treaties, recovery or defense. Candidates already at war may receive the same bounded preference. Keep portfolio commitment/hysteresis, expiry and withdrawal; “Domination” is not permission to tunnel suicidally.

Target preference uses earned evidence: a reported independent rival relevant to finishing the campaign, then known reachable cities, existing distance/loss score and stable target ID. A visible settler can be a legal objective when an existing tactical objective supports it; never search unseen tiles for the last settler. Improve conquest by seeking peace and accepting legal vassalage where offered, not by inventing a demand API. Conquered overlord vassals are not inherited targets/credit.

Counterplay consumes exactly the same threat inference as the human panel, even for a human contender. Priority: defend actually threatened own survival assets; maintain appropriate existing force demands; seek legal peace with one known third party to free forces; seek an existing legal alliance with a known non-threat partner if available. Rank candidates deterministically, at most one new Domination diplomatic proposal per actor per round. Do not fabricate an alliance/league invitation before its technology or consent rules, and do not auto-declare a worldwide dogpile from a partial report. A targeted war still requires the ordinary prepared-plan/readiness/legal path; the warning alone is not sufficient. A vassal can only use existing independence/protection actions, not independent foreign war.

Difficulty changes preference and existing planning quality, not thresholds for truth, liveness, report age, information entitlement, treaty rules or victory. Use game-wide `resolveOpponentChallenge` for AI behavior, not a target human's personal pressure difficulty. Preserve the current per-city defense/production and research/upgrade catalogs. Domination demand feeds their existing role-demand pipeline rather than directly replacing production queues.

Prove pursuit and response with `AIDecisionTrace` reason codes (`domination-pursuit`, `domination-counterplay`, plus explicit rejection codes) in transient traces. Do not persist new `AIPlanReason` variants merely for logging; existing plan reasons continue to express actual war/retaliation/defense legality. Refresh shared knowledge at execution boundaries before a strategic diplomatic proposal; a stale prepared report cannot force a now-illegal action.

MR4's #995 merge prerequisite is satisfied at the final baseline. Reread its actual export/event ownership: `declareMajorWar` owns the bilateral mutation and vassal consequences; the normal initial war notification is still caller-owned at this baseline. `makeMajorPeace` has no bus parameter; the legal proposal/accept flows own peace notification and request cleanup. Use those consent flows for counterplay, not an unapproved direct peace. Remove duplicate events only if later canonical APIs assume their ownership. No handwritten `atWarWith` mutation, paired unilateral fallback or speculative replacement for the final API is allowed.

## 14. Save, migration and backward compatibility

MR1: **no save migration**. Progress, sovereignty classification and provisional status are deterministic queries over existing state. Preserve existing finished outcomes and the settler-survivor win. Live saves adopt the new rule at the next completed round, never during load. Explain the current rule in-game.

MR2: persist `GameState.dominationIntel` only for earned defeat facts and political report snapshots. It cannot be reconstructed from current omniscient state without either leaking facts or losing history. Add the next ordered schema step: **29 at this baseline**, reallocate mechanically after drift if another migration lands. Initialize new solo/hot-seat/AI-only states with `{}`. Migrate older saves to an empty ledger; never retroactively award defeats, scan global eliminated flags, parse notification prose, or backfill reports. Initial UI honestly says historical reports are unavailable.

An explicit corruption repair validates record shapes, finite nonnegative turns no later than current turn, allowed discriminants, IDs, duplicate entries and array types. It does not synchronize reports with current hidden ownership/liveness. Preserve historical names/IDs for removed breakaways; reject unknown observer IDs. Current-version missing/malformed ledger is repairable external corruption because current writers initialize it. Keep migration/repair admission reasons separate; add the repair deliberately to the unconditional pipeline. No new compatibility normalizer is needed to conceal the migration.

Update #1006's historical-field strip, schema cases, malformed cases, persisted shape snapshot and intentional per-key migration golden change, plus generated `docs/save-compatibility.md`. Test IndexedDB, localStorage fallback and file export/import through existing APIs. Retain future-version rejection. MR3 adds warning kinds using the existing generic event fields and string-key ledgers; MR4's doctrine/trace is derived/transient: neither needs another shape change under this contract. If an implementation adds a persisted field or changes the event's serialized shape, it must add the correct migration in that same slice rather than claiming this no-migration decision covers it.

## 15. Determinism, performance and structural guards

All classification, report filtering, warning keys, candidate ranking and tie-breaking are deterministic from state/earned observations. No wall clock, random threshold, UI frame number, observer iteration order, or locale-dependent political ordering. Use `assertSimulationEquivalent`; do not add exclusions for Domination, AI portfolios or notifications. Same seed and commands, reload before a near-win, reload before the winning round, same-viewer warning, and AI trace must match. Simulation clocks may be used to measure test performance but never affect the result.

Authority builds a world fact array once: O(M × (C+U)) for the existing liveness query, plus O(C+M+T) classification and sorting, where M is major records and T is relevant treaty entries. Reuse the result across contenders in one check. Do not implement an alternative indexed liveness rule to optimize it. Knowledge processes only the observer's own data, entitled reports and already-known/observed facts; at most one report per observer/contender and one defeat fact per observed identity. No unbounded event-history scan, map-wide scan every render frame, or pathfinding in progress. AI retains its existing candidate/path budget and logs costs in the long-horizon run.

Add precise source checks: (1) victory adapters cannot use raw roster lengths for liveness or inspect settler health/transport viability themselves; (2) UI and AI planning cannot import the authoritative victory query; (3) AI cannot import Domination display projection; (4) raw final winner formula lives only in the rule kernel/authoritative adapter; (5) AI mutations use final #995 public APIs. Test each guard with one introduced forbidden snippet and one legitimate exception. Extend the canonical CLI source check and its hook coverage as appropriate; do not maintain mismatched rules in two files.

## 16. SFX, ending hook and chronicle

#993 is not implemented at this audit; the wonder coordinator is not a general campaign journal or victory orchestrator. The final modal is the important visual event. It uses text and an opaque accessible layout, with no required animation, camera movement or new assets. Warning sound uses the existing strategic-warning acknowledgement/mute/suppression path. No repeat sound on report expiry, handoff, reopening or loading a completed save. Do not call an uninspected or nonexistent `SFX.victory` API.

Emit `victory:resolved` once at simulation finalization with `{ winnerId, reason: 'domination', turn }`. Presentation builds its own safe outcome DTO; the raw event is not UI-ready. Route any final log notification through existing explicit-recipient delivery. The persisted `gameOver/winner/gameOverReason/turn` is the durable campaign outcome even when a headless run has no presentation listeners. Notification history is supplementary and is never used for victory or intelligence truth. If #993 lands, adapt this event to its coordinator and preserve the same timing, recipients and no-replay rules.

The current “campaign chronicle” records General career events. A civilization winning is not automatically a General achievement; do not add a fake career fact to make the checklist green. The typed final event is the clean seam for a later general campaign chronicle. Existing capture career records remain intact. This is the bounded integration consistent with the actual architecture.

## 17. Test matrix and failure modes

| Area | Positive evidence | Required negative / regression evidence |
|---|---|---|
| Rule | Sole independent major; all other majors valid direct vassals/eliminated | Independent rival, one-sided/duplicate/cyclic/nested vassal edge, pending offer, noncompetitive sandbox |
| Liveness | Viable settler blocks; sole independent settler wins | Military-only remainder, ghost city/unit roster, terminal actor, invalid cargo; no duplicate viability predicate |
| Vassals | Final accepted agreement, participant consequence text | Voluntary same as accepted existing path, independence/release/protection reverses credit, defeated overlord releases subjects |
| Secession | One-city timely secession with qualifying origin exempt | Every conjunction individually false; exact deadline; second city; zero-city viable settler; origin city loss/elimination/vassalage; nested provisional origin |
| Minor owners | Ordinary minor war unaffected | Every owner-kind excluded; captured minor city changes real ownership/size only |
| Timing | N→N+1 final round, final outcome visible to start event | Pending capture; late human comeback; later AI reversal; world revolt/protection change; valid independence deferral; unrelated peace spam no veto |
| Own progress | Exact earned defeats and current own agreements | No global denominator; stale roster cannot influence own liveness; no-contact view empty of rival facts |
| Reports | Successful real spy mission, filtered known targets, stable date | Failed mission; missing target; unmet third party added to target ledger; later contact cannot expand older report; old/future report |
| Defeat observations | Participant and known visible decisive-event witness, AI parity | Unseen victim; mere empty visible area; concealed last settler; no pre-mutation evidence; final-state global scan |
| Differential privacy | Two viewers with deliberately different contact/visibility/reports | Change hidden cities, owner, settler, treaty, unit, name/color and global candidate while entitled input fixed → identical projection, warning and AI decision |
| Reused breakaway ID | Newer observed life supersedes old defeat inference | Hidden recreation alone cannot reveal it; no phantom new contact |
| Warnings | Two secured of three known rivals, one unresolved, recent report; human contender | One secured insufficient; two unresolved insufficient; vassal contender; unknown actor; age6; same-round/reopen spam; cooldown |
| UI interaction | Launcher→panel→Diplomacy/defense/scouting guidance; live update | Stale detached click, hidden IDs in attributes/tooltips, inaccessible rows, false action promise, 320px overflow |
| Hot seat | Different per-seat reports; vassal/settler seat remains; shared final result | No outgoing panel/audio under veil; eliminated humans included only in final public standings; unset/current wrong viewer; pending handoff save retry |
| Save | Before final capture/offer/round → export/import → same continuation | Legacy0/24/27/28/current; malformed ledger; no historical backfill; no load victory/event/sound; future version rejection |
| AI | Aggressive actor prefers legal Domination objective and reaches victory | No hidden last-city hunt, legal peaceful targeting only, missing force/transport, suicidal ratio, cityless recovery precedence |
| AI counterplay | Known threat changes defense and one legal peace/alliance proposal | Unknown threat, stale report, automatic distant dogpile, human-seat pressure difficulty affecting AI truth, direct war-array writes |
| Determinism | Full-state equivalence and trace equality after replay/reload | No extra comparator carve-outs, no warning RNG or wall clock |
| Architecture / SFX | Tested illegal-import guards; mute/reduced-motion/suppression | Guard false positives; fake General chronicle; sound on load/handoff; double final event |
| Integration | Solo, hot seat, three challenge modes, short and long AI fixtures | Existing liveness, diplomacy, capture, world pressure, warning, save and web/Tauri regressions |

Primary design failure modes are: missing progress under privacy restrictions, stale reports phrased as current truth, victory while a sovereignty decision is pending, grace-exempt powerful/orphaned secessions, automatic vassal inheritance, an AI war decision that never reaches a legal prepared plan, human-only knowledge recording, and a correct helper with an unwired launcher. Every one has a named task and negative test in the plan. Human playtesting still needs to assess pacing, report freshness and whether five-turn intelligence creates useful choices; tests cannot establish fun.

## 18. Four independently safe MRs and handoffs

| MR | Scope | Why it is safe alone | Save / dependency |
|---|---|---|---|
| MR1 | Authoritative rule/progress, secession/vassal semantics, round timing, blockers, minimal rule/outcome and vassal-consent copy | Complete rule and ending; no dead progress launcher, no speculative UI | No migration; #1050 required and landed |
| MR2 | Earned observer intel, spy snapshot, projection and fully wired read-only progress panel | Reports already useful without alerts; every navigation link works; complete save path | Next schema (29 at audit); reread #1002 |
| MR3 | Warning transitions, safe shared/solo ending, final event/SFX/chronicle seam | Adds complete alerts and final presentation to MR2 data | No additional shape change under contract; reread #993 |
| MR4 | AI pursuit, counterplay, legality integration and long-horizon proof | Full #985 acceptance after final audit | Hard dependency: #995 merged, final APIs reread |

MR1 must include safe generic ending redaction immediately if its outcome wiring touches the current global-name path; MR3 adds the richer shared result and report-aware explanation. MR1 never introduces a known privacy defect to “fix in MR3.” MR2 must not expose a warnings button that does nothing until MR3. MR3 has no AI-pursuit promise before MR4. The four-way split keeps saved knowledge and UI demonstrably useful before the larger AI slice and preserves a separate dependency check for the diplomacy-heavy slice; #995 has now landed.

Every MR: Terra High implements and verifies → stop for Sol High actual diff/test review and fixes → stop for Luna Medium MR/CI → independent merge gate → refresh/rebase and inspect landed overlaps before the next Terra slice. Intermediate descriptions `Refs #985`; only final acceptance warrants `Closes #985`. No implementation or MR creation in Phase A.

## 19. Inline design review and incorporated fixes

Review performed inline against this design: “perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.”

| Dimension | Concrete risk / severity | Correction incorporated and resolution |
|---|---|---|
| Balancing gameplay | High: treating all secessions as exempt enables a large/orphaned splinter to disappear from victory | §5 conjunction requires exactly one city, qualifying independent city-owning established origin and existing deadline; growth/orphaning/vassalage removes exemption |
| Fun | High: an unrestricted “every living actor” finish can become one-city revolt cleanup | Bounded provisional exception, existing vassal/reabsorption alternatives, no repeated timer reset |
| New mechanics | High: conquer-or-vassalize wording suggests a nonexistent surrender demand | Explicit consent-only existing #910 path, no new demand or balance threshold |
| Ages 7–43 | Medium: “sovereignty” and fractional reports obscure the goal | One-sentence independent-empire rule, inline vassal explanation, dated counts, no percentage bar |
| Play styles | High: vassal acceptance can unknowingly hand over an independent victory chance | Generic consequence on both formation sides; independent recovery/defense remains possible before end-round |
| Difficulty | High: using per-human pressure difficulty would make truth/AI vary by target | Same rule/age/evidence on all modes; only global AI preference +8/+14/+20 and existing competence |
| Computer players | High: a scoring bonus alone cannot prepare a peaceful target for the existing war guard | MR4 explicitly connects legal known peaceful candidates, force readiness, prepared plan and final #995 execution |
| UI | High: imported authoritative progress would leak unnamed hidden counts | Observer DTO excludes total/global candidate; direct UI import guard and differential tests |
| UX | High: dated spy information phrased as live “confirmed remaining” lies after independence | “Reported on turn N,” five-turn urgency expiry, unconfirmed status separate, newer own facts override |
| Architecture | High: recording defeat in a bus listener misses headless/AI and save paths | Recorder at canonical immutable mutation, pre-mutation evidence threaded through actual callers |
| Extensibility | Medium: create an oversized victory/moment/chronicle framework | Small Domination kernel/adapters and typed final event; reuse #993 only if actually landed |
| Data | High: own exact global progress and hidden-event invariance are incompatible | Exact own earned counts, reported known-world coverage, no unentitled global denominator (§8) |
| SFX | Medium: handoff/load or expired reports replay a warning sound | Existing recipient acknowledgement, one cue per turn, no sound on clear/reopen/load |
| Updating saves | High: infer past political knowledge from current world state | Empty ordered migration; earned snapshots only; shape repair cannot synchronize hidden truth |
| Proper testing | High: rule truth tables alone miss half-capture and stale callbacks | Named real action/round/DOM/save/spy/source-rule tests and complete-state replay |
| Solo regressions | High: unintentional city-owning winner requirement breaks #1050's settler winner | Preserve sole independent viable-settler victory; grace origin-city condition is separate |
| Hot-seat regressions | High: final modal derived from leftover currentPlayer leaks/labels the wrong seat | Shared opaque public result, private detail omitted; each configured human represented; progress cleared before veil |
| Proper implementation | High: partial MR could ship an unwired launcher or knowingly unsafe final name | MR1 safe minimal ending; MR2 complete live panel; each slice names its complete surfaces and stop gate |

Additional consistency fixes: replace the stale early advisor hint in MR1; provide one sovereignty classifier with explicit own-status entitlement, including the hidden-origin boundary test; add source/date-tagged known actor facts and own overlord identity to the shared contract; exclude only entitled provisional actors before calculating the warning denominator; validate pending independence rather than letting any peace request veto victory; use at least two founding records for competitive campaigns; do not treat a hidden reused breakaway ID as new observed life; do not let all-human defeat override an already final AI Domination result; do not copy another observer's spy-report network recursively. All findings above are resolved in the written contract. Remaining playtest questions are empirical pacing/fun risks, not unspecified implementation behavior.

## 20. Non-goals and escalation

No Science/Culture victory, liveness redesign, original-capital reconstruction, broad diplomacy/AI/save rewrite, #995 takeover, direct war-array mutation, new surrender mechanic, general command bus, automatic progress buffs, omniscient UI or AI, generic celebration framework, asset backlog, or fake General achievement.

Escalate to Astra if current evidence invalidates the founding-record/provisional-secession contract, existing #910 cannot support the described valid role facts, observer-safe evidence cannot implement the stated report semantics, final #995 APIs cannot execute the approved legal response, or save/timing requires a central behavior change. Report assumption, contradictory source evidence, affected MR/sections, alternatives and AI/privacy/hot-seat/save/determinism/migration/gameplay implications. Mechanical file/API/schema-number drift is not a license to redesign and does not by itself require escalation.

The handoff is to the reviewed implementation plan. No production source was changed in Phase A.
