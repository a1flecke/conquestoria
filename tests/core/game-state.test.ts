import { createNewGame } from '@/core/game-state';

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
});
