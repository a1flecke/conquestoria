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
 *
 * RATCHET_VERSION 2 (#1407 phase 5). Version 1 covered a finding by `code` + scenario only, so one accepted
 * occurrence could hide a NEW civ's defect or a MUCH WORSE streak in the same scenario. Version 2 adds, per entry:
 *
 *   - `accepted`: scoped occurrences `{ scenario, civId?, maxRounds? }`. When present, a finding is covered only by
 *     an occurrence that matches its scenario, its civ (when the occurrence names one) and whose `maxRounds` budget
 *     (the finding's `lastRound - firstRound + 1`) it does not exceed. Anything else is reported with a reason:
 *     `new-civ` (the scenario is accepted for other civs only) or `worsened` (same civ, streak over budget).
 *   - Staleness is per occurrence: an accepted occurrence whose scenario ran and no longer reproduces the code for
 *     that civ must be deleted, even while another occurrence of the same entry still reproduces.
 *   - `scenarios: 'any'` is only legal with a written `wildcardRationale` (`findInvalidGapRegistrations`).
 *
 * Entries without `accepted` keep the version-1 scenario-level meaning, so nothing was rewritten automatically: a
 * baseline moves only when a reviewer attaches evidence (a matrix run) and edits the entry.
 */
export const RATCHET_VERSION = 2;
import type { CampaignFindingCode } from './campaign-analysis';

export interface KnownCampaignGap {
  code: CampaignFindingCode;
  /** Follow-up issue reference, e.g. `#1234`. */
  issue: string;
  /** One line: what the stall is and why it is deferred, not fixed here. */
  why: string;
  /** Scenario seeds this gap is expected to reproduce in, or `'any'`. */
  scenarios: readonly string[] | 'any';
  /** Required when `scenarios` is `'any'`: why a blanket exemption is bounded and when it must be narrowed. */
  wildcardRationale?: string;
  /** Scoped, budgeted acceptance (ratchet v2). When present it replaces scenario-level coverage. */
  accepted?: readonly AcceptedOccurrence[];
  /**
   * The ONLY way an entry may name a closed owner (#1454): a written reason (>= 60 chars) why a closed issue is still
   * the right reference, e.g. a deliberately-won't-fix decision recorded there. Absent for every shipped entry.
   */
  ownerClosedRationale?: string;
}

export interface AcceptedOccurrence {
  scenario: string;
  /** Omitted = any civ of that scenario. Name the civ whenever it is stable. */
  civId?: string;
  /** Largest accepted streak (`lastRound - firstRound + 1`). Omitted = no streak budget. */
  maxRounds?: number;
}

/**
 * Reconciliation history (#1454). Earlier revisions of this file carried a long narrative (F1-F14) about how each
 * accepted occurrence was found and which MR changed it. Every owner it named (#1066, #1094, #1108, #1113, #1127,
 * #1413) is closed, and a full exclusive matrix run on main a990bc08 (2026-10-13) showed none of the occurrences it
 * accepted still reproduce, so the narrative described behaviour that no longer exists. Git history keeps it.
 *
 * What the 2026-10-13 run found (all 9 scenarios, deterministic artifacts under `.verification/ai-long-horizon/`):
 *
 *   - Removed as no longer reproducing: `no-research-choice` lh-veteran-large ai-1/ai-3/ai-5 (#1413, fixed by #1421);
 *     `gold-hoard` lh-veteran-large ai-2/ai-3, lh-veteran-medium ai-1, lh-explorer-small ai-1 (#1113);
 *     `production-idle` lh-late-era-medium ai-1 (#1127).
 *   - Still present, now on different civs/scenarios, re-registered against NEW open owners with their observed
 *     streak and ~25% headroom: `no-research-choice` lh-veteran-large ai-2 (#1479), `gold-hoard` lh-late-era-medium
 *     ai-1/ai-2 (#1480), `production-idle` lh-late-era-medium ai-3 (#1481).
 *
 * What the 2026-10-30 re-audit found (deterministic `lh-late-era-medium` runs on main d12b4e23, artifacts preserved
 * for the audit): the 2026-10-13 register no longer matched reality either.
 *
 *   - `gold-hoard` did not fire for ANY civ in either audit run. Gold now dips often enough (observed 5-433 gold dips
 *     every ~10-40 rounds) that no 60-round non-decreasing run survives. The economically meaningful fact behind #1480
 *     was that a fully-teched civ has no legal *worthwhile* gold sink: every sampled rush-buy quote was an item the
 *     city finishes from its own production, `getCanonicalUpgradeTarget` returned null for every unit at 310 completed
 *     techs, and no AI civ owned a trade unit. The entry was stale and is deleted; #1480 keeps the analysis.
 *   - `production-idle` moved: ai-3's 14-round occurrence no longer reproduced, while ai-1 (68 rounds, 182-249) and
 *     ai-2 (92 rounds, 158-249) newly fired. Root cause: the missionary production candidate was unbounded, so every
 *     city completed a 16-production missionary every round and discarded the rest of its output (ai-2 reached 375
 *     missionaries of 427 units). #1480's fix caps it, and this scenario now produces NO findings at all, so the
 *     entry is deleted. A fresh production-idle streak would be reported as `unregistered` by this ratchet.
 *   - `no-research-choice` was already mis-scoped on main before this branch: a `lh-veteran-large` run on
 *     unmodified d12b4e23 reports ai-3 for 7 rounds (492-498), not the registered ai-2. The occurrence is
 *     re-scoped to the civ the baseline run actually names, with its observed streak plus ~25% headroom.
 *
 * Every claim above is backed by a deterministic `.verification/ai-long-horizon/<seed>.json` artifact produced
 * from this branch and, for the two "already true before this branch" claims, from a d12b4e23 worktree.
 *
 * `lh-late-era-medium` uses `mapSeed: 'lh-1107-search-0'`; why that map was chosen (a recoverable 43-tile landmass
 * for `ai-1`) is in `docs/superpowers/specs/2026-09-14-issue-1107-coastal-city-recovery-design.md`.
 *
 * Rules for editing this register (all but the last are machine-checked by `findInvalidGapRegistrations` and
 * `findOwnerProblems`, run offline by `tests/scripts/known-campaign-gap-registry.test.ts`):
 *
 *   - Every entry is scoped (`accepted` with a civ and a `maxRounds` budget); a wildcard needs a rationale.
 *   - Every scenario and budget must exist in the scenario matrix.
 *   - The owner issue must be OPEN in `known-gap-owners.json` (a snapshot refreshed by
 *     `./scripts/dev.sh known-gap-owners-refresh`, verified live before each long run). A closed owner is only legal
 *     with an `ownerClosedRationale`.
 *   - Never re-point a still-reproducing finding at a closed issue, and never widen a budget to make a run pass: file
 *     or reuse an OPEN issue and attach the matrix run.
 */
export const KNOWN_CAMPAIGN_GAPS: readonly KnownCampaignGap[] = [
  {
    code: 'no-research-choice',
    issue: '#1479',
    why: 'lh-veteran-large ai-3 selects no research for 7 consecutive rounds (492-498 on the d12b4e23 baseline run, '
      + '490-496 on this branch) while techs are available; the detector threshold is 6. The registered ai-2 '
      + 'occurrence no longer reproduced even before this branch, so it was replaced by the civ the baseline run '
      + 'actually names. Not root-caused.',
    scenarios: ['lh-veteran-large'],
    accepted: [{ scenario: 'lh-veteran-large', civId: 'ai-3', maxRounds: 9 }],
  },
];

export type UnknownFindingReason = 'unregistered' | 'new-civ' | 'worsened';

export interface RatchetFinding {
  code: CampaignFindingCode;
  detail: string;
  civId?: string;
  firstRound?: number;
  lastRound?: number;
}

export interface GapRatchetResult {
  unknownFindings: Array<{ scenario: string; code: CampaignFindingCode; detail: string; reason: UnknownFindingReason }>;
  staleGaps: KnownCampaignGap[];
  staleOccurrences: Array<{ gap: KnownCampaignGap; occurrence: AcceptedOccurrence }>;
}

function streakOf(finding: RatchetFinding): number | undefined {
  return finding.firstRound === undefined || finding.lastRound === undefined
    ? undefined
    : finding.lastRound - finding.firstRound + 1;
}

/** Why a finding is not covered by a scoped gap, or `null` when an occurrence covers it. */
function scopedVerdict(
  gap: KnownCampaignGap,
  scenario: string,
  finding: RatchetFinding,
): 'covered' | 'new-civ' | 'worsened' | 'no-match' {
  const inScenario = (gap.accepted ?? []).filter(o => o.scenario === scenario);
  if (inScenario.length === 0) return 'no-match';
  const forCiv = inScenario.filter(o => o.civId === undefined || o.civId === finding.civId);
  if (forCiv.length === 0) return 'new-civ';
  const streak = streakOf(finding);
  const withinBudget = forCiv.some(o => o.maxRounds === undefined || streak === undefined || streak <= o.maxRounds);
  return withinBudget ? 'covered' : 'worsened';
}

/** Registration mistakes a reviewer should never have to spot by eye. Empty when the register is well-formed. */
export function findInvalidGapRegistrations(gaps: readonly KnownCampaignGap[] = KNOWN_CAMPAIGN_GAPS): string[] {
  const problems: string[] = [];
  for (const gap of gaps) {
    const label = `${gap.code} (${gap.issue})`;
    if (gap.scenarios === 'any' && !(gap.wildcardRationale && gap.wildcardRationale.trim().length >= 40)) {
      problems.push(`${label}: scenarios 'any' needs a wildcardRationale (>= 40 chars) saying why it is bounded`);
    }
    if (gap.scenarios !== 'any' && gap.wildcardRationale) {
      problems.push(`${label}: wildcardRationale is only meaningful with scenarios 'any'`);
    }
    if (gap.accepted !== undefined) {
      if (gap.accepted.length === 0) problems.push(`${label}: accepted is empty`);
      const accepted = new Set(gap.accepted.map(o => o.scenario));
      if (gap.scenarios === 'any') problems.push(`${label}: scoped 'accepted' cannot be combined with scenarios 'any'`);
      else if (gap.scenarios.some(seed => !accepted.has(seed)) || [...accepted].some(seed => !(gap.scenarios as readonly string[]).includes(seed))) {
        problems.push(`${label}: scenarios must list exactly the scenarios named in accepted`);
      }
      for (const o of gap.accepted) {
        if (o.maxRounds !== undefined && !(o.maxRounds >= 1)) problems.push(`${label}: maxRounds must be >= 1 (${o.scenario})`);
      }
    }
  }
  return problems;
}

export type OwnerState = 'open' | 'closed';

export interface GapRegistryContext {
  /** The scenario matrix (`LONG_HORIZON_SCENARIOS`): seed and round cap are all that is needed. */
  scenarios: ReadonlyArray<{ seed: string; turns: number }>;
  /** Recorded owner issue states keyed by `#123` (`known-gap-owners.json`, refreshed from GitHub). */
  ownerStates: Readonly<Record<string, OwnerState>>;
}

/**
 * The cheap, offline registry integrity check (#1454). Everything a reviewer should never have to spot by eye and
 * that does NOT need a 60-140 minute simulation: malformed or over-broad registrations (stricter than
 * `findInvalidGapRegistrations`, which is kept for the matrix's own `afterAll`) and owner liveness against a recorded
 * snapshot. Pure: callers pass the matrix and the snapshot, so tests can build a bad register on purpose.
 */
export function findRegistryIntegrityProblems(
  context: GapRegistryContext,
  gaps: readonly KnownCampaignGap[] = KNOWN_CAMPAIGN_GAPS,
): string[] {
  const problems = [...findInvalidGapRegistrations(gaps)];
  const turnsBySeed = new Map(context.scenarios.map(s => [s.seed, s.turns]));
  const seen = new Set<string>();
  const ownersInUse = new Set<string>();
  for (const gap of gaps) {
    const label = `${gap.code} (${gap.issue})`;
    if (!/^#[1-9]\d*$/.test(gap.issue)) problems.push(`${label}: issue must look like '#1234'`);
    if (gap.why.trim().length < 40) problems.push(`${label}: why must explain the stall (>= 40 chars)`);
    const key = `${gap.code}|${gap.issue}`;
    if (seen.has(key)) problems.push(`${label}: registered twice; merge the entries`);
    seen.add(key);

    if (gap.scenarios !== 'any') {
      for (const seed of gap.scenarios) {
        if (!turnsBySeed.has(seed)) problems.push(`${label}: scenario '${seed}' is not in the matrix`);
      }
      if (gap.accepted === undefined) {
        problems.push(`${label}: must be scoped with 'accepted' (a civ and a maxRounds budget per scenario)`);
      }
    }
    for (const o of gap.accepted ?? []) {
      const where = `${label} [${o.scenario}]`;
      if (o.civId === undefined) problems.push(`${where}: names no civ; an unscoped civ accepts a different civ's defect`);
      if (o.maxRounds === undefined) problems.push(`${where}: has no maxRounds budget`);
      const turns = turnsBySeed.get(o.scenario);
      if (turns !== undefined && o.maxRounds !== undefined && o.maxRounds > turns) {
        problems.push(`${where}: maxRounds ${o.maxRounds} exceeds the scenario's ${turns} rounds, so it can never bind`);
      }
    }

    ownersInUse.add(gap.issue);
    const state = context.ownerStates[gap.issue];
    if (state === undefined) {
      problems.push(`${label}: owner ${gap.issue} is not in known-gap-owners.json; run ./scripts/dev.sh known-gap-owners-refresh`);
    } else if (state === 'closed') {
      if (!(gap.ownerClosedRationale && gap.ownerClosedRationale.trim().length >= 60)) {
        problems.push(`${label}: owner ${gap.issue} is CLOSED; reassign to an open issue (or justify with ownerClosedRationale)`);
      }
    } else if (gap.ownerClosedRationale) {
      problems.push(`${label}: ownerClosedRationale is only meaningful when the owner is closed`);
    }
  }
  for (const issue of Object.keys(context.ownerStates)) {
    if (!ownersInUse.has(issue)) problems.push(`known-gap-owners.json lists ${issue}, which no register entry uses; refresh it`);
  }
  return problems;
}

/**
 * Run both ratchet directions over the findings collected across a set of
 * scenarios. `findingsByScenario` must contain an entry for EVERY scenario the
 * matrix ran (even those with no findings), or direction (2) cannot tell a
 * fixed gap from an un-run scenario. `gaps` defaults to the register; tests pass their own.
 */
export function evaluateGapRatchet(
  findingsByScenario: ReadonlyMap<string, ReadonlyArray<RatchetFinding>>,
  gaps: readonly KnownCampaignGap[] = KNOWN_CAMPAIGN_GAPS,
): GapRatchetResult {
  const ranScenarios = new Set(findingsByScenario.keys());
  const unknownFindings: GapRatchetResult['unknownFindings'] = [];

  for (const [scenario, findings] of findingsByScenario) {
    for (const finding of findings) {
      const sameCode = gaps.filter(gap => gap.code === finding.code);
      let covered = false;
      let reason: UnknownFindingReason = 'unregistered';
      for (const gap of sameCode) {
        if (gap.accepted) {
          const verdict = scopedVerdict(gap, scenario, finding);
          if (verdict === 'covered') { covered = true; break; }
          if (verdict === 'worsened') reason = 'worsened';
          else if (verdict === 'new-civ' && reason !== 'worsened') reason = 'new-civ';
        } else if (gap.scenarios === 'any' || gap.scenarios.includes(scenario)) {
          covered = true;
          break;
        }
      }
      if (!covered) {
        unknownFindings.push({ scenario, code: finding.code, detail: finding.detail, reason });
      }
    }
  }

  const staleOccurrences: GapRatchetResult['staleOccurrences'] = [];
  const staleGaps = gaps.filter(gap => {
    if (gap.accepted) {
      for (const occurrence of gap.accepted) {
        if (!ranScenarios.has(occurrence.scenario)) continue;
        const reproduces = (findingsByScenario.get(occurrence.scenario) ?? []).some(finding =>
          finding.code === gap.code && (occurrence.civId === undefined || occurrence.civId === finding.civId));
        if (!reproduces) staleOccurrences.push({ gap, occurrence });
      }
      return false;
    }
    const expectedIn = gap.scenarios === 'any'
      ? [...ranScenarios]
      : gap.scenarios.filter(seed => ranScenarios.has(seed));
    if (expectedIn.length === 0) return false; // none of its scenarios ran this pass
    return !expectedIn.some(scenario =>
      (findingsByScenario.get(scenario) ?? []).some(finding => finding.code === gap.code));
  });

  return { unknownFindings, staleGaps, staleOccurrences };
}
