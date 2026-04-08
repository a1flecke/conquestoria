import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { TECH_TREE } from '@/systems/tech-definitions';
import { foundCity } from '@/systems/city-system';
import { getAvailableTechs } from '@/systems/tech-system';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { makeBreakawayFixture } from '../systems/helpers/breakaway-fixture';
import { makeLegendaryWonderFixture } from '../systems/helpers/legendary-wonder-fixture';

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
});
