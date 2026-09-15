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
 */
export const KNOWN_CAMPAIGN_GAPS: readonly KnownCampaignGap[] = [
  {
    code: 'expansion-frozen',
    issue: '#1107',
    why: 'ai-1\'s original instance of this finding (the civ #1107\'s coastal-recovery '
      + 'fix targets) is CONFIRMED RESOLVED as of the fifth #1107 Task-7 fix (visible '
      + 'minor-civ cities in expand legality): ai-1 now reaches 2 cities and is actively '
      + 'pursuing further expansion by round 250, verified via direct production trace. '
      + 'This scenario still reproduces the same finding CODE for a DIFFERENT civ, '
      + 'ai-3 -- also non-coastal, also stuck at 1 city, despite having abundant legal '
      + 'sites available on the real map (unrelated to #1107\'s own coastal-status '
      + 'mechanism, since fixing ai-1 does not touch whatever ai-3 is blocked on). Not '
      + 'yet root-caused; kept registered here rather than filed as a new issue since it '
      + 'may share one of the five #1107 Task-7 bugs (repel-plan staleness, expand-site '
      + 'oscillation, shouldWithdraw non-combat exemption, or the minor-civ-legality gap) '
      + 'for a different specific site/geometry. Investigate ai-3 specifically before '
      + 'assuming this is resolved.',
    scenarios: ['lh-late-era-medium'],
  },
  {
    code: 'gold-hoard',
    issue: '#1094',
    why: 'Residual idle once a civ genuinely expands and then reaches its soft cap or '
      + 'exhausts buildable content given enough rounds -- the design\'s own '
      + 'anticipated §2.20 contingency, not #1064\'s original no-plan bug (see file '
      + 'header). Reproduces on every scenario in the matrix.',
    scenarios: 'any',
  },
  {
    code: 'production-idle',
    issue: '#1094',
    why: 'Same residual-idle cause as gold-hoard above. Reproduces on every scenario '
      + 'in the matrix.',
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
