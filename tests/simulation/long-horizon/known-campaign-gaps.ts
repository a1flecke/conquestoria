/**
 * #1005 — the known-gap register for the long-horizon campaign suite.
 *
 * The suite is expected to FIND bugs. #1005's job is observability, not an
 * unbounded gameplay-fix MR, so a discovered stall that isn't trivially and
 * obviously in-scope is recorded here against a focused follow-up issue rather
 * than fixed in place.
 *
 * The register is a TWO-WAY RATCHET, enforced by `campaign-matrix.test.ts`:
 *
 *   1. Every finding a scenario produces MUST be covered by an entry here whose
 *      `scenarios` includes that scenario (or is `'any'`). An UNKNOWN finding
 *      fails the run — a new stall can never slip in silently.
 *   2. Every entry that names a scenario MUST still reproduce its `code` in at
 *      least one of those scenarios. A gap that has been FIXED also fails the
 *      run, with a message telling you to delete the entry — the register can
 *      never go stale.
 *
 * Because the suite is explicit-run only, direction (2) costs nobody a merge.
 */
import type { CampaignFindingCode } from './campaign-analysis';

export interface KnownCampaignGap {
  code: CampaignFindingCode;
  /** Follow-up issue reference, e.g. `#1234`. */
  issue: string;
  /** One line: what the stall is and why it is deferred, not fixed here. */
  why: string;
  /** Scenario seeds this gap is expected to reproduce in, or `'any'`. */
  scenarios: readonly string[] | 'any';
}

/**
 * F1 (found by the #1005 design probes, confirmed across the full 9-scenario
 * matrix): an AI major civ whose strategic planner produces no plan also
 * produces no `AIForceDemand`, so it can never build a settler or any unit at
 * all. #1064's exploration + expand-objective fix resolves this for the
 * overwhelming majority of civs across every scenario, but three residual
 * symptoms remain -- all re-pointed away from #1064 below because none is
 * caused by, or fixable within, that MR:
 *
 * - `expansion-frozen` still reproduces in `lh-late-era-medium` for civs that
 *   never form a SINGLE plan for the entire 250-round campaign
 *   (`activePlanCount` stays 0 throughout) -- believed to share
 *   `unit-count-runaway`'s already-tracked root cause (see F3 below and the
 *   #1066 comment thread). #1064's exploration loop cannot make
 *   `prepareMajorCivStrategicPlan` itself produce a plan -- it only feeds the
 *   belief layer once a plan exists.
 * - `expansion-frozen` ALSO reproduces in `lh-explorer-small`, but with a
 *   visibly different shape: that civ gets a settler around round 45 and an
 *   active, actively-progressing (not wedged) expand plan around round 195,
 *   it simply doesn't finish founding within the scenario's 300-round cap.
 *   Registered separately, pointing at a new issue, rather than conflated
 *   with the late-era case's zero-plans-ever shape. See #1095.
 * - `production-idle`/`gold-hoard` reproduce on every scenario in the matrix
 *   (not just larger maps, contrary to an earlier read of a truncated test
 *   run) -- the "residual idle" contingency #1064's own design doc
 *   anticipated (§2.20): a civ that expansion now genuinely works for
 *   eventually reaches its soft cap or exhausts buildable content given
 *   enough rounds, and legitimately idles with growing gold. See #1094.
 *
 * F3 (found by the Sol implementation review): in the deterministic Era-9
 * scenario every AI civ's unit count runs away — 2 → 30..80 units on a single
 * city, gold still climbing, so the units are spawned, not bought. The ramp
 * starts around round 180 and adds ~1 unit/civ/round. `assertLateEraForce` and
 * the modern-share floor don't catch it (they check force *composition*, not
 * *count*), so `unit-count-runaway` was added. Root cause not yet triaged
 * (Era-9 fixture setup vs. late-game economy vs. a per-turn spawn mechanism).
 * **After #1064 landed this no longer crosses the detector's threshold** (the
 * affected civ's unit growth is 17, below the configured 25) -- plausibly
 * because exploration now gives idle combat units something else to do. The
 * entry below is removed (the ratchet's own "gap fixed, delete it" signal),
 * but #1066 stays open: the same civs still show `expansion-frozen` (zero
 * plans for 250 rounds), so the underlying defect looks unresolved, just no
 * longer visible through this specific numeric symptom. See the #1066 thread.
 *
 * F4 (found running the full matrix after #1064's expansion fix landed, later
 * investigated and re-triaged as #1093 — see that issue and its closing
 * comment): the same `lh-late-era-medium` scenario also reports `tech-frozen`
 * — a civ with techs objectively available completes none for 135+ rounds.
 * #1093's investigation found the research subsystem itself
 * (`processResearch`, `planAIResearch`, `enqueueResearch`, tech-tree topology)
 * behaves correctly throughout — the freeze is downstream of the SAME F1
 * zero-plan defect above, not an independent research-system bug. #1093 was
 * closed as a duplicate/symptom of the `expansion-frozen` entry below.
 *
 * F5 (found verifying #1066's amphibious-objective-routing fix against this
 * exact scenario): #1066 was designed on the assumption that `ai-3`'s
 * zero-plan freeze was purely a strategic-reachability problem — teach the AI
 * that a target across water is reachable, and it unsticks. That assumption
 * was *partially* right: instrumented at round 200 of the real campaign,
 * `findRegionCrossings` correctly finds two one-hop sea crossings from
 * `ai-3`'s known territory, 6 of its 8 previously-permanently-unreachable
 * `secure-resource` candidates gain real finite travel-time scores instead of
 * `-Number.MAX_VALUE`, and `prepareMajorCivStrategicPlan`'s `forceDemands`
 * correctly includes a `transport` role demand at priority 90. The fix works
 * exactly as designed. But `ai-3` still never builds a transport and its
 * `primaryPlan` stays permanently `null`, because `isCityCoastal(city, map)`
 * returns `false` for its one city — confirmed directly, and confirmed that
 * `troop_transport` (the non-obsolete, fully tech-unlocked terminal transport
 * unit) passes every other production gate (tech, obsoletion, civ-type,
 * resource) and is excluded on `coastalRequired` alone. `isCityCoastal` checks
 * only the city's own tile plus its immediate 6 neighbors — `ai-3`'s city
 * sits at the center of a small landmass whose immediate ring is entirely
 * hills/mountain; its abundant coastal tiles are all 2+ tiles further out.
 * With exactly one, non-immediately-coastal city, the civ can never build a
 * ship regardless of how correctly it identifies a crossing. Distinct from
 * the "fully landlocked civ" case #1066's design doc already flagged as a
 * non-goal (zero coastal *territory* anywhere, tracked separately as #1108)
 * — `ai-3` has plenty of coastal territory, just not within its specific
 * city's immediate ring. Filed as #1107. #1066 itself is NOT closed by its
 * own PR as a result — the amphibious-routing defect it targeted is fixed and
 * proven correct (see that PR's test evidence), but this scenario's specific
 * findings persist for the different, narrower reason #1107 now owns.
 *
 * F6 (found during #1107's own design investigation): `ai-3`'s specific
 * landmass under the original `lh-late-era-medium` seed is smaller than
 * `MIN_CITY_CENTER_DISTANCE` -- exactly 10 land tiles total, including its
 * own city -- so no second city, coastal or not, can EVER legally stand
 * anywhere on it. This is not an AI-competence gap; it is a genuine,
 * permanent capability deadlock (behaviorally identical to #1108's "fully
 * landlocked civ" case, just reached via a different literal mechanism). A
 * 25-seed search confirmed this landmass shape is a statistical outlier: zero
 * of the alternate seeds tried reproduced anything remotely that degenerate
 * for a non-coastal-city civ. `lh-late-era-medium` therefore now sets
 * `mapSeed: 'lh-1107-search-0'` (see `campaign-scenarios.ts` and
 * `docs/superpowers/specs/2026-09-14-issue-1107-coastal-city-recovery-design.md`),
 * which reproduces the same "coastal territory, non-coastal city" shape for
 * civ `ai-1` on a genuinely recoverable 43-tile landmass, so the `#1107` fix
 * below has something real to fix and the long-horizon suite actually
 * exercises it. `ai-3`'s original 10-tile shape is a legitimate, separate
 * map-generation finding of its own -- not solved by #1107, not silently
 * dropped; worth its own follow-up if map generation should avoid landmasses
 * below the minimum city-spacing floor in general.
 *
 * F7 (found running the full matrix after #1107's own fixes landed -- both the
 * coastal-recovery bias and a real, separately-fixed repel-plan target-staleness
 * bug it exposed, see that commit's message): `lh-veteran-medium`'s civ `ai-3`
 * newly reports `expansion-frozen` across a 400-round campaign. NOT caused by
 * #1107's coastal-recovery mechanism -- confirmed `ai-3` already has a coastal
 * city (`civHasCoastalCity` true), so the bias never applies to it, and
 * confirmed omnisciently that 1429 of 1445 land tiles on the real map are
 * legal second-city sites for it (not a landmass-size deadlock like F6 above).
 * Root cause: `getKnownExpansionSites` (the #1064 belief-layer site finder)
 * returns ZERO candidates for this civ throughout the entire campaign -- its
 * fog-bounded knowledge never covers a single legal site within
 * EXPANSION_SEARCH_RADIUS of its own city, so no expand candidate (not even an
 * ineligible one) is ever produced, and consequently no settlement force-demand
 * is ever seeded either. This points at #1064's own idle-unit
 * auto-explore/exploration-coverage machinery, not anything #1107 touches --
 * see #1110. Newly exposed (not caused) by the trajectory shift from #1107's
 * changes, the same way the repel-plan bug above was.
 *
 * F8 (found running the full matrix after all five #1107 Task-7 fixes landed):
 * THREE registered gaps are now confirmed stale and deleted here --
 * `tech-frozen`/#1107 (ai-1's economy genuinely recovered, matching the
 * predicted resolution path), `expansion-frozen`/#1110 (the exploration-
 * coverage gap -- plausibly a side effect of the shouldWithdraw non-combat
 * fix or the sticky-target fix, both of which improve settler-plan
 * robustness generically, not just for coastal-recovery civs; #1110 closed
 * on GitHub with this explanation), and `expansion-frozen`/#1095 (a
 * pre-existing, #1107-unrelated finding that also stopped reproducing --
 * plausibly the same generic robustness improvement; left open on GitHub
 * pending owner confirmation rather than closed unilaterally). The
 * `expansion-frozen`/#1107 entry for `lh-late-era-medium` itself survives,
 * but for a DIFFERENT civ than originally diagnosed -- confirmed via direct
 * production trace that ai-1 (the civ #1107 targets) now reaches 2 cities
 * and is actively expanding further, while `ai-3` in the same scenario is
 * newly the one stuck at 1 city, unrelated to coastal status. Not yet
 * root-caused as a distinct issue.
 *
 * F9 (found running the full matrix with #1094's AI gold-spending fix
 * landed -- see `src/ai/ai-treasury.ts`): #1094 investigated `production-idle`
 * and `gold-hoard` together and found they do NOT share one cause. Direct
 * instrumentation of `generateWithResidual`/`applyAIProduction` on
 * `lh-veteran-small` proved `gold-hoard` was structural: the AI had NO gold
 * sink at all, ever (`rushBuyActiveProduction` had zero callers under
 * `src/ai/`), so a healthy civ's gold only ever climbed, independent of any
 * idle window. `production-idle` there was a genuinely different, narrower
 * thing -- a temporary tech-plateau (every currently-unlockable building
 * already built, and the only live force demand permanently unsatisfiable
 * because `crossbowman` needs a `copper` resource the civ never acquired).
 * #1094 fixed the gold-spending gap by wiring the AI into the same
 * `getRushBuyQuote`/`rushBuyActiveProduction` mechanic a human player already
 * has (reserve-gated, difficulty-invariant, no new legality). `production-idle`
 * was NOT touched and was split into its own follow-up, #1113, since it needs
 * separate root-causing before any fix is attempted.
 *
 * Effect on this registry: `gold-hoard` dropped from reproducing on all 9
 * scenarios to reproducing on 2 (`lh-standard-large`, `lh-veteran-medium`),
 * and in both remaining cases only for rounds that overlap that civ's own
 * `production-idle` window -- once a queue is genuinely empty, rush-buying
 * has nothing to spend on, so gold-hoard is now purely a downstream symptom
 * of #1113's still-open finding, not an independent defect. The trajectory
 * shift from AI civs affording things sooner also (a) resolved the
 * `expansion-frozen`/#1107 entry below -- `lh-late-era-medium` no longer
 * reports it at all, deleted per the ratchet's own "gap fixed, delete it"
 * rule -- and (b) newly exposed the same finding CODE on a different
 * scenario/civ: `lh-veteran-medium`'s `ai-3` never rises above 1 city across
 * the full 400-round campaign (`cities` flat at 1 in the decimated sample
 * series start to finish, `maxPlanNoProgressRounds: 0` -- not wedged, simply
 * never active), the same zero-plan-forever signature F1 attributes to
 * #1066's still-open thread. Not independently re-root-caused here -- #1094's
 * diff never touches `ai-prepared-turn.ts`/expansion candidate generation, so
 * this can only be a trajectory-shift exposure of an existing defect, exactly
 * like F7/F8 above, not a new bug from the gold-spending change itself.
 *
 * F10 (#1113 -- production-idle's own root-cause pass, split off from #1094):
 * a full-catalog audit of `TRAINABLE_UNITS` found `isUnitObsolete` retiring a
 * unit the instant its `obsoletedByTech` completed, with no check that its
 * `upgradesTo` successor was actually buildable -- affecting `archer`
 * (obsoletes at `tactics`; successor `crossbowman` additionally needs
 * `copper`) and `chariot` (obsoletes at `iron-forging`; successor `knight`
 * additionally needs `iron`), the exact pattern #1094's original trace found.
 * Both pairs are gated by the SAME tech that retires the predecessor, so a
 * civ lacking the resource lost its only unit in that role with no way to
 * build the replacement. Fixed in `city-system.ts`'s `isUnitObsolete` by
 * walking the full `upgradesTo` chain (not just the immediate successor --
 * `crossbowman`'s own successor `rifleman` needs no resource at all, so a
 * copper-starved civ must still retire `archer` once `rifled-infantry` makes
 * `rifleman` real, rather than fielding archers forever) and keeping the
 * predecessor trainable only while nothing in the chain is yet buildable.
 * Applies identically to human and AI production (`getTrainableUnitsForCiv`/
 * `getTrainableUnitsForCity` are the sole legality source for both).
 *
 * Direct re-trace after the fix confirmed it working exactly as designed:
 * `lh-veteran-small`'s previously-idle civ now actively queues `archer` to
 * fill its `ranged` demand the moment the fix makes it legal again. The SAME
 * civ then idles again a few rounds later, for a DIFFERENT, already-tracked
 * reason (no coastal city, so no naval unit can ever fill its `naval-combat`
 * demand -- #1108's territory). Re-tracing `lh-standard-small`'s window found
 * a third, genuinely benign shape: zero active demands and zero legal
 * buildings, a temporary tech/build plateau with nothing wrong to fix. Across
 * the full matrix, 8 of 9 scenarios' findings are byte-identical before and
 * after this fix -- the resource-locked-successor pattern was real and is
 * fixed, but it was never the majority cause of `production-idle` matrix-wide.
 * The remaining reproductions split across benign plateaus and two
 * already-open, already-owned issues (#1066, #1108) rather than one further
 * bug -- see the `production-idle` entry below for the honest accounting.
 *
 */
export const KNOWN_CAMPAIGN_GAPS: readonly KnownCampaignGap[] = [
  {
    code: 'expansion-frozen',
    issue: '#1066',
    why: 'lh-veteran-medium\'s ai-3 never rises above 1 city across the full 400-round '
      + 'campaign (flat at 1 city in every decimated sample, maxPlanNoProgressRounds: 0 '
      + '-- not a wedged plan, simply never active) -- the same zero-plan-forever '
      + 'signature F1 attributes to #1066\'s still-open thread. Newly exposed (not '
      + 'caused) by the trajectory shift from #1094\'s AI gold-spending fix, the same way '
      + 'F7/F8 above were newly exposed by #1107\'s changes -- #1094\'s diff never '
      + 'touches expansion candidate generation. See F9 in the file header.',
    scenarios: ['lh-veteran-medium'],
  },
  {
    code: 'gold-hoard',
    issue: '#1113',
    why: '#1094 found this was NOT the same cause as production-idle: the AI had no '
      + 'gold-spending mechanism at all (rushBuyActiveProduction had zero AI callers), '
      + 'so a healthy civ\'s gold climbed regardless of idle state, reproducing on all 9 '
      + 'scenarios for up to the full campaign length. Fixed by wiring the AI into the '
      + 'same rush-buy mechanic a human player already has (src/ai/ai-treasury.ts). '
      + 'Post-fix this now reproduces only on lh-standard-large and lh-veteran-medium, '
      + 'and only for rounds that overlap that civ\'s own production-idle window -- an '
      + 'empty queue has nothing to rush-buy, so the residual is a pure downstream '
      + 'symptom of #1113\'s still-open production-idle finding, not an independent '
      + 'defect. See F9 in the file header.',
    scenarios: ['lh-standard-large', 'lh-veteran-medium'],
  },
  {
    code: 'production-idle',
    issue: '#1108',
    why: '#1113 root-caused and fixed one real, catalog-wide correctness bug this '
      + 'finding was tracking (isUnitObsolete retiring archer/chariot before their '
      + 'resource-locked successors were actually buildable -- see F10 in the file '
      + 'header) -- confirmed via direct re-trace that the fixed civ now actively '
      + 'produces archers to fill its ranged demand instead of idling. Re-tracing the '
      + 'REMAINING occurrences after that fix found no single further bug: '
      + 'lh-standard-small idles legitimately (no active demand, no legal building -- a '
      + 'temporary tech/build plateau, resolves once research/expansion progresses); '
      + 'the same civ that was fixed on lh-veteran-small idles again immediately after '
      + 'for a DIFFERENT, already-tracked reason (no coastal city ever, so no naval unit '
      + 'can ever fill its `naval-combat` demand -- #1108\'s territory, not fixed here); '
      + 'lh-veteran-medium\'s `ai-3` idles because it never forms a strategic plan at '
      + 'all (#1066, see that entry above). Still reproduces on every scenario, but as a '
      + 'mix of benign temporary plateaus and two already-open, already-owned issues -- '
      + 'not one bug for a new issue to claim.',
    scenarios: 'any',
  },
];

export interface GapRatchetResult {
  unknownFindings: Array<{ scenario: string; code: CampaignFindingCode; detail: string }>;
  staleGaps: KnownCampaignGap[];
}

/**
 * Run both ratchet directions over the findings collected across a set of
 * scenarios. `findingsByScenario` must contain an entry for EVERY scenario the
 * matrix ran (even those with no findings), or direction (2) cannot tell a
 * fixed gap from an un-run scenario.
 */
export function evaluateGapRatchet(
  findingsByScenario: ReadonlyMap<string, ReadonlyArray<{ code: CampaignFindingCode; detail: string }>>,
): GapRatchetResult {
  const ranScenarios = new Set(findingsByScenario.keys());
  const unknownFindings: GapRatchetResult['unknownFindings'] = [];

  for (const [scenario, findings] of findingsByScenario) {
    for (const finding of findings) {
      const covered = KNOWN_CAMPAIGN_GAPS.some(gap =>
        gap.code === finding.code
        && (gap.scenarios === 'any' || gap.scenarios.includes(scenario)));
      if (!covered) {
        unknownFindings.push({ scenario, code: finding.code, detail: finding.detail });
      }
    }
  }

  const staleGaps = KNOWN_CAMPAIGN_GAPS.filter(gap => {
    const expectedIn = gap.scenarios === 'any'
      ? [...ranScenarios]
      : gap.scenarios.filter(seed => ranScenarios.has(seed));
    if (expectedIn.length === 0) return false; // none of its scenarios ran this pass
    return !expectedIn.some(scenario =>
      (findingsByScenario.get(scenario) ?? []).some(finding => finding.code === gap.code));
  });

  return { unknownFindings, staleGaps };
}
