import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  findRegistryIntegrityProblems,
  KNOWN_CAMPAIGN_GAPS,
  type GapRegistryContext,
  type KnownCampaignGap,
} from '../simulation/long-horizon/known-campaign-gaps';
// @ts-expect-error -- plain ESM script with no type declarations; only its pure parser is imported.
import { registeredOwners } from '../../scripts/known-gap-owners.mjs';

/**
 * #1454: the cheap, offline half of the long-horizon known-gap ratchet. The ratchet itself needs a 1-3 hour matrix
 * run, and tests/simulation/long-horizon/** is excluded from ordinary discovery, so nothing used to notice a register
 * that named a CLOSED owner or an unbounded, unscoped, or non-existent occurrence. This test runs in the ordinary
 * suite and never calls GitHub: owner state comes from the committed snapshot `known-gap-owners.json`, refreshed by
 * `./scripts/dev.sh known-gap-owners-refresh` and checked live by `./scripts/dev.sh known-gap-owners` (also run
 * before every long run by run-ai-long-horizon.sh).
 */

const ROOT = process.cwd();
const REGISTER_PATH = resolve(ROOT, 'tests/simulation/long-horizon/known-campaign-gaps.ts');
const SNAPSHOT_PATH = resolve(ROOT, 'tests/simulation/long-horizon/known-gap-owners.json');

interface Snapshot { owners: Record<string, 'open' | 'closed'> }

const scenarios = [
  { seed: 's1', turns: 300 },
  { seed: 's2', turns: 250 },
];

function context(owners: Record<string, 'open' | 'closed'>): GapRegistryContext {
  return { scenarios, ownerStates: owners };
}

const good: KnownCampaignGap = {
  code: 'production-idle',
  issue: '#7',
  why: 'a stall that is described well enough to be useful to a reader',
  scenarios: ['s1'],
  accepted: [{ scenario: 's1', civId: 'ai-1', maxRounds: 40 }],
};

describe('known-gap registry integrity (#1454)', () => {
  let realScenarios: GapRegistryContext['scenarios'];

  beforeAll(async () => {
    const { LONG_HORIZON_SCENARIOS } = await import('../simulation/long-horizon/campaign-scenarios');
    realScenarios = LONG_HORIZON_SCENARIOS.map(s => ({ seed: s.seed, turns: s.turns }));
  }, 60_000);

  it('the shipped register is well-formed, scoped, bounded and owned by OPEN issues', () => {
    const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot;
    expect(KNOWN_CAMPAIGN_GAPS.length).toBeGreaterThan(0);
    expect(findRegistryIntegrityProblems({ scenarios: realScenarios, ownerStates: snapshot.owners })).toEqual([]);
  });

  it('the snapshot parser in scripts/known-gap-owners.mjs sees exactly the owners the register declares', () => {
    const fromScript = registeredOwners(readFileSync(REGISTER_PATH, 'utf8')) as string[];
    const fromRegister = [...new Set(KNOWN_CAMPAIGN_GAPS.map(g => g.issue))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    expect(fromScript).toEqual(fromRegister);
  });

  it('a well-formed fixture entry has no problems', () => {
    expect(findRegistryIntegrityProblems(context({ '#7': 'open' }), [good])).toEqual([]);
  });

  it('rejects a CLOSED owner unless a written rationale justifies it', () => {
    const closed = context({ '#7': 'closed' });
    expect(findRegistryIntegrityProblems(closed, [good])).toEqual([expect.stringContaining('CLOSED')]);
    const justified = { ...good, ownerClosedRationale: 'Closed as won-t-fix on purpose; the accepted behaviour is the design and #7 records that decision.' };
    expect(findRegistryIntegrityProblems(closed, [justified])).toEqual([]);
    expect(findRegistryIntegrityProblems(closed, [{ ...good, ownerClosedRationale: 'too short' }])).toEqual([expect.stringContaining('CLOSED')]);
  });

  it('rejects a rationale on an owner that is open (it would hide a later close)', () => {
    const open = { ...good, ownerClosedRationale: 'Closed as won-t-fix on purpose; the accepted behaviour is the design and #7 records that decision.' };
    expect(findRegistryIntegrityProblems(context({ '#7': 'open' }), [open])).toEqual([expect.stringContaining('only meaningful when the owner is closed')]);
  });

  it('rejects an owner missing from the snapshot, and a snapshot owner nothing uses', () => {
    expect(findRegistryIntegrityProblems(context({}), [good])).toEqual([expect.stringContaining('not in known-gap-owners.json')]);
    expect(findRegistryIntegrityProblems(context({ '#7': 'open', '#8': 'open' }), [good])).toEqual([expect.stringContaining('#8')]);
  });

  it('rejects a malformed issue reference and an empty explanation', () => {
    const problems = findRegistryIntegrityProblems(context({ '1234': 'open' }), [{ ...good, issue: '1234', why: 'x' }]);
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringContaining("issue must look like '#1234'"),
      expect.stringContaining('why must explain the stall'),
    ]));
  });

  it('rejects over-broad registrations: unscoped, no civ, no budget', () => {
    const noScope = { ...good, accepted: undefined } as KnownCampaignGap;
    expect(findRegistryIntegrityProblems(context({ '#7': 'open' }), [noScope])).toEqual(expect.arrayContaining([
      expect.stringContaining("must be scoped with 'accepted'"),
    ]));
    const noCivNoBudget = { ...good, accepted: [{ scenario: 's1' }] };
    expect(findRegistryIntegrityProblems(context({ '#7': 'open' }), [noCivNoBudget])).toEqual(expect.arrayContaining([
      expect.stringContaining('names no civ'),
      expect.stringContaining('has no maxRounds budget'),
    ]));
  });

  it('rejects a scenario that is not in the matrix and a budget that can never bind', () => {
    const phantom = { ...good, scenarios: ['nope'], accepted: [{ scenario: 'nope', civId: 'ai-1', maxRounds: 5 }] };
    expect(findRegistryIntegrityProblems(context({ '#7': 'open' }), [phantom])).toEqual(expect.arrayContaining([
      expect.stringContaining("scenario 'nope' is not in the matrix"),
    ]));
    const unbounded = { ...good, accepted: [{ scenario: 's1', civId: 'ai-1', maxRounds: 301 }] };
    expect(findRegistryIntegrityProblems(context({ '#7': 'open' }), [unbounded])).toEqual([expect.stringContaining('can never bind')]);
  });

  it('rejects the same code and owner registered twice', () => {
    expect(findRegistryIntegrityProblems(context({ '#7': 'open' }), [good, good])).toEqual(expect.arrayContaining([
      expect.stringContaining('registered twice'),
    ]));
  });

  it('still rejects a wildcard without a rationale (the pre-existing rule is composed in)', () => {
    const wildcard: KnownCampaignGap = { ...good, scenarios: 'any', accepted: undefined };
    expect(findRegistryIntegrityProblems(context({ '#7': 'open' }), [wildcard])).toEqual(expect.arrayContaining([
      expect.stringContaining('wildcardRationale'),
    ]));
  });
});
