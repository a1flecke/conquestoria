import { createNewGame, createHotSeatGame, MAP_DIMENSIONS } from '@/core/game-state';
import type { HotSeatConfig } from '@/core/types';

describe('createNewGame', () => {
  it('creates a valid initial game state', () => {
    const state = createNewGame(undefined, 'test-seed');

    expect(state.turn).toBe(1);
    expect(state.era).toBe(1);
    expect(state.gameOver).toBe(false);

    // Should have player civ and AI civ
    const civs = Object.values(state.civilizations);
    expect(civs.length).toBe(2);
    expect(civs.filter(c => c.isHuman).length).toBe(1);
    expect(civs.filter(c => !c.isHuman).length).toBe(1);
  });

  it('gives each civ starting units', () => {
    const state = createNewGame(undefined, 'test-seed');
    const units = Object.values(state.units);
    expect(units.length).toBeGreaterThanOrEqual(4);
  });

  it('generates a map', () => {
    const state = createNewGame(undefined, 'test-seed');
    expect(state.map.width).toBe(30);
    expect(state.map.height).toBe(30);
    expect(Object.keys(state.map.tiles).length).toBe(900);
  });

  it('places barbarian camps', () => {
    const state = createNewGame(undefined, 'test-seed');
    expect(Object.keys(state.barbarianCamps).length).toBeGreaterThanOrEqual(1);
  });

  it('initializes tutorial state', () => {
    const state = createNewGame(undefined, 'test-seed');
    expect(state.tutorial.active).toBe(true);
    expect(state.tutorial.currentStep).toBe('welcome');
  });

  it('creates civilizations with civType and diplomacy', () => {
    const state = createNewGame('egypt', 'test-seed');
    expect(state.civilizations.player.civType).toBe('egypt');
    expect(state.civilizations.player.diplomacy).toBeDefined();
    expect(state.civilizations.player.diplomacy.relationships).toHaveProperty('ai-1');
    expect(state.civilizations['ai-1'].civType).not.toBe('egypt');
    expect(state.civilizations['ai-1'].diplomacy).toBeDefined();
  });

  it('applies Greece diplomacy start bonus', () => {
    const state = createNewGame('greece', 'test-seed');
    expect(state.civilizations.player.diplomacy.relationships['ai-1']).toBe(20);
  });

  it('defaults to generic civType when no civType provided', () => {
    const state = createNewGame(undefined, 'test-seed');
    expect(state.civilizations.player.civType).toBe('generic');
  });

  it('createNewGame accepts mapSize parameter', () => {
    const state = createNewGame(undefined, 'test-seed', 'medium');
    expect(state.map.width).toBe(50);
    expect(state.map.height).toBe(50);
    expect(state.settings.mapSize).toBe('medium');
  });
});

describe('minor civ integration', () => {
  it('createNewGame places minor civs on medium map', () => {
    const state = createNewGame(undefined, 'mc-integration', 'medium');
    expect(Object.keys(state.minorCivs).length).toBeGreaterThanOrEqual(4);
    for (const mc of Object.values(state.minorCivs)) {
      expect(state.cities[mc.cityId]).toBeDefined();
      expect(state.cities[mc.cityId].owner).toMatch(/^mc-/);
    }
  });

  it('createHotSeatGame places minor civs', () => {
    const config: HotSeatConfig = {
      playerCount: 2,
      mapSize: 'medium' as const,
      players: [
        { name: 'Alice', slotId: 'slot-0', civType: 'egypt' as any, isHuman: true },
        { name: 'Bob', slotId: 'slot-1', civType: 'rome' as any, isHuman: true },
      ],
    };
    const state = createHotSeatGame(config, 'mc-hotseat');
    expect(Object.keys(state.minorCivs).length).toBeGreaterThanOrEqual(2);
  });
});

describe('createHotSeatGame', () => {
  const config: HotSeatConfig = {
    playerCount: 3,
    mapSize: 'medium',
    players: [
      { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
      { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      { name: 'AI Greece', slotId: 'ai-1', civType: 'greece', isHuman: false },
    ],
  };

  it('creates correct number of civs', () => {
    const state = createHotSeatGame(config, 'hs-test');
    expect(Object.keys(state.civilizations)).toHaveLength(3);
    expect(state.hotSeat).toBeDefined();
    expect(state.hotSeat!.playerCount).toBe(3);
    expect(state.currentPlayer).toBe('player-1');
    expect(state.civilizations['player-1'].civType).toBe('egypt');
    expect(state.civilizations['ai-1'].isHuman).toBe(false);
    expect(state.map.width).toBe(50);
  });

  it('disables tutorial for hot seat games', () => {
    const state = createHotSeatGame(config, 'hs-test');
    expect(state.tutorial.active).toBe(false);
    expect(state.settings.tutorialEnabled).toBe(false);
  });

  it('initializes pending events', () => {
    const state = createHotSeatGame(config, 'hs-test');
    expect(state.pendingEvents).toEqual({});
  });
});
