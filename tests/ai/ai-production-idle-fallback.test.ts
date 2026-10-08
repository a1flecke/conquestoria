import { describe, expect, it } from 'vitest';
import {
  applyAIProduction,
  applyAIProductionWithReport,
  chooseAIIdleProductionMode,
  generateAIProductionCandidates,
} from '@/ai/ai-production';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { BUILDINGS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import { getAvailableTechs } from '@/systems/tech-system';
import { setIdleProduction } from '@/systems/planning-system';
import type { AIForceDemand } from '@/ai/ai-unit-assignment';
import type { GameState, PersonalityTraits } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';

const calm: PersonalityTraits = { traits: [], warLikelihood: 0, diplomacyFocus: 0, expansionDrive: 0 };

function setupState(completed: string[] = []): GameState {
  const state = createNewGame(undefined, 'ai-idle-fallback', 'small');
  const civ = state.civilizations['ai-1'];
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  civ.cities = [];
  const city = foundCity(civ.id, settler.position, state.map, state.idCounters);
  city.id = 'city-a';
  city.population = 4;
  city.productionQueue = [];
  state.cities['city-a'] = city;
  civ.cities.push('city-a');
  for (const coord of [city.position, ...hexNeighbors(city.position)]) {
    const tile = state.map.tiles[hexKey(coord)];
    if (tile && (tile.terrain === 'coast' || tile.terrain === 'ocean')) tile.terrain = 'plains';
  }
  civ.techState.completed = [...completed];
  civ.gold = 500;
  return state;
}


/** A mature city: every building already built, so ordinary selection has nothing to enqueue. */
function setupMatureState(completed: string[] = []): GameState {
  const state = setupState(completed);
  state.cities['city-a'].buildings = Object.keys(BUILDINGS);
  return state;
}

function demand(role: AIForceDemand['role'], priority = 100, sourcePlanIds = ['primary']): AIForceDemand {
  return { role, desired: 1, assigned: 0, missing: 1, priority, sourcePlanIds };
}

/** Strain is derived from unpaid/total maintenance, so seed a status whose whole upkeep is unpaid. */
function strain(state: GameState): void {
  state.economyStatusByCiv = {
    'ai-1': {
      turn: state.turn, grossGoldIncome: 0, buildingMaintenance: 10, unitMaintenance: 0,
      netGoldPerTurn: -10, unpaidMaintenance: 10, strainLevel: 'critical',
    },
  };
}

function withResearch(state: GameState): void {
  const civ = state.civilizations['ai-1'];
  // The costliest tech in the tree, so one turn's science cannot finish it and progress stays comparable.
  civ.techState.currentResearch = [...TECH_TREE].sort((a, b) => b.cost - a.cost)[0].id;
  civ.techState.researchProgress = 0;
}

function allTechIds(): string[] {
  return TECH_TREE.map(tech => tech.id);
}

describe('AI idle-production fallback', () => {
  it('precondition: the mature fixture really has no candidate', () => {
    expect(generateAIProductionCandidates(setupMatureState(), 'ai-1', 'city-a', [], calm)).toEqual([]);
  });

  it('converts to science when research remains, and a processed turn credits real research', () => {
    const state = setupMatureState();
    withResearch(state);
    const before = state.civilizations['ai-1'].techState.researchProgress;

    const after = applyAIProduction(state, 'ai-1', [], calm);

    expect(after.cities['city-a'].productionQueue).toEqual([]);
    expect(after.cities['city-a'].idleProduction).toBe('science');
    expect(state.cities['city-a'].idleProduction ?? null).toBeNull(); // input untouched

    const fixed = processTurn(structuredClone(after), new EventBus());
    const wasted = processTurn(structuredClone(state), new EventBus()); // pre-fix behaviour
    expect(fixed.civilizations['ai-1'].techState.researchProgress)
      .toBeGreaterThan(wasted.civilizations['ai-1'].techState.researchProgress);
    expect(wasted.civilizations['ai-1'].techState.researchProgress).toBeGreaterThanOrEqual(before);
  });

  it('converts to gold under treasury strain, and a processed turn credits real gold', () => {
    const state = setupMatureState();
    withResearch(state);
    strain(state);

    const after = applyAIProduction(state, 'ai-1', [], calm);
    expect(after.cities['city-a'].idleProduction).toBe('gold');

    const fixed = processTurn(structuredClone(after), new EventBus());
    const wasted = processTurn(structuredClone(state), new EventBus());
    expect(fixed.civilizations['ai-1'].gold).toBeGreaterThan(wasted.civilizations['ai-1'].gold);
  });

  it('does not strand output in science when no research remains', () => {
    const state = setupMatureState(allTechIds());
    state.civilizations['ai-1'].techState.currentResearch = null;
    expect(getAvailableTechs(state.civilizations['ai-1'].techState)).toEqual([]);
    expect(chooseAIIdleProductionMode(state, 'ai-1')).toBe('gold');
    expect(generateAIProductionCandidates(state, 'ai-1', 'city-a', [], calm)).toEqual([]);
    expect(applyAIProduction(state, 'ai-1', [], calm).cities['city-a'].idleProduction).toBe('gold');
  });

  it('leaves a city with a candidate to ordinary selection and sets no conversion', () => {
    const state = setupState();
    withResearch(state);
    const { state: after, report } = applyAIProductionWithReport(state, 'ai-1', [], calm);
    expect(after.cities['city-a'].productionQueue.length).toBe(1);
    expect(after.cities['city-a'].idleProduction ?? null).toBeNull();
    expect(report.converted).toEqual({});
  });

  it('an emergency force demand still beats conversion', () => {
    const state = setupMatureState(['gathering', 'siege-warfare']);
    state.marketplace!.purchasedResources = [{ civId: 'ai-1', resource: 'stone', expiresOnTurn: state.turn + 10 }];
    withResearch(state);
    const after = applyAIProduction(state, 'ai-1', [demand('siege', 900, ['defend:city-a'])], calm);
    expect(after.cities['city-a'].productionQueue).toEqual(['catapult']);
    expect(after.cities['city-a'].idleProduction ?? null).toBeNull();
  });

  it('with two idle cities and one demand, the loser converts instead of wasting output', () => {
    const state = setupMatureState(['gathering', 'siege-warfare']);
    state.marketplace!.purchasedResources = [{ civId: 'ai-1', resource: 'stone', expiresOnTurn: state.turn + 10 }];
    withResearch(state);
    const civ = state.civilizations['ai-1'];
    const second = { ...state.cities['city-a'], id: 'city-b', productionQueue: [] as string[] };
    second.position = { q: second.position.q + 6, r: second.position.r };
    state.cities['city-b'] = second;
    civ.cities.push('city-b');

    const { state: after, report } = applyAIProductionWithReport(state, 'ai-1', [demand('siege')], calm);
    const queued = ['city-a', 'city-b'].filter(id => after.cities[id].productionQueue.length > 0);
    expect(queued).toHaveLength(1);
    const other = ['city-a', 'city-b'].find(id => !queued.includes(id))!;
    expect(after.cities[other].idleProduction).toBe('science');
    expect(Object.keys(report.converted)).toEqual([other]);
  });

  it('leaves an already queued city untouched, even one carrying a dormant idle mode', () => {
    const state = setupMatureState();
    withResearch(state);
    state.cities['city-a'] = { ...setIdleProduction(state.cities['city-a'], 'gold'), productionQueue: ['library'] };
    const after = applyAIProduction(state, 'ai-1', [], calm);
    expect(after).toBe(state);
  });

  it('a dormant idle mode earns nothing while a queue is active (no double credit)', () => {
    const state = setupMatureState();
    withResearch(state);
    const dormant = structuredClone(state);
    dormant.cities['city-a'] = { ...setIdleProduction(dormant.cities['city-a'], 'gold'), productionQueue: ['library'] };
    const plain = structuredClone(state);
    plain.cities['city-a'] = { ...plain.cities['city-a'], productionQueue: ['library'] };
    expect(processTurn(dormant, new EventBus()).civilizations['ai-1'].gold)
      .toBe(processTurn(plain, new EventBus()).civilizations['ai-1'].gold);
  });

  it('resumes ordinary construction when a candidate appears, with the conversion dormant', () => {
    const mature = setupMatureState();
    withResearch(mature);
    const converted = applyAIProduction(mature, 'ai-1', [], calm);
    expect(converted.cities['city-a'].idleProduction).toBe('science');

    const reopened = structuredClone(converted);
    reopened.cities['city-a'].buildings = [];
    const resumed = applyAIProduction(reopened, 'ai-1', [], calm);
    expect(resumed.cities['city-a'].productionQueue.length).toBe(1);
  });

  it('re-chooses the mode when conditions change, and is idempotent otherwise', () => {
    const state = setupMatureState();
    withResearch(state);
    const once = applyAIProduction(state, 'ai-1', [], calm);
    expect(applyAIProduction(once, 'ai-1', [], calm)).toBe(once);
    strain(once);
    expect(applyAIProduction(once, 'ai-1', [], calm).cities['city-a'].idleProduction).toBe('gold');
  });

  it('is deterministic and leaves the input state untouched', () => {
    const state = setupMatureState();
    withResearch(state);
    const snapshot = structuredClone(state);
    const a = applyAIProduction(state, 'ai-1', [], calm);
    const b = applyAIProduction(state, 'ai-1', [], calm);
    expect(a).toEqual(b);
    expect(state).toEqual(snapshot);
  });

  it('never touches human-owned or other civs\' cities', () => {
    const state = setupMatureState();
    withResearch(state);
    const humanId = Object.keys(state.civilizations).find(id => id !== 'ai-1')!;
    const humanCityIds = state.civilizations[humanId].cities;
    const after = applyAIProduction(state, 'ai-1', [], calm);
    for (const id of humanCityIds) expect(after.cities[id]).toBe(state.cities[id]);
  });

  it('survives a JSON save/reload round trip unchanged (no schema change)', () => {
    const state = setupMatureState();
    withResearch(state);
    const after = applyAIProduction(state, 'ai-1', [], calm);
    const reloaded = JSON.parse(JSON.stringify(after)) as GameState;
    expect(reloaded.cities['city-a'].idleProduction).toBe('science');
    expect(applyAIProduction(reloaded, 'ai-1', [], calm)).toEqual(reloaded);
  });
});
