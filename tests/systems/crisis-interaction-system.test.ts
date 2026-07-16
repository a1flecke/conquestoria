import { describe, it, expect } from 'vitest';
import type { ActiveCrisis, City, GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { getCityAppeaseCost } from '@/systems/faction-system';
import {
  CRISIS_INTERACTION_DEFINITIONS,
  getCrisisInteractionDefinition,
  resolveInteractionTechRequired,
  getWitnessCivIds,
  applyInteractionReputation,
  applyOpportunisticWarPenaltyIfCrisisStruck,
  getActiveCrisisForCiv,
  canSendAid,
  applySendAid,
} from '@/systems/crisis-interaction-system';

// actor=civA, target=civB, witness=civC (met both), non-witness=civD (met only actor).
function threeCivState(overrides: Partial<GameState> = {}): GameState {
  const ids = ['civA', 'civB', 'civC', 'civD'];
  return {
    turn: 10,
    cities: {},
    units: {},
    map: { width: 1, height: 1, wrapsHorizontally: false, rivers: [], tiles: {} },
    civilizations: {
      civA: { id: 'civA', name: 'A', isHuman: true, cities: [], units: [], visibility: { tiles: {} }, diplomacy: createDiplomacyState(ids, 'civA'), knownCivilizations: ['civB', 'civC', 'civD'] },
      civB: { id: 'civB', name: 'B', isHuman: false, cities: [], units: [], visibility: { tiles: {} }, diplomacy: createDiplomacyState(ids, 'civB'), knownCivilizations: ['civA', 'civC'] },
      civC: { id: 'civC', name: 'C', isHuman: false, cities: [], units: [], visibility: { tiles: {} }, diplomacy: createDiplomacyState(ids, 'civC'), knownCivilizations: ['civA', 'civB'] },
      civD: { id: 'civD', name: 'D', isHuman: false, cities: [], units: [], visibility: { tiles: {} }, diplomacy: createDiplomacyState(ids, 'civD'), knownCivilizations: ['civA'] },
    },
    ...overrides,
  } as unknown as GameState;
}

describe('CRISIS_INTERACTION_DEFINITIONS', () => {
  it('ships hunt_their_foe, send_aid, exploit_weakness, and sabotage_relief rows', () => {
    const ids = CRISIS_INTERACTION_DEFINITIONS.map(def => def.id);
    expect(ids).toEqual(['hunt_their_foe', 'send_aid', 'exploit_weakness', 'sabotage_relief']);
  });

  it('exploit_weakness deltas are -15 target / -8 witness (MR7)', () => {
    const def = getCrisisInteractionDefinition('exploit_weakness')!;
    expect(def.targetReputationDelta).toBe(-15);
    expect(def.witnessReputationDelta).toBe(-8);
    expect(def.techRequired).toBe('diplomatic-networks');
  });

  it('sabotage_relief deltas are -25 target / -8 witness (MR7)', () => {
    const def = getCrisisInteractionDefinition('sabotage_relief')!;
    expect(def.targetReputationDelta).toBe(-25);
    expect(def.witnessReputationDelta).toBe(-8);
    expect(def.techRequired).toBe('covert-operations');
    expect(def.kind).toBe('covert');
  });

  it('hunt_their_foe requires no tech', () => {
    expect(getCrisisInteractionDefinition('hunt_their_foe')?.techRequired).toBeNull();
  });

  it('send_aid requires medicine for outbreak and trade-routes for catastrophe (per-archetype map)', () => {
    const def = getCrisisInteractionDefinition('send_aid')!;
    expect(resolveInteractionTechRequired(def, 'outbreak')).toBe('medicine');
    expect(resolveInteractionTechRequired(def, 'catastrophe')).toBe('trade-routes');
  });

  it('send_aid resolves to undefined (never satisfiable) for a hunt archetype -- not a send-aid hook', () => {
    const def = getCrisisInteractionDefinition('send_aid')!;
    expect(resolveInteractionTechRequired(def, 'hunt')).toBeUndefined();
  });
});

describe('getWitnessCivIds', () => {
  it('includes only civs that have met BOTH actor and target, excluding actor/target themselves', () => {
    const state = threeCivState();
    const witnesses = getWitnessCivIds(state, 'civA', 'civB');
    expect(witnesses).toEqual(['civC']);
    expect(witnesses).not.toContain('civA');
    expect(witnesses).not.toContain('civB');
    expect(witnesses).not.toContain('civD'); // met actor only, not target
  });

  it('returns an empty list when no third civ has met both parties (negative)', () => {
    const state = threeCivState();
    // hasMetCivilization is bidirectional -- clear the link from BOTH sides so civC
    // and civB genuinely have no mutual-contact evidence.
    state.civilizations.civC.knownCivilizations = ['civA'];
    state.civilizations.civB.knownCivilizations = ['civA'];
    expect(getWitnessCivIds(state, 'civA', 'civB')).toEqual([]);
  });
});

describe('applyInteractionReputation', () => {
  it('moves both sides of the actor<->target relationship', () => {
    const state = threeCivState();
    const def = getCrisisInteractionDefinition('hunt_their_foe')!;
    const next = applyInteractionReputation(state, 'civA', 'civB', def);
    expect(next.civilizations.civA.diplomacy.relationships.civB).toBe(15);
    expect(next.civilizations.civB.diplomacy.relationships.civA).toBe(15);
  });

  it('moves both sides of the actor<->witness relationship for every witness', () => {
    const state = threeCivState();
    const def = getCrisisInteractionDefinition('hunt_their_foe')!;
    const next = applyInteractionReputation(state, 'civA', 'civB', def);
    expect(next.civilizations.civA.diplomacy.relationships.civC).toBe(4);
    expect(next.civilizations.civC.diplomacy.relationships.civA).toBe(4);
  });

  it('never touches a non-witness civ (civD, which only met the actor)', () => {
    const state = threeCivState();
    const def = getCrisisInteractionDefinition('hunt_their_foe')!;
    const next = applyInteractionReputation(state, 'civA', 'civB', def);
    expect(next.civilizations.civD.diplomacy.relationships.civA).toBe(0);
    expect(next.civilizations.civA.diplomacy.relationships.civD).toBe(0);
  });

  it('clamps deltas at the +100 ceiling via modifyRelationship', () => {
    const state = threeCivState();
    state.civilizations.civA.diplomacy.relationships.civB = 90;
    state.civilizations.civB.diplomacy.relationships.civA = 90;
    const def = getCrisisInteractionDefinition('hunt_their_foe')!;
    const next = applyInteractionReputation(state, 'civA', 'civB', def);
    expect(next.civilizations.civA.diplomacy.relationships.civB).toBe(100);
    expect(next.civilizations.civB.diplomacy.relationships.civA).toBe(100);
  });
});

// actor=civA (the aid-giver), target=civB (the crisis-struck civ), witness=civC.
function sendAidState({
  archetype = 'outbreak' as ActiveCrisis['archetype'],
  actorGold = 200,
  actorTechs = ['medicine', 'trade-routes'],
  actorAlreadyAided = false,
  interactions = 'benign' as 'off' | 'benign' | 'full',
}: {
  archetype?: ActiveCrisis['archetype'];
  actorGold?: number;
  actorTechs?: string[];
  actorAlreadyAided?: boolean;
  interactions?: 'off' | 'benign' | 'full';
} = {}): { state: GameState; crisisId: string; cityId: string; goldCost: number } {
  const ids = ['civA', 'civB', 'civC'];
  const cityId = 'target-city';
  const city: City = {
    id: cityId, name: 'Carthage', owner: 'civB', position: { q: 0, r: 0 },
    population: 9, food: 0, foodNeeded: 20, buildings: [], productionQueue: [],
    productionProgress: 0, ownedTiles: [{ q: 0, r: 0 }], workedTiles: [],
    focus: 'balanced', maturity: 'outpost', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
  };
  const crisisId = 'crisis-1';
  const crisis: ActiveCrisis = {
    id: crisisId, flavorId: archetype === 'outbreak' ? 'plague' : 'earthquake', archetype,
    targetCivId: 'civB', cityIds: [cityId], tileKeys: [], startedTurn: 5, stage: archetype === 'outbreak' ? 'active' : 'recovery',
    turnsInStage: 2,
    ...(actorAlreadyAided ? { aidedByCivIds: ['civA'] } : {}),
  };

  const state: GameState = {
    turn: 10,
    cities: { [cityId]: city },
    units: {},
    map: { width: 1, height: 1, wrapsHorizontally: false, rivers: [], tiles: {} },
    settings: { aiCrisisInteractions: interactions } as GameState['settings'],
    civilizations: {
      civA: {
        id: 'civA', name: 'Rome', isHuman: true, cities: [], units: [], visibility: { tiles: {} },
        gold: actorGold,
        techState: { completed: actorTechs, currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        diplomacy: createDiplomacyState(ids, 'civA'), knownCivilizations: ['civB', 'civC'],
      },
      civB: {
        id: 'civB', name: 'Carthage', isHuman: false, cities: [cityId], units: [], visibility: { tiles: {} },
        gold: 50,
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        diplomacy: createDiplomacyState(ids, 'civB'), knownCivilizations: ['civA', 'civC'],
      },
      civC: {
        id: 'civC', name: 'Egypt', isHuman: false, cities: [], units: [], visibility: { tiles: {} },
        gold: 0,
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        diplomacy: createDiplomacyState(ids, 'civC'), knownCivilizations: ['civA', 'civB'],
      },
    },
    activeCrises: { [crisisId]: crisis },
  } as unknown as GameState;

  return { state, crisisId, cityId, goldCost: getCityAppeaseCost(city) };
}

describe('canSendAid', () => {
  it('returns ok:true with the correct gold cost for a valid outbreak aid attempt', () => {
    const { state, crisisId, goldCost } = sendAidState({ archetype: 'outbreak' });
    expect(canSendAid(state, 'civA', crisisId)).toEqual({ ok: true, goldCost });
  });

  it('rejects with flag-off when aiCrisisInteractions is off', () => {
    const { state, crisisId } = sendAidState({ interactions: 'off' });
    expect(canSendAid(state, 'civA', crisisId)).toEqual({ ok: false, reason: 'flag-off' });
  });

  it('rejects with unknown-civ for a nonexistent actor', () => {
    const { state, crisisId } = sendAidState();
    expect(canSendAid(state, 'no-such-civ', crisisId)).toEqual({ ok: false, reason: 'unknown-civ' });
  });

  it('rejects with no-crisis for a nonexistent crisis id', () => {
    const { state } = sendAidState();
    expect(canSendAid(state, 'civA', 'no-such-crisis')).toEqual({ ok: false, reason: 'no-crisis' });
  });

  it('rejects with already-aided once the actor has already aided this crisis, still reporting the cost', () => {
    const { state, crisisId, goldCost } = sendAidState({ actorAlreadyAided: true });
    expect(canSendAid(state, 'civA', crisisId)).toEqual({ ok: false, reason: 'already-aided', goldCost });
  });

  it('rejects with no-tech when the actor lacks medicine for an outbreak, naming the missing tech and cost', () => {
    const { state, crisisId, goldCost } = sendAidState({ archetype: 'outbreak', actorTechs: [] });
    expect(canSendAid(state, 'civA', crisisId)).toEqual({ ok: false, reason: 'no-tech', goldCost, techId: 'medicine' });
  });

  it('rejects with no-tech when the actor lacks trade-routes for a catastrophe, naming the missing tech and cost', () => {
    const { state, crisisId, goldCost } = sendAidState({ archetype: 'catastrophe', actorTechs: [] });
    expect(canSendAid(state, 'civA', crisisId)).toEqual({ ok: false, reason: 'no-tech', goldCost, techId: 'trade-routes' });
  });

  it('rejects with not-enough-gold when the actor cannot afford the cost, still reporting the cost', () => {
    const { state, crisisId, goldCost } = sendAidState({ actorGold: 0 });
    expect(canSendAid(state, 'civA', crisisId)).toEqual({ ok: false, reason: 'not-enough-gold', goldCost });
  });
});

describe('applySendAid', () => {
  it('outbreak: deducts gold from the actor only, schedules the remedy, marks aidedByCivIds, and applies bilateral reputation once', () => {
    const { state, crisisId, cityId, goldCost } = sendAidState({ archetype: 'outbreak' });
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:aid-sent', event => events.push(event));

    const next = applySendAid(state, 'civA', crisisId, bus);

    expect(next.civilizations.civA.gold).toBe(200 - goldCost);
    expect(next.civilizations.civB.gold).toBe(50); // target's own gold is untouched
    expect(next.activeCrises![crisisId].remedyCompletionByCity).toEqual({ [cityId]: state.turn + 2 });
    expect(next.activeCrises![crisisId].aidedByCivIds).toEqual(['civA']);
    expect(next.civilizations.civA.diplomacy.relationships.civB).toBe(15);
    expect(next.civilizations.civB.diplomacy.relationships.civA).toBe(15);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ crisisId, actorCivId: 'civA', targetCivId: 'civB', goldCost });
  });

  it('catastrophe: deducts gold from the actor and credits it to the target civ as relief', () => {
    const { state, crisisId, goldCost } = sendAidState({ archetype: 'catastrophe' });
    const next = applySendAid(state, 'civA', crisisId, new EventBus());

    expect(next.civilizations.civA.gold).toBe(200 - goldCost);
    expect(next.civilizations.civB.gold).toBe(50 + goldCost);
    expect(next.activeCrises![crisisId].aidedByCivIds).toEqual(['civA']);
  });

  it('grants +4 reputation to a witness who has met both the actor and the target', () => {
    const { state, crisisId } = sendAidState();
    const next = applySendAid(state, 'civA', crisisId, new EventBus());
    expect(next.civilizations.civA.diplomacy.relationships.civC).toBe(4);
    expect(next.civilizations.civC.diplomacy.relationships.civA).toBe(4);
  });

  it('is a no-op when canSendAid would reject (e.g. already aided) -- never double-deducts gold', () => {
    const { state, crisisId } = sendAidState({ actorAlreadyAided: true });
    const next = applySendAid(state, 'civA', crisisId, new EventBus());
    expect(next).toBe(state);
  });

  it('human-target: human A aids human B\'s crisis -- both relationships move (hot-seat requirement)', () => {
    const { state, crisisId } = sendAidState();
    state.civilizations.civB.isHuman = true;
    const next = applySendAid(state, 'civA', crisisId, new EventBus());
    expect(next.civilizations.civA.diplomacy.relationships.civB).toBe(15);
    expect(next.civilizations.civB.diplomacy.relationships.civA).toBe(15);
  });
});

// actor=civA (the war declarer), target=civB (crisis-struck), witness=civC.
function opportunisticWarState({
  hasCrisis = true,
  interactions = 'full' as 'off' | 'benign' | 'full',
}: { hasCrisis?: boolean; interactions?: 'off' | 'benign' | 'full' } = {}): { state: GameState; crisisId: string } {
  const base = threeCivState({
    settings: { aiCrisisInteractions: interactions } as GameState['settings'],
  });
  const crisisId = 'crisis-exploit';
  const crisis: ActiveCrisis = {
    id: crisisId, flavorId: 'plague', archetype: 'outbreak', targetCivId: 'civB',
    cityIds: ['some-city'], tileKeys: [], startedTurn: 5, stage: 'active', turnsInStage: 2,
  };
  return {
    state: { ...base, activeCrises: hasCrisis ? { [crisisId]: crisis } : {} },
    crisisId,
  };
}

describe('getActiveCrisisForCiv', () => {
  it('finds the active crisis targeting the given civ', () => {
    const { state, crisisId } = opportunisticWarState();
    expect(getActiveCrisisForCiv(state, 'civB')?.id).toBe(crisisId);
  });

  it('returns undefined for a civ with no active crisis (negative)', () => {
    const { state } = opportunisticWarState({ hasCrisis: false });
    expect(getActiveCrisisForCiv(state, 'civB')).toBeUndefined();
  });

  it('filters by archetype when provided', () => {
    const { state } = opportunisticWarState();
    expect(getActiveCrisisForCiv(state, 'civB', 'outbreak')).toBeDefined();
    expect(getActiveCrisisForCiv(state, 'civB', 'catastrophe')).toBeUndefined();
  });
});

describe('applyOpportunisticWarPenaltyIfCrisisStruck', () => {
  it('applies exploit_weakness deltas and emits diplomacy:opportunistic-war when the target has an active crisis', () => {
    const { state, crisisId } = opportunisticWarState();
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('diplomacy:opportunistic-war', event => events.push(event));

    const next = applyOpportunisticWarPenaltyIfCrisisStruck(state, 'civA', 'civB', bus);

    expect(next.civilizations.civA.diplomacy.relationships.civB).toBe(-15);
    expect(next.civilizations.civB.diplomacy.relationships.civA).toBe(-15);
    expect(next.civilizations.civA.diplomacy.relationships.civC).toBe(-8);
    expect(next.civilizations.civC.diplomacy.relationships.civA).toBe(-8);
    expect(events).toEqual([{ actorId: 'civA', targetCivId: 'civB', crisisId }]);
  });

  it('is a no-op when the target has no active crisis (war on a healthy civ)', () => {
    const { state } = opportunisticWarState({ hasCrisis: false });
    const next = applyOpportunisticWarPenaltyIfCrisisStruck(state, 'civA', 'civB', new EventBus());
    expect(next).toBe(state);
  });

  it('is a no-op when aiCrisisInteractions is not "full" (benign stage keeps this hook dark)', () => {
    const { state } = opportunisticWarState({ interactions: 'benign' });
    const next = applyOpportunisticWarPenaltyIfCrisisStruck(state, 'civA', 'civB', new EventBus());
    expect(next).toBe(state);
  });

  it('applies regardless of the declarer\'s own tech (reputation is not gated by diplomatic-networks)', () => {
    const { state } = opportunisticWarState();
    // civA has no techState/completed list at all in this fixture -- still applies.
    const next = applyOpportunisticWarPenaltyIfCrisisStruck(state, 'civA', 'civB', new EventBus());
    expect(next.civilizations.civA.diplomacy.relationships.civB).toBe(-15);
  });

  it('AI-declarer parity: an AI actor (isHuman: false) eats the same penalty a human would -- no humanity special-casing', () => {
    const { state } = opportunisticWarState();
    state.civilizations.civA.isHuman = false;
    const next = applyOpportunisticWarPenaltyIfCrisisStruck(state, 'civA', 'civB', new EventBus());
    expect(next.civilizations.civA.diplomacy.relationships.civB).toBe(-15);
    expect(next.civilizations.civB.diplomacy.relationships.civA).toBe(-15);
  });
});
