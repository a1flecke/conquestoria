import { describe, expect, it } from 'vitest';
import { getIdleExplorerUnitIds } from '@/ai/ai-exploration';
import { createEmptyMajorCivPlanPortfolio } from '@/core/opponent-ai-state';
import { createEmptyMajorCivPortfolio } from '@/ai/ai-plan-portfolio';
import type { Civilization, Unit } from '@/core/types';
import type { PreparedMajorCivPlan } from '@/ai/ai-prepared-turn';

const CIV_ID = 'ai-1';

function civ(unitIds: string[]): Civilization {
  return {
    id: CIV_ID,
    name: 'Test', color: '#ff0000', isHuman: false, civType: 'generic',
    cities: [], units: unitIds,
    techState: { completed: [], current: null, progress: 0 },
    gold: 0,
    visibility: { tiles: {} },
    score: 0,
    diplomacy: {
      relationships: {}, atWarWith: [], treatyRequestsSent: [], treatyRequestsReceived: [],
      vassalage: {
        overlord: null, vassals: [], protectionScore: 100,
        protectionTimers: [], peakCities: 0, peakMilitary: 0,
      },
    },
  } as unknown as Civilization;
}

function unit(id: string, type: Unit['type'], overrides: Partial<Unit> = {}): Unit {
  return {
    id, type, owner: CIV_ID, position: { q: 0, r: 0 },
    movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false,
    ...overrides,
  } as unknown as Unit;
}

function prepared(overrides: Partial<{
  assignmentsByPlanId: Record<string, string[]>;
  recoveryUnitIds: string[];
  upgradeRoutesByUnitId: Record<string, { cityId: string; createdTurn: number }>;
}> = {}): PreparedMajorCivPlan {
  const portfolio = { ...createEmptyMajorCivPortfolio(), ...createEmptyMajorCivPlanPortfolio() };
  return {
    civId: CIV_ID,
    perception: {} as PreparedMajorCivPlan['perception'],
    portfolio: {
      ...portfolio,
      upgradeRoutesByUnitId: overrides.upgradeRoutesByUnitId ?? {},
    },
    assignments: {
      portfolio,
      assignmentsByPlanId: overrides.assignmentsByPlanId ?? {},
      recoveryUnitIds: overrides.recoveryUnitIds ?? [],
      forceDemands: [],
      rejectedByUnitId: {},
    },
    forceDemands: [],
    traces: [],
  };
}

describe('getIdleExplorerUnitIds', () => {
  it('includes an idle combat-capable unit with movement left', () => {
    const units = { warrior: unit('warrior', 'warrior') };
    const result = getIdleExplorerUnitIds(civ(['warrior']), units, prepared());
    expect(result).toEqual(['warrior']);
  });

  it('excludes a unit claimed by any plan this round', () => {
    const units = { warrior: unit('warrior', 'warrior') };
    const result = getIdleExplorerUnitIds(
      civ(['warrior']),
      units,
      prepared({ assignmentsByPlanId: { 'defend:city-1': ['warrior'] } }),
    );
    expect(result).toEqual([]);
  });

  it('excludes a unit retreating to heal', () => {
    const units = { warrior: unit('warrior', 'warrior', { health: 20 }) };
    const result = getIdleExplorerUnitIds(
      civ(['warrior']),
      units,
      prepared({ recoveryUnitIds: ['warrior'] }),
    );
    expect(result).toEqual([]);
  });

  it('excludes a unit mid-upgrade-route', () => {
    const units = { warrior: unit('warrior', 'warrior') };
    const result = getIdleExplorerUnitIds(
      civ(['warrior']),
      units,
      prepared({ upgradeRoutesByUnitId: { warrior: { cityId: 'city-1', createdTurn: 1 } } }),
    );
    expect(result).toEqual([]);
  });

  it('excludes a non-combat unit', () => {
    // strength 0: settlers, workers, missionaries all have their own dedicated
    // administrative or plan-driven dispatch and must never be diverted here.
    const units = {
      settler: unit('settler', 'settler'),
      worker: unit('worker', 'worker'),
    };
    const result = getIdleExplorerUnitIds(civ(['settler', 'worker']), units, prepared());
    expect(result).toEqual([]);
  });

  it('excludes a unit that has already acted', () => {
    const units = { warrior: unit('warrior', 'warrior', { hasActed: true }) };
    const result = getIdleExplorerUnitIds(civ(['warrior']), units, prepared());
    expect(result).toEqual([]);
  });

  it('excludes a unit with no movement left', () => {
    const units = { warrior: unit('warrior', 'warrior', { movementPointsLeft: 0 }) };
    const result = getIdleExplorerUnitIds(civ(['warrior']), units, prepared());
    expect(result).toEqual([]);
  });

  it('excludes a unit already auto-exploring, even with unspent movement', () => {
    // turn-manager.ts's per-civ turn-start loop already re-issues this unit's move
    // every round on its own (the same mechanism the player's auto-explore button
    // drives). Reprocessing it here too would move it twice in the same round
    // whenever its chosen destination didn't consume its full movement budget.
    const units = {
      warrior: unit('warrior', 'warrior', {
        automation: { mode: 'auto-explore', startedTurn: 1, lastTargets: [] },
      }),
    };
    const result = getIdleExplorerUnitIds(civ(['warrior']), units, prepared());
    expect(result).toEqual([]);
  });

  it('returns multiple eligible units, one civ can send more than one to explore', () => {
    const units = {
      warrior: unit('warrior', 'warrior'),
      scout: unit('scout', 'scout'),
    };
    const result = getIdleExplorerUnitIds(civ(['warrior', 'scout']), units, prepared());
    expect(result.sort()).toEqual(['scout', 'warrior']);
  });
});
