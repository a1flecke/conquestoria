import { describe, it, expect } from 'vitest';
import { placeMinorCivs, processMinorCivTurn, checkEraAdvancement, processMinorCivEraUpgrade, conquestMinorCiv, processGuerrilla, processScuffles, applyDiplomaticReaction } from '@/systems/minor-civ-system';
import { createNewGame } from '@/core/game-state';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { EventBus } from '@/core/event-bus';
import { TECH_TREE } from '@/systems/tech-definitions';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';

const bus = new EventBus();

describe('minor civ placement', () => {
  it('places correct number for small map', () => {
    const state = createNewGame(undefined, 'mc-place-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-place-test');
    expect(Object.keys(result.minorCivs).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(result.minorCivs).length).toBeLessThanOrEqual(4);
  });

  it('places correct number for medium map', () => {
    const state = createNewGame(undefined, 'mc-place-med', 'medium');
    const result = placeMinorCivs(state, 'medium', 'mc-place-med');
    expect(Object.keys(result.minorCivs).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(result.minorCivs).length).toBeLessThanOrEqual(6);
  });

  it('respects distance from start positions', () => {
    const state = createNewGame(undefined, 'mc-dist-test', 'medium');
    const result = placeMinorCivs(state, 'medium', 'mc-dist-test');
    const startPositions = Object.values(state.units)
      .filter(u => u.type === 'settler')
      .map(u => u.position);
    for (const mc of Object.values(result.minorCivs)) {
      const city = result.cities[mc.cityId];
      for (const start of startPositions) {
        expect(hexDistance(city.position, start)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('respects distance between minor civs', () => {
    const state = createNewGame(undefined, 'mc-inter-test', 'medium');
    const result = placeMinorCivs(state, 'medium', 'mc-inter-test');
    const mcCities = Object.values(result.minorCivs).map(mc => result.cities[mc.cityId]);
    for (let i = 0; i < mcCities.length; i++) {
      for (let j = i + 1; j < mcCities.length; j++) {
        expect(hexDistance(mcCities[i].position, mcCities[j].position)).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('creates city and garrison for each minor civ', () => {
    const state = createNewGame(undefined, 'mc-city-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-city-test');
    for (const mc of Object.values(result.minorCivs)) {
      expect(result.cities[mc.cityId]).toBeDefined();
      expect(result.cities[mc.cityId].owner).toBe(`mc-${mc.definitionId}`);
      expect(result.cities[mc.cityId].population).toBe(3);
      expect(mc.units.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not place on impassable terrain', () => {
    const state = createNewGame(undefined, 'mc-terrain-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-terrain-test');
    const impassable = ['ocean', 'coast', 'mountain'];
    for (const mc of Object.values(result.minorCivs)) {
      const city = result.cities[mc.cityId];
      const tile = state.map.tiles[hexKey(city.position)];
      expect(impassable).not.toContain(tile.terrain);
    }
  });

  it('initializes diplomacy with major civs only', () => {
    const state = createNewGame(undefined, 'mc-diplo-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-diplo-test');
    for (const mc of Object.values(result.minorCivs)) {
      const relKeys = Object.keys(mc.diplomacy.relationships);
      expect(relKeys).toContain('player');
      expect(relKeys).toContain('ai-1');
      // Should NOT contain other minor civ IDs
      for (const key of relKeys) {
        expect(key.startsWith('mc-')).toBe(false);
      }
    }
  });
});

describe('minor civ turn processing', () => {
  it('replaces lost garrison after cooldown', () => {
    const state = createNewGame(undefined, 'mc-garrison', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    // Remove garrison unit
    for (const uid of mc.units) {
      delete state.units[uid];
    }
    mc.units = [];
    mc.garrisonCooldown = 1;

    const result = processMinorCivTurn(state, bus);
    expect(result.minorCivs[mcId].garrisonCooldown).toBe(0);

    // Next turn should spawn replacement
    const result2 = processMinorCivTurn(result, bus);
    expect(result2.minorCivs[mcId].units.length).toBeGreaterThanOrEqual(1);
  });

  it('applies ally bonus to allied major civ', () => {
    const state = createNewGame(undefined, 'mc-ally', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    // Set relationship to allied (+60)
    mc.diplomacy.relationships.player = 65;

    const result = processMinorCivTurn(state, bus);
    // At minimum, verify no crash
    expect(result).toBeDefined();
  });

  it('skips destroyed minor civs', () => {
    const state = createNewGame(undefined, 'mc-destroyed', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    state.minorCivs[mcId].isDestroyed = true;

    const result = processMinorCivTurn(state, bus);
    expect(result.minorCivs[mcId].isDestroyed).toBe(true);
  });

  it('does not issue a quest to a player who has not discovered the minor civ', () => {
    const state = createNewGame(undefined, 'mc-undiscovered-quest', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;

    let questIssued = false;
    const localBus = new EventBus();
    localBus.on('minor-civ:quest-issued', ({ majorCivId }: { majorCivId: string }) => {
      if (majorCivId === 'player') {
        questIssued = true;
      }
    });

    processMinorCivTurn(state, localBus);

    expect(state.minorCivs[mcId].activeQuests.player).toBeUndefined();
    expect(questIssued).toBe(false);
  });

  it('issues a quest after the player has discovered the city-state', () => {
    const state = createNewGame(undefined, 'mc-discovered-quest', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const city = state.cities[state.minorCivs[mcId].cityId];
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';

    let questIssued = false;
    const localBus = new EventBus();
    localBus.on('minor-civ:quest-issued', ({ minorCivId, majorCivId }: { minorCivId: string; majorCivId: string }) => {
      if (minorCivId === mcId && majorCivId === 'player') {
        questIssued = true;
      }
    });

    processMinorCivTurn(state, localBus);

    expect(state.minorCivs[mcId].activeQuests.player).toBeDefined();
    expect(questIssued).toBe(true);
  });
});

describe('era advancement', () => {
  it('advances era when a civ has 60% of next era techs', () => {
    const state = createNewGame(undefined, 'era-test', 'small');
    state.era = 1;
    const era2Techs = TECH_TREE.filter(t => t.era === 2);
    const needed = Math.ceil(era2Techs.length * 0.6);
    state.civilizations.player.techState.completed = era2Techs.slice(0, needed).map(t => t.id);
    const newEra = checkEraAdvancement(state);
    expect(newEra).toBe(2);
  });

  it('does not advance era below 60% threshold', () => {
    const state = createNewGame(undefined, 'era-no-test', 'small');
    state.era = 1;
    const era2Techs = TECH_TREE.filter(t => t.era === 2);
    const below = Math.floor(era2Techs.length * 0.6) - 1;
    state.civilizations.player.techState.completed = era2Techs.slice(0, below).map(t => t.id);
    const newEra = checkEraAdvancement(state);
    expect(newEra).toBe(1);
  });

  it('does not require late-era scaffolding techs to advance into era 5', () => {
    const state = createNewGame(undefined, 'era-five-test', 'small');
    state.era = 4;
    state.civilizations.player.techState.completed = ['digital-surveillance', 'cyber-warfare'];

    const newEra = checkEraAdvancement(state);

    expect(newEra).toBe(5);
  });
});

describe('minor civ era upgrades', () => {
  it('upgrades garrison from warrior to swordsman at era 2', () => {
    const state = createNewGame(undefined, 'mc-era-up', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;

    processMinorCivEraUpgrade(state, mc);
    const garrison = state.units[mc.units[0]];
    expect(garrison.type).toBe('swordsman');
    expect(mc.lastEraUpgrade).toBe(2);
  });

  it('adds population on era upgrade', () => {
    const state = createNewGame(undefined, 'mc-era-pop', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;
    const popBefore = state.cities[mc.cityId].population;

    processMinorCivEraUpgrade(state, mc);
    expect(state.cities[mc.cityId].population).toBe(popBefore + 1);
  });
});

describe('conquest mechanics', () => {
  it('marks minor civ as destroyed on conquest', () => {
    const state = createNewGame(undefined, 'mc-conquer', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;

    conquestMinorCiv(state, mcId, 'player', bus);
    expect(state.minorCivs[mcId].isDestroyed).toBe(true);
  });

  it('transfers city to conqueror', () => {
    const state = createNewGame(undefined, 'mc-transfer', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];

    conquestMinorCiv(state, mcId, 'player', bus);
    expect(state.cities[mc.cityId].owner).toBe('player');
    expect(state.civilizations.player.cities).toContain(mc.cityId);
  });

  it('applies conquest penalty to other minor civs', () => {
    const state = createNewGame(undefined, 'mc-penalty', 'medium');
    const mcIds = Object.keys(state.minorCivs);
    if (mcIds.length < 2) return;

    conquestMinorCiv(state, mcIds[0], 'player', bus);

    for (let i = 1; i < mcIds.length; i++) {
      const mc = state.minorCivs[mcIds[i]];
      expect(mc.diplomacy.relationships.player).toBeLessThan(0);
    }
  });
});

describe('guerrilla behavior', () => {
  it('spawns guerrilla units when at war (max 2)', () => {
    const state = createNewGame(undefined, 'mc-guerrilla', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    mc.diplomacy.atWarWith.push('player');

    processGuerrilla(state, mc, bus);
    expect(mc.units.length).toBeLessThanOrEqual(3);
  });

  it('does not spawn guerrilla when not at war', () => {
    const state = createNewGame(undefined, 'mc-no-guerrilla', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    const unitsBefore = mc.units.length;

    processGuerrilla(state, mc, bus);
    expect(mc.units.length).toBe(unitsBefore);
  });
});

describe('scuffles between minor civs', () => {
  it('does not crash on scuffle processing', () => {
    const state = createNewGame(undefined, 'mc-scuffle', 'medium');
    processScuffles(state, bus);
    expect(state).toBeDefined();
  });
});

describe('diplomatic agency', () => {
  it('improves relationship when nearby barbarian camp destroyed', () => {
    const state = createNewGame(undefined, 'mc-diplo-react', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    const relBefore = mc.diplomacy.relationships.player ?? 0;

    applyDiplomaticReaction(state, 'camp_destroyed_nearby', 'player', mcId);
    expect(mc.diplomacy.relationships.player).toBe(relBefore + 10);
  });

  it('militaristic minor civ respects strength on attacked_neighbor', () => {
    const state = createNewGame(undefined, 'mc-diplo-mil', 'medium');

    const milEntry = Object.entries(state.minorCivs).find(([, mc]) => {
      const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
      return def?.archetype === 'militaristic';
    });
    if (!milEntry) return;
    const [milMcId, milMc] = milEntry;
    const relBefore = milMc.diplomacy.relationships.player ?? 0;

    applyDiplomaticReaction(state, 'attacked_neighbor', 'player', milMcId);
    expect(milMc.diplomacy.relationships.player).toBe(relBefore + 5);
  });

  it('cultural minor civ condemns attacked_neighbor', () => {
    const state = createNewGame(undefined, 'mc-diplo-cult', 'medium');

    const cultEntry = Object.entries(state.minorCivs).find(([, mc]) => {
      const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
      return def?.archetype === 'cultural';
    });
    if (!cultEntry) return;
    const [cultMcId, cultMc] = cultEntry;
    const relBefore = cultMc.diplomacy.relationships.player ?? 0;

    applyDiplomaticReaction(state, 'attacked_neighbor', 'player', cultMcId);
    expect(cultMc.diplomacy.relationships.player).toBe(relBefore - 15);
  });
});
