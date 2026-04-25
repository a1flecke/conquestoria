import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import type { City, GameState } from '@/core/types';

export interface CouncilFixtureOptions {
  metForeignCiv?: boolean;
  discoveredForeignCity?: boolean;
  duplicateCityNames?: boolean;
  hotSeat?: boolean;
  currentPlayer?: string;
  lowPriorityFoodWarning?: boolean;
}

function makeForeignCity(owner: string, name: string): City {
  return {
    id: 'city-rome',
    name,
    owner,
    position: { q: 6, r: 6 },
    population: 4,
    food: 0,
    foodNeeded: 20,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [{ q: 6, r: 6 }],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
    grid: [[null]],
    gridSize: 3,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
  };
}

export function makeCouncilFixture(options: CouncilFixtureOptions = {}): { state: GameState; container: HTMLDivElement } {
  const state = options.hotSeat
    ? createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { slotId: 'player-1', civType: 'egypt', name: 'Player One', isHuman: true },
        { slotId: 'player-2', civType: 'rome', name: 'Player Two', isHuman: true },
      ],
    }, 'm4e-council-fixture', 'M4e Council Fixture')
    : createNewGame('egypt', 'm4e-council-fixture');
  const rival = state.civilizations['ai-1'];
  const container = typeof document !== 'undefined'
    ? document.createElement('div')
    : ({} as HTMLDivElement);

  if (rival) {
    rival.name = 'Atlantis';
  }

  if (options.currentPlayer) {
    state.currentPlayer = options.currentPlayer;
  }

  if (options.metForeignCiv) {
    state.civilizations.player.knownCivilizations = ['ai-1'];
    if (rival) {
      rival.knownCivilizations = ['player'];
    }
  }

  if (rival) {
    const foreignCity = makeForeignCity('ai-1', 'Rome');
    state.cities[foreignCity.id] = foreignCity;
    rival.cities = [...rival.cities, foreignCity.id];

    if (options.discoveredForeignCity) {
      const key = `${foreignCity.position.q},${foreignCity.position.r}`;
      state.civilizations.player.visibility.tiles[key] = 'visible';
    }
  }

  if (options.duplicateCityNames) {
    const playerCity = Object.values(state.cities).find(city => city.owner === 'player');
    if (playerCity) {
      playerCity.name = 'Rome';
    }
  }

  if (options.lowPriorityFoodWarning) {
    let playerCity = Object.values(state.cities).find(city => city.owner === state.currentPlayer);
    if (!playerCity) {
      const settler = Object.values(state.units).find(unit => unit.owner === state.currentPlayer && unit.type === 'settler');
      if (settler) {
        playerCity = foundCity(state.currentPlayer, settler.position, state.map);
        state.cities[playerCity.id] = playerCity;
        state.civilizations[state.currentPlayer].cities.push(playerCity.id);
      }
    }
    if (playerCity) {
      playerCity.population = 1;
      playerCity.food = 0;
      playerCity.foodNeeded = 20;
      for (const coord of playerCity.ownedTiles) {
        const key = `${coord.q},${coord.r}`;
        if (state.map.tiles[key]) {
          state.map.tiles[key].terrain = 'desert';
          state.map.tiles[key].improvement = 'none';
          state.map.tiles[key].improvementTurnsLeft = 0;
        }
      }
    }
  }

  return { state, container };
}
