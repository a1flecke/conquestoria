import { describe, it, expect } from 'vitest';
import { placeVillages, visitVillage, rollVillageOutcome } from '@/systems/village-system';
import { generateMap, findStartPositions } from '@/systems/map-generator';
import { createNewGame } from '@/core/game-state';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { TECH_TREE, getTechById } from '@/systems/tech-system';
import type { GameState } from '@/core/types';

function makeMap(size: 'small' | 'medium' | 'large') {
  const dims = { small: { w: 30, h: 30 }, medium: { w: 50, h: 50 }, large: { w: 80, h: 80 } };
  const d = dims[size];
  return generateMap(d.w, d.h, `village-test-${size}`);
}

function makeGameState(): GameState {
  return createNewGame(undefined, 'village-game-test');
}

describe('placeVillages', () => {
  it('places up to 8 villages on a small map', () => {
    const map = makeMap('small');
    const starts = findStartPositions(map, ['civ-0', 'civ-1'], 'procedural', 'small');
    const villages = placeVillages(map, starts, 'small', 'village-seed');
    expect(Object.keys(villages).length).toBeLessThanOrEqual(8);
    expect(Object.keys(villages).length).toBeGreaterThan(0);
  });

  it('places up to 12 villages on a medium map', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, ['civ-0', 'civ-1', 'civ-2'], 'procedural', 'medium');
    const villages = placeVillages(map, starts, 'medium', 'village-seed');
    expect(Object.keys(villages).length).toBeLessThanOrEqual(12);
    expect(Object.keys(villages).length).toBeGreaterThan(0);
  });

  it('places up to 20 villages on a large map', () => {
    const map = makeMap('large');
    const starts = findStartPositions(map, ['civ-0', 'civ-1', 'civ-2', 'civ-3'], 'procedural', 'large');
    const villages = placeVillages(map, starts, 'large', 'village-seed');
    expect(Object.keys(villages).length).toBeLessThanOrEqual(20);
    expect(Object.keys(villages).length).toBeGreaterThan(0);
  });

  it('rejects the only candidate tile when it is adjacent across the wrap seam to a start (issue #520)', () => {
    const map = generateMap(30, 12, 'village-wrap-placement');
    map.wrapsHorizontally = true;
    for (const tile of Object.values(map.tiles)) tile.terrain = 'ocean';
    map.tiles['29,5'].terrain = 'grassland';
    const startPositions = [{ q: 0, r: 5 }];

    const villages = placeVillages(map, startPositions, 'small', 'village-wrap-seed');

    expect(Object.values(villages).some(v => hexKey(v.position) === '29,5')).toBe(false);
  });

  it('enforces distance from start positions (min 4)', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, ['civ-0', 'civ-1', 'civ-2'], 'procedural', 'medium');
    const villages = placeVillages(map, starts, 'medium', 'village-dist-test');
    for (const v of Object.values(villages)) {
      for (const sp of starts) {
        expect(hexDistance(v.position, sp)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('enforces distance between villages (min 3)', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, ['civ-0', 'civ-1'], 'procedural', 'medium');
    const villages = placeVillages(map, starts, 'medium', 'village-inter-test');
    const positions = Object.values(villages).map(v => v.position);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(hexDistance(positions[i], positions[j])).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('does not place villages on wonder tiles', () => {
    const map = makeMap('medium');
    const hillTile = Object.values(map.tiles).find(t => t.terrain === 'hills')!;
    hillTile.wonder = 'crystal_caverns';

    const starts = findStartPositions(map, ['civ-0', 'civ-1'], 'procedural', 'medium');
    const villages = placeVillages(map, starts, 'medium', 'village-wonder-test');
    for (const v of Object.values(villages)) {
      const tile = map.tiles[hexKey(v.position)];
      expect(tile.wonder).toBeNull();
    }
  });
});

describe('visitVillage', () => {
  it('removes village from state on visit', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };

    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };

    visitVillage(state, 'v1', unit, () => 0.1);
    expect(state.tribalVillages['v1']).toBeUndefined();
  });

  it('records tribal village visits into legendary wonder history once per civ and village', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };

    visitVillage(state, 'v1', unit, () => 0.2);

    expect(state.legendaryWonderHistory?.discoveredSites).toContainEqual(
      expect.objectContaining({
        civId: 'player',
        siteId: 'v1',
        siteType: 'tribal-village',
      }),
    );
  });

  it('gold outcome adds gold to civ', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };
    const goldBefore = state.civilizations.player.gold;

    visitVillage(state, 'v1', unit, () => 0.1); // 0.1 < 0.25 = gold
    expect(state.civilizations.player.gold).toBeGreaterThan(goldBefore);
  });

  it('spain receives increased village gold rewards', () => {
    const state = makeGameState();
    state.civilizations.player.civType = 'spain';
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };
    const goldBefore = state.civilizations.player.gold;

    visitVillage(state, 'v1', unit, () => 0.1);
    expect(state.civilizations.player.gold - goldBefore).toBeGreaterThan(25);
  });

  it('illness outcome reduces unit HP (min 1)', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };
    unit.health = 30;

    visitVillage(state, 'v1', unit, () => 0.96); // 0.96 > 0.95 = illness
    expect(unit.health).toBeLessThan(30);
    expect(unit.health).toBeGreaterThanOrEqual(1);
  });

  it('free unit outcome spawns unit at village position', () => {
    const state = makeGameState();
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };
    const unitCountBefore = Object.keys(state.units).length;

    visitVillage(state, 'v1', unit, () => 0.7); // 0.7 = free_unit
    expect(Object.keys(state.units).length).toBeGreaterThan(unitCountBefore);
  });

  it('science outcome teaches partial progress instead of completing a fresh starter tech', () => {
    const state = makeGameState();
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchProgress = 0;
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };
    const fire = getTechById('fire')!;
    const rolls = [0.5, 0.999];

    const result = visitVillage(state, 'v1', unit, () => rolls.shift() ?? 0);

    expect(result.outcome).toBe('science');
    expect(state.civilizations.player.techState.completed).not.toContain('fire');
    expect(state.civilizations.player.techState.researchProgress).toBe(fire.cost - 1);
    expect(result.message).toContain('getting closer to understanding Fire');
  });

  it('free tech outcome advances into queued research when completing current research', () => {
    const state = makeGameState();
    const otherStarterTechs = TECH_TREE
      .filter(tech => tech.prerequisites.length === 0 && tech.id !== 'fire')
      .map(tech => tech.id);
    state.civilizations.player.techState.completed = otherStarterTechs;
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing'];
    state.civilizations.player.techState.researchProgress = 3;
    state.tribalVillages = {
      'v1': { id: 'v1', position: { q: 5, r: 5 } },
    };
    const unit = Object.values(state.units).find(u => u.owner === 'player')!;
    unit.position = { q: 5, r: 5 };
    const availableTechs = TECH_TREE.filter(tech =>
      !state.civilizations.player.techState.completed.includes(tech.id)
      && tech.prerequisites.every(prerequisite => state.civilizations.player.techState.completed.includes(prerequisite)),
    );
    const fireIndex = availableTechs.findIndex(tech => tech.id === 'fire');
    const rolls = [0.84, (fireIndex + 0.1) / availableTechs.length];

    const result = visitVillage(state, 'v1', unit, () => rolls.shift() ?? 0);

    expect(result.outcome).toBe('free_tech');
    expect(state.civilizations.player.techState.completed).toContain('fire');
    expect(state.civilizations.player.techState.currentResearch).toBe('writing');
    expect(state.civilizations.player.techState.researchQueue).toEqual([]);
    expect(state.civilizations.player.techState.researchProgress).toBe(0);
  });
});

describe('rollVillageOutcome', () => {
  it('returns gold for rng < 0.25', () => {
    expect(rollVillageOutcome(0.1)).toBe('gold');
  });

  it('returns food for rng 0.25-0.45', () => {
    expect(rollVillageOutcome(0.3)).toBe('food');
  });

  it('returns science for rng 0.45-0.69', () => {
    expect(rollVillageOutcome(0.5)).toBe('science');
    expect(rollVillageOutcome(0.68)).toBe('science');
  });

  it('returns free_unit for rng 0.69-0.84', () => {
    expect(rollVillageOutcome(0.7)).toBe('free_unit');
    expect(rollVillageOutcome(0.83)).toBe('free_unit');
  });

  it('returns free_tech for rng 0.84-0.85', () => {
    expect(rollVillageOutcome(0.84)).toBe('free_tech');
  });

  it('returns ambush for rng 0.85-0.95', () => {
    expect(rollVillageOutcome(0.9)).toBe('ambush');
  });

  it('returns illness for rng >= 0.95', () => {
    expect(rollVillageOutcome(0.96)).toBe('illness');
  });

  it('keeps full tech rare while making research hints common', () => {
    const outcomes = Array.from(
      { length: 1000 },
      (_, i) => rollVillageOutcome((i + 0.5) / 1000),
    );
    const fullTechCount = outcomes.filter(outcome => outcome === 'free_tech').length;
    const scienceCount = outcomes.filter(outcome => outcome === 'science').length;

    expect(fullTechCount).toBeLessThanOrEqual(15);
    expect(scienceCount).toBeGreaterThanOrEqual(230);
  });
});
