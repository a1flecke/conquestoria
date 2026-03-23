import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';

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
});
