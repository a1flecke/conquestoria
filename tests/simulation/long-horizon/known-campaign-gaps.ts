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
 * produces no `AIForceDemand`, and `generateAIProductionCandidates` drops every
 * trainable-unit candidate that matches no demand — so the civ can never build a
 * settler (no `settlement` demand exists anywhere) or any unit at all. Over a
 * full campaign EVERY AI civ, on every map size and tier, stays at one city in
 * era 1 with `activePlanCount: 0`, its lone city idle for 60-170 rounds once its
 * buildings are exhausted, hoarding unspent gold. That single root cause is what
 * `expansion-frozen`, `production-idle` and `gold-hoard` all report here. The
 * fix is in AI production/planning (`src/ai/ai-production.ts`,
 * `src/ai/ai-prepared-turn.ts`, `src/ai/ai-plan-portfolio.ts`) and is out of
 * scope for a test-only issue.
 *
 * (A `population-frozen` detector was prototyped during design and dropped: it
 * only ever echoed the three above for the same civs, and a one-city city
 * legitimately sits at its population ceiling for a long time.)
 *
 * F3 (found by the Sol implementation review): in the deterministic Era-9
 * scenario every AI civ's unit count runs away — 2 → 30..80 units on a single
 * city, gold still climbing, so the units are spawned, not bought. The ramp
 * starts around round 180 and adds ~1 unit/civ/round. `assertLateEraForce` and
 * the modern-share floor don't catch it (they check force *composition*, not
 * *count*), so `unit-count-runaway` was added. Root cause not yet triaged
 * (Era-9 fixture setup vs. late-game economy vs. a per-turn spawn mechanism) —
 * the follow-up must investigate. Only reproduces in `lh-late-era-medium`.
 *
 * F2 lives in the save/reload continuity test, not here — it is a divergence
 * path, not a campaign finding code.
 */
export const KNOWN_CAMPAIGN_GAPS: readonly KnownCampaignGap[] = [
  {
    code: 'expansion-frozen',
    issue: '#1064',
    why: 'AI with no strategic plan emits no settlement demand, so it never builds a '
      + 'settler and never founds a second city (see file header).',
    scenarios: 'any',
  },
  {
    code: 'gold-hoard',
    issue: '#1064',
    why: 'Same root cause as expansion-frozen: an AI that cannot turn production into '
      + 'units banks gold indefinitely.',
    scenarios: 'any',
  },
  {
    code: 'production-idle',
    issue: '#1064',
    why: 'Same root cause: with no force demand, once a one-city AI exhausts its '
      + 'building options its only city sits with an empty queue for the rest of the game.',
    scenarios: 'any',
  },
  {
    code: 'unit-count-runaway',
    issue: '#1066',
    why: 'Era-9 scenario: every AI spawns ~1 unit/round from ~round 180 to a 30-80 '
      + 'unit stack on one city with gold still rising. Root cause not yet triaged '
      + '(see file header).',
    scenarios: ['lh-late-era-medium'],
  },
];

/**
 * F2 (found by the #1005 design probes): loading a save re-seeds
 * `minorCivs.<id>.lastNotifiedStatusByCiv` for EVERY major civ
 * (`normalizeMinorCivQuestState`, `src/storage/save-manager.ts`), so a
 * save/reload is not simulation-equivalent — a civ that had never triggered a
 * city-state status notification acquires a "notified at neutral" baseline,
 * which can suppress a first notification. Contradicts the #1001 comment that
 * the field "drives nothing". The `save/reload continuity` test tolerates
 * exactly this divergence path and nothing else.
 */
export const F2_SAVE_RELOAD_ISSUE = '#1065';
const F2_DIVERGENCE_PATTERN = /^minorCivs\.[^.]+\.lastNotifiedStatusByCiv\./;

export function isKnownSaveReloadDivergence(path: string | null): boolean {
  return path !== null && F2_DIVERGENCE_PATTERN.test(path);
}

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
