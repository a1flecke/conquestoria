import { describe, expect, it } from 'vitest';
import {
  choosePrimaryObjective,
  getObjectiveApproximateDistance,
  resolveObjectiveTravelCandidates,
  scoreObjectiveCandidate,
  type AIObjectiveCandidate,
  type AIObjectiveTravelCandidate,
} from '@/ai/ai-objective-scoring';

function candidate(
  id: string,
  travelTurns: number,
  strategicValue: number,
  overrides: Partial<AIObjectiveCandidate> = {},
): AIObjectiveCandidate {
  return {
    objective: 'capture',
    target: { kind: 'city', id, lastKnownPosition: { q: travelTurns, r: 0 } },
    theaterId: 'region-0',
    travelTurns,
    strategicValue,
    expectedLossRatio: 0,
    supplyDistance: travelTurns,
    explicitDistantReasons: [],
    requiredRoles: { capture: 1 },
    ...overrides,
  };
}

describe('AI objective scoring', () => {
  it('chooses a close viable city over a much richer distant capital', () => {
    const result = choosePrimaryObjective({
      actorId: 'ai-1',
      turn: 10,
      candidates: [
        candidate('close', 4, 45),
        candidate('far-capital', 16, 100),
      ],
      availableRoles: { capture: 2 },
    });

    expect(result.plan?.target).toMatchObject({ kind: 'city', id: 'close' });
    expect(result.trace.candidates.find(entry => entry.id.includes('far-capital'))?.eligible)
      .toBe(false);
  });

  it('makes a distant aggressor eligible without bypassing transport feasibility', () => {
    const distant = candidate('aggressor', 14, 90, {
      explicitDistantReasons: ['retaliate-recent-attack'],
      requiredRoles: { capture: 1, transport: 1 },
    });
    const local = candidate('close', 3, 30);

    const withoutTransport = choosePrimaryObjective({
      actorId: 'ai-1',
      turn: 10,
      candidates: [local, distant],
      availableRoles: { capture: 2 },
    });
    expect(withoutTransport.plan?.target).toMatchObject({ kind: 'city', id: 'close' });
    expect(withoutTransport.demands).toContain('transport');

    const withTransport = choosePrimaryObjective({
      actorId: 'ai-1',
      turn: 10,
      candidates: [local, distant],
      availableRoles: { capture: 2, transport: 1 },
    });
    expect(withTransport.trace.candidates.find(entry => entry.id.includes('aggressor')))
      .toMatchObject({ eligible: true, reasonCodes: ['retaliate-recent-attack'] });
  });

  it('prefers useful local development over unsupported distant conquest', () => {
    const result = choosePrimaryObjective({
      actorId: 'ai-1',
      turn: 10,
      candidates: [
        candidate('distant-capital', 12, 100),
        candidate('iron', 3, 50, {
          objective: 'secure-resource',
          target: { kind: 'resource', resource: 'iron', position: { q: 3, r: 0 } },
          requiredRoles: { 'resource-expedition': 1 },
        }),
      ],
      availableRoles: { capture: 2, 'resource-expedition': 1 },
    });

    expect(result.plan?.objective).toBe('secure-resource');
  });

  it('allows regional expansion when there is no closer alternative', () => {
    const result = choosePrimaryObjective({
      actorId: 'ai-1',
      turn: 10,
      candidates: [candidate('only-option', 12, 70)],
      availableRoles: { capture: 1 },
    });

    expect(result.plan?.target).toMatchObject({ kind: 'city', id: 'only-option' });
    expect(result.plan?.reasonCodes).toContain('no-local-alternative');
  });

  it('keeps an existing distant war eligible', () => {
    const result = choosePrimaryObjective({
      actorId: 'ai-1',
      turn: 10,
      candidates: [
        candidate('close', 3, 35),
        candidate('war-target', 11, 75, {
          explicitDistantReasons: ['continue-active-war'],
        }),
      ],
      availableRoles: { capture: 2 },
    });

    expect(result.trace.candidates.find(entry => entry.id.includes('war-target')))
      .toMatchObject({ eligible: true, reasonCodes: ['continue-active-war'] });
  });

  it('turns an offensive region rumor into a recon demand instead of an attack', () => {
    const result = choosePrimaryObjective({
      actorId: 'ai-1',
      turn: 10,
      candidates: [candidate('rumor', 5, 80, {
        target: { kind: 'region', id: 'rumored-seat', anchor: { q: 5, r: 0 } },
      })],
      availableRoles: { capture: 1 },
    });

    expect(result.plan).toBeNull();
    expect(result.demands).toContain('recon');
  });

  it('excludes unreachable objectives even with a retaliation reason', () => {
    const result = choosePrimaryObjective({
      actorId: 'ai-1',
      turn: 10,
      candidates: [candidate('unreachable', Number.POSITIVE_INFINITY, 100, {
        explicitDistantReasons: ['retaliate-recent-attack'],
      })],
      availableRoles: { capture: 1 },
    });

    expect(result.plan).toBeNull();
  });

  it.each([
    ['homeland-secure'],
    ['nearby-opportunity'],
    ['opportunistic-raid'],
  ] as const)('does not let %s bypass locality', reason => {
    const result = choosePrimaryObjective({
      actorId: 'ai-1',
      turn: 10,
      candidates: [
        candidate('close', 3, 30),
        candidate('far', 15, 100, { explicitDistantReasons: [reason] }),
      ],
      availableRoles: { capture: 2 },
    });

    expect(result.trace.candidates.find(entry => entry.id.includes(':far'))?.eligible).toBe(false);
  });

  it('uses wrapped horizontal distance for approximate candidate ordering', () => {
    const map = { width: 20, height: 10, wrapsHorizontally: true };
    expect(getObjectiveApproximateDistance(map, { q: 0, r: 0 }, { q: 19, r: 0 })).toBe(1);
  });

  it('caps canonical path queries and caches duplicate travel requests for one pass', () => {
    const map = {
      width: 40,
      height: 20,
      wrapsHorizontally: false,
      rivers: [],
      tiles: {},
    };
    const inputs: AIObjectiveTravelCandidate[] = Array.from({ length: 30 }, (_, index) => ({
      ...candidate(`city-${index}`, 0, 50),
      start: { q: 0, r: 0 },
      domain: 'land',
      movementPoints: 2,
      completedMovementTechHash: 'none',
    }));
    inputs.push({ ...inputs[0], objective: 'raid' });
    let queries = 0;

    const resolved = resolveObjectiveTravelCandidates(map, inputs, (from, to) => {
      queries += 1;
      return [from, to];
    });

    expect(resolved.length).toBeLessThanOrEqual(16);
    expect(queries).toBeLessThan(resolved.length);
    expect(queries).toBeLessThanOrEqual(24);
  });

  it('applies the documented score formula with bounded values', () => {
    const value = scoreObjectiveCandidate(candidate('score', 2, 80, {
      expectedLossRatio: 0.5,
      supplyDistance: 3,
      explicitDistantReasons: ['critical-resource'],
    }));

    expect(value).toBeCloseTo(80 + 35 - (8 + 3) - 17.5 - 6);
  });

  it('breaks equal-score ties by stable target identity', () => {
    const result = choosePrimaryObjective({
      actorId: 'ai-1',
      turn: 10,
      candidates: [candidate('beta', 3, 50), candidate('alpha', 3, 50)],
      availableRoles: { capture: 2 },
    });

    expect(result.plan?.target).toMatchObject({ kind: 'city', id: 'alpha' });
  });
});
