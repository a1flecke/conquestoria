import { describe, it, expect } from 'vitest';
import type { Camera } from '@/renderer/camera';
import { drawCities, getCityRenderData, getProductionBadgeIcon } from '@/renderer/city-renderer';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { makeBreakawayFixture } from '../systems/helpers/breakaway-fixture';

class MockCanvasContext {
  fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';

  beginPath(): void {}
  arc(): void {}
  fill(): void {}
  stroke(): void {}
  fillText(text: string, x: number, y: number): void {
    this.fillTextCalls.push({ text, x, y });
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
    const city = foundCity('player', settler.position, state.map);
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
    const playerCity = foundCity('player', playerSettler.position, state.map);
    state.cities[playerCity.id] = playerCity;

    const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
    const aiCity = foundCity('ai-1', aiSettler.position, state.map);
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
    const city = foundCity('player', settler.position, state.map);
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
    const playerCity = foundCity('player', playerSettler.position, state.map);
    playerCity.unrestLevel = 1;
    state.cities[playerCity.id] = playerCity;
    state.civilizations.player.cities.push(playerCity.id);
    vis[`${playerCity.position.q},${playerCity.position.r}`] = 'visible';

    const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
    const revoltCity = foundCity('ai-1', aiSettler.position, state.map);
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
    const city = foundCity('player', settler.position, state.map);
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

    const city = foundCity('player', { q: 0, r: 0 }, state.map);
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
});

function makeCamera(): Camera {
  return {
    zoom: 1,
    hexSize: 48,
    isHexVisible: () => true,
    worldToScreen: (x: number, y: number) => ({ x, y }),
  } as unknown as Camera;
}

describe('drawCities — bottom-right build badge', () => {
  it('draws the production icon for a player-owned city with a non-empty queue', () => {
    const state = createNewGame(undefined, 'badge-build-render');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
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
    const aiCity = foundCity('ai-1', aiSettler.position, state.map);
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
    const city = foundCity('player', settler.position, state.map);
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
    const city = foundCity('player', settler.position, state.map);
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
    const city = foundCity('player', settler.position, state.map);
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
    const city = foundCity('player', settler.position, state.map);
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
    const aiCity = foundCity('ai-1', aiSettler.position, state.map);
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
    const city = foundCity('player', settler.position, state.map);
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
});
