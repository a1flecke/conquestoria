import { createNewGame } from '@/core/game-state';

describe('createNewGame', () => {
  it('creates a valid initial game state', () => {
    const state = createNewGame('test-seed');

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
    const state = createNewGame('test-seed');
    const units = Object.values(state.units);
    expect(units.length).toBeGreaterThanOrEqual(4);
  });

  it('generates a map', () => {
    const state = createNewGame('test-seed');
    expect(state.map.width).toBe(30);
    expect(state.map.height).toBe(30);
    expect(Object.keys(state.map.tiles).length).toBe(900);
  });

  it('places barbarian camps', () => {
    const state = createNewGame('test-seed');
    expect(Object.keys(state.barbarianCamps).length).toBeGreaterThanOrEqual(1);
  });

  it('initializes tutorial state', () => {
    const state = createNewGame('test-seed');
    expect(state.tutorial.active).toBe(true);
    expect(state.tutorial.currentStep).toBe('welcome');
  });
});
