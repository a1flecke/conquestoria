import { describe, it, expect } from 'vitest';
import { placeWonders, processWonderDiscovery, getWonderYieldBonus, processWonderEffects, getWonderVisionBonus, getWonderCombatBonus } from '@/systems/wonder-system';
import { generateMap, findStartPositions } from '@/systems/map-generator';
import { hexDistance, hexKey, hexNeighbors } from '@/systems/hex-utils';
import { calculateCityYields } from '@/systems/resource-system';
import { foundCity } from '@/systems/city-system';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';

function makeMap(size: 'small' | 'medium' | 'large') {
  const dims = { small: { w: 30, h: 30 }, medium: { w: 50, h: 50 }, large: { w: 80, h: 80 } };
  const d = dims[size];
  return generateMap(d.w, d.h, `wonder-test-${size}`);
}

function makeGameState(): GameState {
  return createNewGame(undefined, 'wonder-game-test');
}

describe('placeWonders', () => {
  it('places up to 5 wonders on a small map', () => {
    const map = makeMap('small');
    const starts = findStartPositions(map, 2);
    const placed = placeWonders(map, starts, 'small', 'wonder-seed');
    expect(placed.length).toBeLessThanOrEqual(5);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('places up to 8 wonders on a medium map', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 3);
    const placed = placeWonders(map, starts, 'medium', 'wonder-seed');
    expect(placed.length).toBeLessThanOrEqual(8);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('places up to 15 wonders on a large map', () => {
    const map = makeMap('large');
    const starts = findStartPositions(map, 4);
    const placed = placeWonders(map, starts, 'large', 'wonder-seed');
    expect(placed.length).toBeLessThanOrEqual(15);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('enforces minimum 8-hex distance between wonders', () => {
    const map = makeMap('large');
    const starts = findStartPositions(map, 2);
    placeWonders(map, starts, 'large', 'wonder-dist-test');
    const wonderTiles = Object.values(map.tiles).filter(t => t.wonder !== null);
    for (let i = 0; i < wonderTiles.length; i++) {
      for (let j = i + 1; j < wonderTiles.length; j++) {
        expect(hexDistance(wonderTiles[i].coord, wonderTiles[j].coord)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('enforces minimum 6-hex distance from start positions', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 3);
    placeWonders(map, starts, 'medium', 'wonder-start-test');
    const wonderTiles = Object.values(map.tiles).filter(t => t.wonder !== null);
    for (const wt of wonderTiles) {
      for (const sp of starts) {
        expect(hexDistance(wt.coord, sp)).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('replaces tile resource when placing a wonder', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 2);
    placeWonders(map, starts, 'medium', 'wonder-resource-test');
    const wonderTiles = Object.values(map.tiles).filter(t => t.wonder !== null);
    for (const wt of wonderTiles) {
      expect(wt.resource).toBeNull();
    }
  });
});

describe('processWonderDiscovery', () => {
  it('grants discovery bonus to first discoverer', () => {
    const state = makeGameState();
    processWonderDiscovery(state, 'player', 'crystal_caverns');
    expect(state.discoveredWonders['crystal_caverns']).toBe('player');
    expect(state.wonderDiscoverers['crystal_caverns']).toContain('player');
    // Crystal Caverns gives +50 gold
    expect(state.civilizations.player.gold).toBe(50);
  });

  it('does not grant bonus to second discoverer', () => {
    const state = makeGameState();
    processWonderDiscovery(state, 'player', 'crystal_caverns');
    const goldAfterFirst = state.civilizations.player.gold;

    processWonderDiscovery(state, 'ai-1', 'crystal_caverns');
    expect(state.discoveredWonders['crystal_caverns']).toBe('player');
    expect(state.wonderDiscoverers['crystal_caverns']).toContain('ai-1');
    expect(state.civilizations['ai-1'].gold).toBe(0);
    expect(state.civilizations.player.gold).toBe(goldAfterFirst);
  });

  it('records discoverer in wonderDiscoverers', () => {
    const state = makeGameState();
    processWonderDiscovery(state, 'player', 'aurora_fields');
    processWonderDiscovery(state, 'ai-1', 'aurora_fields');
    expect(state.wonderDiscoverers['aurora_fields']).toEqual(['player', 'ai-1']);
  });

  it('records natural wonder discoveries into legendary wonder history', () => {
    const state = makeGameState();

    processWonderDiscovery(state, 'player', 'crystal_caverns');

    expect(state.legendaryWonderHistory?.discoveredSites).toContainEqual(
      expect.objectContaining({
        civId: 'player',
        siteId: 'crystal_caverns',
        siteType: 'natural-wonder',
      }),
    );
  });

  it('science bonus falls back to gold when no active research', () => {
    const state = makeGameState();
    state.civilizations.player.techState.currentResearch = null;
    processWonderDiscovery(state, 'player', 'aurora_fields'); // +40 science -> gold fallback
    expect(state.civilizations.player.gold).toBe(40);
  });

  it('spain receives increased wonder discovery rewards', () => {
    const state = makeGameState();
    state.civilizations.player.civType = 'spain';
    processWonderDiscovery(state, 'player', 'crystal_caverns');
    expect(state.civilizations.player.gold).toBe(63);
  });
});

describe('Wonder yields in calculateCityYields', () => {
  it('includes wonder yields for owned wonder tiles', () => {
    const state = makeGameState();
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
    state.cities[city.id] = city;

    // Place a wonder on one of the city's owned tiles
    const ownedTile = state.map.tiles[hexKey(city.ownedTiles[0])];
    ownedTile.wonder = 'crystal_caverns'; // +0F/+1P/+3G/+0S
    city.workedTiles = [ownedTile.coord];

    const yields = calculateCityYields(city, state.map);
    expect(yields.gold).toBeGreaterThanOrEqual(3);
  });
});

describe('Wonder Effects', () => {
  it('healing effect adds HP to units on wonder tile (capped at 100)', () => {
    const state = makeGameState();
    const forestTile = Object.values(state.map.tiles).find(t => t.terrain === 'forest')!;
    forestTile.wonder = 'ancient_forest';

    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = forestTile.coord;
    unit.health = 70;

    processWonderEffects(state, () => 0.5);
    expect(unit.health).toBe(80);
  });

  it('healing does not exceed 100 HP', () => {
    const state = makeGameState();
    const forestTile = Object.values(state.map.tiles).find(t => t.terrain === 'forest')!;
    forestTile.wonder = 'ancient_forest';

    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = forestTile.coord;
    unit.health = 95;

    processWonderEffects(state, () => 0.5);
    expect(unit.health).toBe(100);
  });

  it('eruption effect can destroy adjacent improvements', () => {
    const state = makeGameState();
    const volcanicTile = Object.values(state.map.tiles).find(t => t.terrain === 'volcanic');
    if (!volcanicTile) return; // skip if no volcanic terrain in test map

    volcanicTile.wonder = 'great_volcano';

    // Set up an improvement on an adjacent tile
    const neighbors = hexNeighbors(volcanicTile.coord);
    for (const n of neighbors) {
      const nTile = state.map.tiles[hexKey(n)];
      if (nTile && nTile.terrain !== 'ocean' && nTile.terrain !== 'mountain') {
        nTile.improvement = 'farm';
        nTile.improvementTurnsLeft = 0;
        break;
      }
    }

    const eruptions = processWonderEffects(state, () => 0.01); // Always erupts (< 0.05)

    expect(eruptions.length).toBeGreaterThan(0);
    expect(eruptions[0].wonderId).toBe('great_volcano');
    expect(eruptions[0].tilesAffected.length).toBeGreaterThan(0);
  });

  it('vision bonus returns correct value for wonder tile', () => {
    expect(getWonderVisionBonus('frozen_falls')).toBe(2);
    expect(getWonderVisionBonus('eternal_storm')).toBe(3);
    expect(getWonderVisionBonus('crystal_caverns')).toBe(0);
    expect(getWonderVisionBonus(null)).toBe(0);
  });

  it('combat bonus returns correct defense value for wonder tile', () => {
    expect(getWonderCombatBonus('grand_canyon')).toBe(0.30);
    expect(getWonderCombatBonus('dragon_bones')).toBe(0.20);
    expect(getWonderCombatBonus('crystal_caverns')).toBe(0);
    expect(getWonderCombatBonus(null)).toBe(0);
  });
});
