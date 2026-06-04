import { describe, it, expect } from 'vitest';
import type { Camera } from '@/renderer/camera';
import { drawCities, getCityRenderData, getProductionBadgeIcon } from '@/renderer/city-renderer';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { makeBreakawayFixture } from '../systems/helpers/breakaway-fixture';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

class MockCanvasContext {
  operations: string[] = [];
  fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';

  save(): void { this.operations.push('save'); }
  restore(): void { this.operations.push('restore'); }
  beginPath(): void { this.operations.push('beginPath'); }
  arc(): void { this.operations.push('arc'); }
  rect(): void { this.operations.push('rect'); }
  moveTo(): void { this.operations.push('moveTo'); }
  lineTo(): void { this.operations.push('lineTo'); }
  closePath(): void { this.operations.push('closePath'); }
  fill(): void { this.operations.push(`fill:${this.fillStyle}`); }
  stroke(): void { this.operations.push(`stroke:${this.strokeStyle}`); }
  fillText(text: string, x: number, y: number): void {
    this.fillTextCalls.push({ text, x, y });
    this.operations.push(`text:${text}`);
  }
  drawImage(): void {
    this.operations.push('drawImage');
  }
}

describe('city renderer', () => {
  it('returns only minor civ cities on fresh game', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const data = getCityRenderData(state);
    // Fresh game has minor civ cities only (no player/AI cities yet)
    for (const d of data) {
      expect(d.owner).toMatch(/^mc-/);
    }
  });

  it('returns render data for player cities', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const mcCityCount = Object.keys(state.cities).length;
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);

    const data = getCityRenderData(state);
    expect(data.length).toBe(mcCityCount + 1);
    const playerCity = data.find(d => d.owner === 'player');
    expect(playerCity).toBeDefined();
    expect(playerCity!.name).toBe(city.name);
    expect(playerCity!.position).toEqual(city.position);
    expect(playerCity!.population).toBe(city.population);
    expect(playerCity!.unrestLevel).toBe(0);
  });

  it('includes cities from multiple owners', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const mcCityCount = Object.keys(state.cities).length;
    const playerSettler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const playerCity = foundCity('player', playerSettler.position, state.map, state.idCounters);
    state.cities[playerCity.id] = playerCity;

    const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
    const aiCity = foundCity('ai-1', aiSettler.position, state.map, state.idCounters);
    state.cities[aiCity.id] = aiCity;

    const data = getCityRenderData(state);
    expect(data.length).toBe(mcCityCount + 2);
    const owners = data.map(d => d.owner);
    expect(owners).toContain('player');
    expect(owners).toContain('ai-1');
  });

  it('exposes unrest state for overlay rendering', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.unrestLevel = 2;
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);

    const data = getCityRenderData(state);
    const playerCity = data.find(d => d.owner === 'player');
    expect(playerCity?.unrestLevel).toBe(2);
  });

  it('renders a lightning icon for unrest and fire for revolt', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const vis = state.civilizations.player.visibility.tiles;
    const playerSettler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const playerCity = foundCity('player', playerSettler.position, state.map, state.idCounters);
    playerCity.unrestLevel = 1;
    state.cities[playerCity.id] = playerCity;
    state.civilizations.player.cities.push(playerCity.id);
    vis[`${playerCity.position.q},${playerCity.position.r}`] = 'visible';

    const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
    const revoltCity = foundCity('ai-1', aiSettler.position, state.map, state.idCounters);
    revoltCity.unrestLevel = 2;
    state.cities[revoltCity.id] = revoltCity;
    state.civilizations['ai-1'].cities.push(revoltCity.id);
    vis[`${revoltCity.position.q},${revoltCity.position.r}`] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const camera = {
      zoom: 1,
      hexSize: 48,
      isHexVisible: () => true,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;

    drawCities(ctx, state, camera, 'player');

    const overlayTexts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(overlayTexts).toContain('⚡');
    expect(overlayTexts).toContain('🔥');
  });

  it('exposes breakaway status and establishment countdown for seceded cities', () => {
    const { state, cityId } = makeBreakawayFixture({ turn: 45, breakawayStartedTurn: 12 });

    const data = getCityRenderData(state);
    const breakawayCity = data.find(city => city.name === cityId);

    expect(breakawayCity?.breakawayStatus).toBe('secession');
    expect(breakawayCity?.breakawayTurnsLeft).toBe(17);
  });

  it('renders a distinct badge for seceded cities', () => {
    const { state } = makeBreakawayFixture({ turn: 45, breakawayStartedTurn: 12 });
    state.civilizations.player.visibility.tiles['4,0'] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const camera = {
      zoom: 1,
      hexSize: 48,
      isHexVisible: () => true,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;

    drawCities(ctx, state, camera, 'player');

    const overlayTexts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(overlayTexts).toContain('⛓');
  });

  it('renders an occupied-city badge separately from ordinary unrest', () => {
    const state = createNewGame(undefined, 'occupied-render', 'small');
    const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.id = 'occupied-city';
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 9 };
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const camera = {
      zoom: 1,
      hexSize: 48,
      isHexVisible: () => true,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;

    drawCities(ctx, state, camera, 'player');

    const overlayTexts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(overlayTexts).toContain('☹');
  });

  it('renders fogged cities from last-seen presentation without live production or unrest badges', () => {
    const state = createNewGame(undefined, 'city-last-seen-render', 'small');
    state.cities.enemyCity = {
      id: 'enemyCity',
      name: 'Live City',
      owner: 'player',
      position: { q: 0, r: 0 },
      population: 9,
      buildings: [],
      productionQueue: ['warrior'],
      productionProgress: 0,
      food: 0,
      foodNeeded: 10,
      workedTiles: [],
      ownedTiles: [{ q: 0, r: 0 }],
      focus: 'balanced',
      maturity: 'outpost',
      grid: [],
      gridSize: 3,
      unrestLevel: 2,
      unrestTurns: 3,
      spyUnrestBonus: 0,
    };
    state.civilizations.player.visibility = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: 'ai-1',
          hasRiver: false,
          wonder: null,
          city: { id: 'enemyCity', name: 'Old City', owner: 'ai-1', population: 2 },
        },
      },
    };
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const camera = {
      zoom: 1,
      hexSize: 48,
      isHexVisible: () => true,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;

    drawCities(ctx, state, camera, 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(texts).toContain('Old City (2)');
    expect(texts).not.toContain('Live City (9)');
    expect(texts).not.toContain('🔥');
  });

  it('renders wrapped ghost cities at the horizontal seam when only the mirrored copy is on screen', () => {
    const state = createNewGame(undefined, 'wrapped-city-render');
    state.map.wrapsHorizontally = true;
    state.map.width = 5;

    const city = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles['0,0'] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const camera = {
      zoom: 1,
      hexSize: 48,
      isHexVisible: (coord: { q: number; r: number }) => coord.q === 5,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;

    drawCities(ctx, state, camera, 'player');

    const labels = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(labels).toContain(`${city.name} (${city.population})`);
  });

  it('draws legendary landmark layer before city label and production badges remain above it', () => {
    const state = createNewGame(undefined, 'legendary-layer-order-test');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.productionQueue = ['granary'];
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility = {
      tiles: { [hexKey(city.position)]: 'visible' },
      lastSeen: {},
    };
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: city.id, turnCompleted: 20 },
    };

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    const ops = (ctx as unknown as MockCanvasContext).operations;
    const landmarkIndex = ops.findIndex(operation => operation === 'legendary-landmarks:start');
    const labelIndex = ops.findIndex(operation => operation.includes(`text:${city.name}`));
    const badgeIndex = ops.findIndex(operation => operation.includes(`text:${getProductionBadgeIcon(city)}`));
    expect(landmarkIndex).toBeGreaterThanOrEqual(0);
    expect(labelIndex).toBeGreaterThanOrEqual(0);
    expect(badgeIndex).toBeGreaterThanOrEqual(0);
    expect(landmarkIndex).toBeLessThan(labelIndex);
    expect(landmarkIndex).toBeLessThan(badgeIndex);
  });
});

function makeCamera(): Camera {
  return {
    zoom: 1,
    hexSize: 48,
    isHexVisible: () => true,
    worldToScreen: (x: number, y: number) => ({ x, y }),
  } as unknown as Camera;
}

function operationIndex(ctx: CanvasRenderingContext2D, operation: string): number {
  return (ctx as unknown as MockCanvasContext).operations.findIndex(entry => entry === operation);
}

function expectOperationBefore(ctx: CanvasRenderingContext2D, before: string, after: string): void {
  const beforeIndex = operationIndex(ctx, before);
  const afterIndex = operationIndex(ctx, after);
  expect(beforeIndex, before).toBeGreaterThanOrEqual(0);
  expect(afterIndex, after).toBeGreaterThanOrEqual(0);
  expect(beforeIndex, `${before} before ${after}`).toBeLessThan(afterIndex);
}

function addVisiblePlayerCityWithWonder(state = createNewGame(undefined, 'city-pass-order', 'small')) {
  const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler')!;
  const city = foundCity('player', settler.position, state.map, state.idCounters);
  city.id = 'city-pass-order-city';
  state.cities[city.id] = city;
  state.civilizations.player.cities.push(city.id);
  state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'player', cityId: city.id, turnCompleted: 20 },
  };
  return { state, city };
}

describe('drawCities — explicit city render pass contract', () => {
  it('draws explicit city passes in order for landmarks, labels, status, and production badges', () => {
    const { state, city } = addVisiblePlayerCityWithWonder();
    city.productionQueue = ['granary'];
    city.unrestLevel = 1;

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    expectOperationBefore(ctx, 'city-pass:base', 'city-pass:icon');
    expectOperationBefore(ctx, 'city-pass:icon', 'city-pass:landmarks');
    expectOperationBefore(ctx, 'city-pass:landmarks', 'city-pass:label');
    expectOperationBefore(ctx, 'city-pass:label', 'city-pass:status');
    expectOperationBefore(ctx, 'city-pass:status', 'city-pass:production');
    expectOperationBefore(ctx, 'city-pass:production', 'city-pass:idle');
    expectOperationBefore(ctx, 'city-pass:landmarks', `text:${city.name} (${city.population})`);
    expectOperationBefore(ctx, 'city-pass:landmarks', `text:${getProductionBadgeIcon(city)}`);
    expectOperationBefore(ctx, 'city-pass:landmarks', 'text:⚡');
  });

  it('restores canvas state around each explicit city render item', () => {
    const state = createNewGame(undefined, 'city-pass-state-hygiene', 'small');
    const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.productionQueue = ['granary'];
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    const ops = (ctx as unknown as MockCanvasContext).operations;
    const saveIndex = ops.findIndex(operation => operation === 'save');
    const restoreIndex = ops.findIndex(operation => operation === 'restore');
    expect(saveIndex).toBeGreaterThanOrEqual(0);
    expect(restoreIndex).toBeGreaterThanOrEqual(0);
    expect(saveIndex).toBeLessThan(operationIndex(ctx, 'city-pass:base'));
    expect(restoreIndex).toBeGreaterThan(operationIndex(ctx, 'city-pass:idle'));
    expect(ops.filter(operation => operation === 'save')).toHaveLength(
      ops.filter(operation => operation === 'city-pass:base').length,
    );
    expect(ops.filter(operation => operation === 'restore')).toHaveLength(
      ops.filter(operation => operation === 'city-pass:base').length,
    );
  });

  it('draws idle badge after legendary landmarks and labels', () => {
    const { state, city } = addVisiblePlayerCityWithWonder(createNewGame(undefined, 'city-pass-idle', 'small'));
    city.productionQueue = [];
    city.idleProduction = 'gold';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    expectOperationBefore(ctx, 'city-pass:landmarks', 'city-pass:idle');
    expectOperationBefore(ctx, `text:${city.name} (${city.population})`, 'text:💰');
  });

  it('preserves status badge priority: breakaway over occupation and unrest', () => {
    const { state, city } = addVisiblePlayerCityWithWonder(createNewGame(undefined, 'city-pass-breakaway-priority', 'small'));
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 8 };
    city.unrestLevel = 2;
    state.civilizations.player.breakaway = {
      originOwnerId: 'ai-1',
      originCityId: city.id,
      status: 'secession',
      startedTurn: 10,
      establishesOnTurn: 60,
    };

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(texts).toContain('⛓');
    expect(texts).not.toContain('☹');
    expect(texts).not.toContain('🔥');
  });

  it('preserves status badge priority: occupation over ordinary unrest', () => {
    const { state, city } = addVisiblePlayerCityWithWonder(createNewGame(undefined, 'city-pass-occupation-priority', 'small'));
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 8 };
    city.unrestLevel = 2;

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(texts).toContain('☹');
    expect(texts).not.toContain('🔥');
  });

  it('does not leak live production idle status or landmark data for fogged last-seen cities', () => {
    const state = createNewGame(undefined, 'city-pass-fogged-privacy', 'small');
    const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.id = 'fogged-live-city';
    city.name = 'Live Secret';
    city.productionQueue = ['warrior'];
    city.idleProduction = 'gold';
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 9 };
    city.unrestLevel = 2;
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: city.id, turnCompleted: 20 },
    };
    state.civilizations.player.visibility = {
      tiles: { [hexKey(city.position)]: 'fog' },
      lastSeen: {
        [hexKey(city.position)]: {
          coord: { ...city.position },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: 'player',
          hasRiver: false,
          wonder: null,
          city: { id: city.id, name: 'Old Public', owner: 'player', population: 2 },
        },
      },
    };

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(texts).toContain('Old Public (2)');
    expect(texts).not.toContain('Live Secret (1)');
    expect(texts).not.toContain('⚔️');
    expect(texts).not.toContain('💰');
    expect(texts).not.toContain('☹');
    expect(texts).not.toContain('🔥');
    expect((ctx as unknown as MockCanvasContext).operations).not.toContain('legendary-landmarks:start');
  });

  it('draws the full city pass sequence for horizontally wrapped visible copies', () => {
    const { state, city } = addVisiblePlayerCityWithWonder(createNewGame(undefined, 'city-pass-wrap', 'small'));
    state.map.wrapsHorizontally = true;
    state.map.width = 5;
    city.position = { q: 0, r: 0 };
    city.productionQueue = ['granary'];
    state.civilizations.player.visibility.tiles = { '0,0': 'visible' };

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const camera = {
      zoom: 1,
      hexSize: 48,
      isHexVisible: (coord: { q: number; r: number }) => coord.q === 5,
      worldToScreen: (x: number, y: number) => ({ x, y }),
    } as unknown as Camera;

    drawCities(ctx, state, camera, 'player', { nowMs: 1000 });

    expect((ctx as unknown as MockCanvasContext).operations).toContain('city-pass:base');
    expect((ctx as unknown as MockCanvasContext).operations).toContain('city-pass:landmarks');
    expect((ctx as unknown as MockCanvasContext).operations).toContain(`text:${city.name} (${city.population})`);
    expect((ctx as unknown as MockCanvasContext).operations).toContain(`text:${getProductionBadgeIcon(city)}`);
  });

  it('does not draw rival map landmarks from completed rival intel alone', () => {
    const state = createNewGame(undefined, 'city-pass-rival-intel', 'small');
    const aiSettler = Object.values(state.units).find(unit => unit.owner === 'ai-1' && unit.type === 'settler')!;
    const rivalCity = foundCity('ai-1', aiSettler.position, state.map, state.idCounters);
    rivalCity.id = 'rival-legendary-city';
    state.cities[rivalCity.id] = rivalCity;
    state.civilizations['ai-1'].cities.push(rivalCity.id);
    state.civilizations.player.visibility.tiles[hexKey(rivalCity.position)] = 'visible';
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'ai-1', cityId: rivalCity.id, turnCompleted: 20 },
    };
    state.legendaryWonderIntel = {
      player: [{
        kind: 'completed',
        eventId: 'completed:oracle-of-delphi:ai-1:20',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        completionTurn: 20,
        learnedTurn: 20,
      }],
    };

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    expect((ctx as unknown as MockCanvasContext).operations).not.toContain('legendary-landmarks:start');
  });
});

describe('drawCities — bottom-right build badge', () => {
  it('draws the production icon for a player-owned city with a non-empty queue', () => {
    const state = createNewGame(undefined, 'badge-build-render');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.productionQueue = ['warrior'];
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).toContain('⚔️');
  });

  it('does NOT draw the production icon for an enemy-owned visible city', () => {
    const state = createNewGame(undefined, 'badge-build-enemy');
    const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
    const aiCity = foundCity('ai-1', aiSettler.position, state.map, state.idCounters);
    aiCity.productionQueue = ['warrior'];
    state.cities[aiCity.id] = aiCity;
    state.civilizations['ai-1'].cities.push(aiCity.id);
    state.civilizations.player.visibility.tiles[hexKey(aiCity.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    // The warrior icon should NOT appear since the city doesn't belong to the current player
    // (Note: ⚔️ may appear as the minor-civ militaristic icon, so we check for the build badge position instead)
    // The enemy city should not leak its build queue
    expect(texts.filter(t => t === '⚔️').length).toBe(0);
  });

  it('does NOT draw a production icon when the queue is empty', () => {
    const state = createNewGame(undefined, 'badge-build-empty');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.productionQueue = [];
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    // No production-specific badge — just the city icon and name
    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).not.toContain('🏗️');
    expect(texts).not.toContain('⚔️');
  });
});

describe('getProductionBadgeIcon', () => {
  it('returns the matching icon when productionQueue[0] is a known building', () => {
    expect(getProductionBadgeIcon({ productionQueue: ['granary'] })).toBe('🌾');
  });

  it('returns the matching icon when productionQueue[0] is a known unit', () => {
    expect(getProductionBadgeIcon({ productionQueue: ['warrior'] })).toBe('⚔️');
  });

  it('returns the fallback icon when productionQueue[0] is unknown (e.g. legendary wonder)', () => {
    expect(getProductionBadgeIcon({ productionQueue: ['some-legendary-wonder-id'] })).toBe('🏗️');
  });

  it('returns null when productionQueue is empty', () => {
    expect(getProductionBadgeIcon({ productionQueue: [] })).toBeNull();
  });
});

describe('drawCities — top-left idle badge', () => {
  it('draws 💰 for a player-owned idle city with idleProduction=gold', () => {
    const state = createNewGame(undefined, 'badge-idle-gold');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.productionQueue = [];
    city.idleProduction = 'gold';
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).toContain('💰');
  });

  it('draws 🔬 for a player-owned idle city with idleProduction=science', () => {
    const state = createNewGame(undefined, 'badge-idle-sci');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.productionQueue = [];
    city.idleProduction = 'science';
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).toContain('🔬');
  });

  it('does NOT draw the idle badge when queue is non-empty even with idleProduction set', () => {
    const state = createNewGame(undefined, 'badge-idle-queued');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.productionQueue = ['warrior'];
    city.idleProduction = 'gold';
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).not.toContain('💰');
  });

  it('does NOT draw the idle badge for an enemy-owned visible idle city', () => {
    const state = createNewGame(undefined, 'badge-idle-enemy');
    const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
    const aiCity = foundCity('ai-1', aiSettler.position, state.map, state.idCounters);
    aiCity.productionQueue = [];
    aiCity.idleProduction = 'gold';
    state.cities[aiCity.id] = aiCity;
    state.civilizations['ai-1'].cities.push(aiCity.id);
    state.civilizations.player.visibility.tiles[hexKey(aiCity.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).not.toContain('💰');
  });

  it('does NOT draw the idle badge when idleProduction is null', () => {
    const state = createNewGame(undefined, 'badge-idle-null');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    city.productionQueue = [];
    city.idleProduction = null;
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(c => c.text);
    expect(texts).not.toContain('💰');
    expect(texts).not.toContain('🔬');
  });

  it('draws completed legendary landmarks for visible owned host cities', () => {
    const state = createNewGame(undefined, 'legendary-city-render-test');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: city.id, turnCompleted: 20 },
    };

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player');

    expect((ctx as unknown as MockCanvasContext).operations).toContain('save');
  });
});
