import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { CustomCivDefinition, GameState } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import { foundCity } from '@/systems/city-system';
import { getAvailableTechs } from '@/systems/tech-system';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { makeBreakawayFixture } from '../systems/helpers/breakaway-fixture';
import { makeAutoExploreFixture } from '../systems/helpers/auto-explore-fixture';
import { makeLegendaryWonderFixture } from '../systems/helpers/legendary-wonder-fixture';

const customCiv: CustomCivDefinition = {
  id: 'custom-sunfolk',
  name: 'Sunfolk',
  color: '#d9a441',
  leaderName: 'Aurelia',
  cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
  primaryTrait: 'scholarly',
  temperamentTraits: ['diplomatic', 'trader'],
};

describe('processTurn', () => {
  it('increments the turn counter', () => {
    const state = createNewGame(undefined, 'turn-test');
    const bus = new EventBus();
    const newState = processTurn(state, bus);
    expect(newState.turn).toBe(2);
  });

  it('resets unit movement points', () => {
    const state = createNewGame(undefined, 'turn-test');
    const bus = new EventBus();
    const unitId = Object.keys(state.units)[0];
    state.units[unitId].movementPointsLeft = 0;
    state.units[unitId].hasMoved = true;

    const newState = processTurn(state, bus);
    const unit = newState.units[unitId];
    if (unit) {
      expect(unit.hasMoved).toBe(false);
      expect(unit.movementPointsLeft).toBeGreaterThan(0);
    }
  });

  it('emits turn:start and turn:end events', () => {
    const state = createNewGame(undefined, 'turn-test');
    const bus = new EventBus();
    const startListener = vi.fn();
    const endListener = vi.fn();
    bus.on('turn:start', startListener);
    bus.on('turn:end', endListener);

    processTurn(state, bus);
    expect(endListener).toHaveBeenCalled();
    expect(startListener).toHaveBeenCalled();
  });

  it('processes city production', () => {
    const state = createNewGame(undefined, 'turn-test');
    const bus = new EventBus();

    const playerCiv = Object.values(state.civilizations).find(c => c.isHuman)!;
    if (playerCiv.cities.length === 0) {
      return;
    }

    const newState = processTurn(state, bus);
    expect(newState).toBeDefined();
  });

  it('processes minor civ turn phase', () => {
    const state = createNewGame(undefined, 'turn-mc', 'small');
    const bus = new EventBus();
    expect(Object.keys(state.minorCivs).length).toBeGreaterThan(0);

    const result = processTurn(state, bus);
    expect(Object.keys(result.minorCivs).length).toBeGreaterThan(0);
  });

  it('advances research progress when a city exists and tech is selected', () => {
    const state = createNewGame(undefined, 'turn-research', 'small');
    const bus = new EventBus();

    // Found a city for the player so they produce science
    const playerCiv = state.civilizations.player;
    const startPos = state.units[playerCiv.units[0]].position;
    const city = foundCity('player', startPos, state.map);
    state.cities[city.id] = city;
    playerCiv.cities.push(city.id);

    // Select the first available tech
    const available = getAvailableTechs(playerCiv.techState);
    playerCiv.techState.currentResearch = available[0].id;
    playerCiv.techState.researchProgress = 0;

    const newState = processTurn(state, bus);
    expect(newState.civilizations.player.techState.researchProgress).toBeGreaterThan(0);
  });

  it('spawns a unit when city completes unit training', () => {
    const state = createNewGame(undefined, 'unit-spawn-test', 'small');
    const bus = new EventBus();

    // Found a city for player
    const startPos = state.units[state.civilizations.player.units[0]].position;
    const city = foundCity('player', startPos, state.map);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);

    // Queue a warrior and set progress to nearly complete
    city.productionQueue = ['warrior'];
    city.productionProgress = 24; // warrior costs 25, +1 production from city center will complete it

    const unitCountBefore = Object.values(state.units).filter(u => u.owner === 'player').length;
    const newState = processTurn(state, bus);
    const unitCountAfter = Object.values(newState.units).filter(u => u.owner === 'player').length;

    expect(unitCountAfter).toBe(unitCountBefore + 1);
    expect(newState.civilizations.player.units.length).toBe(unitCountBefore + 1);
  });

  it('checks era advancement after processing', () => {
    const state = createNewGame(undefined, 'turn-era', 'small');
    const bus = new EventBus();
    state.era = 1;

    const era2Techs = TECH_TREE.filter(t => t.era === 2);
    const needed = Math.ceil(era2Techs.length * 0.6);
    state.civilizations.player.techState.completed = era2Techs.slice(0, needed).map(t => t.id);

    const result = processTurn(state, bus);
    expect(result.era).toBe(2);
  });

  it('matures breakaway secessions during normal turn processing', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 62 });
    const bus = new EventBus();

    const result = processTurn(state, bus);

    expect(result.civilizations[breakawayId].breakaway?.status).toBe('established');
  });

  it('applies auto-explore orders during turn processing', () => {
    const { state, unitId } = makeAutoExploreFixture({ safeFogNorth: true });
    const bus = new EventBus();

    const result = processTurn(state, bus);

    expect(result.units[unitId].position).toEqual({ q: 1, r: 0 });
    expect((result.units[unitId] as any).automation).toBeDefined();
  });

  it('auto-explore processes village and wonder side effects during turn processing', () => {
    const { state, unitId } = makeAutoExploreFixture({ villageNorth: true, wonderNorth: 'grand_canyon', safeFogNorth: true });
    const bus = new EventBus();

    const result = processTurn(state, bus);

    expect(result.units[unitId].position).toEqual({ q: 1, r: 0 });
    expect(Object.keys(result.discoveredWonders)).toContain('grand_canyon');
    expect(Object.keys(result.tribalVillages)).toHaveLength(0);
  });

  it('moves a legendary wonder project from questing to ready_to_build once all steps complete', () => {
    const state = makeLegendaryWonderFixture();
    const bus = new EventBus();

    state.legendaryWonderProjects!['oracle-of-delphi'].questSteps.forEach(step => {
      step.completed = true;
    });

    const result = processTurn(state, bus);

    expect(result.legendaryWonderProjects!['oracle-of-delphi'].phase).toBe('ready_to_build');
  });

  it('completes a legendary wonder and clears the city queue once enough production is invested', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    const bus = new EventBus();
    const oracle = getLegendaryWonderDefinition('oracle-of-delphi');

    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = (oracle?.productionCost ?? 0) - 1;

    const result = processTurn(state, bus);

    expect(result.legendaryWonderProjects!['oracle-of-delphi'].phase).toBe('completed');
    expect(result.cities['city-river'].productionQueue).toEqual([]);
    expect(result.cities['city-river'].productionProgress).toBe(0);
  });

  it('emits a legendary-completed event when a wonder finishes during turn processing', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    const bus = new EventBus();
    const completedEvents: Array<{ civId: string; cityId: string; wonderId: string }> = [];
    const oracle = getLegendaryWonderDefinition('oracle-of-delphi');

    bus.on('wonder:legendary-completed', event => completedEvents.push(event));
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = (oracle?.productionCost ?? 0) - 1;

    processTurn(state, bus);

    expect(completedEvents).toEqual([
      { civId: 'player', cityId: 'city-river', wonderId: 'oracle-of-delphi' },
    ]);
  });

  it('persists completed legendary wonder ownership through turn processing', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    const bus = new EventBus();
    const oracle = getLegendaryWonderDefinition('oracle-of-delphi');

    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = oracle!.productionCost;

    const result = processTurn(state, bus);

    expect(result.completedLegendaryWonders?.['oracle-of-delphi']).toEqual({
      ownerId: 'player',
      cityId: 'city-river',
      turnCompleted: 40,
    });
  });

  it('shuts down city production for exactly 3 turns after a cyber attack', () => {
    const state = createNewGame(undefined, 'cyber-turn-test', 'small');
    const bus = new EventBus();
    const playerCiv = state.civilizations.player;
    const startPos = state.units[playerCiv.units[0]].position;
    const city = foundCity('player', startPos, state.map);
    city.buildings = ['workshop'];
    city.productionQueue = ['worker'];
    city.productionProgress = 4;
    state.cities[city.id] = city;
    playerCiv.cities.push(city.id);
    state.cities[city.id].productionDisabledTurns = 3;

    const turn1 = processTurn(state, bus);
    expect(turn1.cities[city.id].productionProgress).toBe(4);
    expect(turn1.cities[city.id].productionDisabledTurns).toBe(2);

    const turn2 = processTurn(turn1, bus);
    expect(turn2.cities[city.id].productionProgress).toBe(4);
    expect(turn2.cities[city.id].productionDisabledTurns).toBe(1);

    const turn3 = processTurn(turn2, bus);
    expect(turn3.cities[city.id].productionDisabledTurns).toBe(0);
    expect(turn3.cities[city.id].productionProgress).toBe(4);

    const turn4 = processTurn(turn3, bus);
    expect(turn4.cities[city.id].productionProgress).toBeGreaterThan(4);
  });

  it('applies misinformation research penalties for exactly 10 turns', () => {
    const state = createNewGame(undefined, 'misinfo-turn-test', 'small');
    const bus = new EventBus();
    const playerCiv = state.civilizations.player;
    const startPos = state.units[playerCiv.units[0]].position;
    const city = foundCity('player', startPos, state.map);
    city.buildings = ['library'];
    state.cities[city.id] = city;
    playerCiv.cities.push(city.id);

    playerCiv.techState.currentResearch = 'cyber-warfare';
    playerCiv.techState.researchProgress = 0;
    playerCiv.researchPenaltyTurns = 10;
    playerCiv.researchPenaltyMultiplier = 0.2;

    const controlState = structuredClone(state);
    controlState.civilizations.player.researchPenaltyTurns = 0;
    controlState.civilizations.player.researchPenaltyMultiplier = 0;

    let next = processTurn(state, bus);
    const control = processTurn(controlState, new EventBus());
    expect(next.civilizations.player.techState.researchProgress).toBeGreaterThan(0);
    expect(control.civilizations.player.techState.researchProgress).toBeGreaterThan(
      next.civilizations.player.techState.researchProgress,
    );
    expect(next.civilizations.player.researchPenaltyTurns).toBe(9);

    for (let i = 0; i < 8; i++) {
      next = processTurn(next, bus);
    }

    expect(next.civilizations.player.researchPenaltyTurns).toBe(1);

    next = processTurn(next, bus);
    expect(next.civilizations.player.researchPenaltyTurns).toBe(0);
    expect(next.civilizations.player.researchPenaltyMultiplier).toBe(0);
  });

  it('grants Narnia alliance yield bonuses during turn processing', () => {
    const state = createNewGame(undefined, 'narnia-alliance-test', 'small');
    const bus = new EventBus();
    const playerCiv = state.civilizations.player;
    playerCiv.civType = 'narnia';
    playerCiv.gold = 0;
    playerCiv.techState.currentResearch = 'cyber-warfare';
    playerCiv.techState.researchProgress = 0;
    playerCiv.diplomacy.treaties.push({
      type: 'alliance',
      civA: 'player',
      civB: 'ai-1',
      turnsRemaining: -1,
    });

    const controlState = structuredClone(state);
    controlState.civilizations.player.civType = 'egypt';
    controlState.civilizations.player.diplomacy.treaties = [];

    const result = processTurn(state, bus);
    const control = processTurn(controlState, new EventBus());

    expect(result.civilizations.player.gold).toBeGreaterThan(control.civilizations.player.gold);
    expect(result.civilizations.player.techState.researchProgress).toBeGreaterThan(
      control.civilizations.player.techState.researchProgress,
    );
  });

  it('processTurn can still resolve a saved custom civ definition after JSON round-trip', () => {
    const state = createNewGame({
      civType: 'custom-sunfolk',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'Runtime Custom Civ',
      customCivilizations: [customCiv],
    });

    const roundTrip = JSON.parse(JSON.stringify(state)) as GameState;
    expect(resolveCivDefinition(roundTrip, 'custom-sunfolk')?.name).toBe('Sunfolk');
    expect(() => processTurn(roundTrip, new EventBus())).not.toThrow();
  });
});
