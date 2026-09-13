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
 * F4 (found running the full matrix after #1064's expansion fix landed): the
 * same `lh-late-era-medium` scenario also reports `tech-frozen` — a civ with
 * techs objectively available completes none for 135+ rounds. #1064 fixing
 * expansion lets AI civs reach a far higher tech count within this fixed-round
 * scenario than was ever reachable while every civ was stuck at one city,
 * newly exposing this separate, pre-existing stall in `ai-research.ts`. Not
 * caused by any #1064 change (research/tech-yield code is untouched by that
 * MR) — see #1093.
 *
 */
export const KNOWN_CAMPAIGN_GAPS: readonly KnownCampaignGap[] = [
  {
    code: 'expansion-frozen',
    issue: '#1066',
    why: 'Believed to share unit-count-runaway\'s root cause: the affected civs never '
      + 'form a single plan for the whole 250-round campaign, and #1064\'s exploration '
      + 'loop cannot make prepareMajorCivStrategicPlan itself produce a plan -- it only '
      + 'feeds the belief layer once a plan exists. Not caused by #1064 (see file header).',
    scenarios: ['lh-late-era-medium'],
  },
  {
    code: 'expansion-frozen',
    issue: '#1095',
    why: 'Different shape from the #1066 case: this civ gets a settler and an '
      + 'actively-progressing (not wedged) expand plan, it simply takes ~195 rounds '
      + 'to prioritize expansion at all on explorer tier and does not finish founding '
      + 'within this scenario\'s 300-round cap. Not caused by #1064 (see file header).',
    scenarios: ['lh-explorer-small'],
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
  {
    code: 'tech-frozen',
    issue: '#1093',
    why: '#1064 fixed AI expansion, which lets AI civs reach a far higher tech count '
      + 'within a fixed-round late-era scenario than was ever reachable while every '
      + 'civ was stuck at one city. That newly exposes a separate, pre-existing stall '
      + 'in ai-research.ts: a civ with techs objectively available (availableTechCount '
      + '> 0) completes none for 135+ rounds. Not caused by any #1064 change '
      + '(research/tech-yield code is untouched by that MR) and not triaged further '
      + '-- out of scope here.',
    scenarios: ['lh-late-era-medium'],
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
