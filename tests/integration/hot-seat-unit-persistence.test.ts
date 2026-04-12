import { describe, it, expect } from 'vitest';
import { createHotSeatGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';

import { hexDistance } from '@/systems/hex-utils';

const config = {
  playerCount: 2,
  mapSize: 'medium' as const,
  players: [
    { slotId: 'p1', name: 'Alice', civType: 'france', isHuman: true },
    { slotId: 'p2', name: 'Bob', civType: 'zulu', isHuman: true },
  ],
};

const BARBARIAN_CHASE_RANGE = 5; // must match src/systems/barbarian-system.ts

describe('hot-seat warrior persistence (#87)', () => {
  it('both player warriors survive processTurn when no barbarian is adjacent', () => {
    const state = createHotSeatGame(config, 'issue-87');
    const bus = new EventBus();

    // Confirm both warriors exist before
    const p1Warrior = Object.values(state.units).find(u => u.owner === 'p1' && u.type === 'warrior')!;
    const p2Warrior = Object.values(state.units).find(u => u.owner === 'p2' && u.type === 'warrior')!;
    expect(p1Warrior, 'p1 warrior exists at start').toBeDefined();
    expect(p2Warrior, 'p2 warrior exists at start').toBeDefined();

    // Remove all barbarian camps and units so there can be no barbarian combat
    const cleanState = {
      ...state,
      barbarianCamps: {},
      units: Object.fromEntries(
        Object.entries(state.units).filter(([, u]) => u.owner !== 'barbarian'),
      ),
    };

    const next = processTurn(cleanState, bus);

    expect(next.units[p1Warrior.id], `p1 warrior ${p1Warrior.id} vanished`).toBeDefined();
    expect(next.units[p2Warrior.id], `p2 warrior ${p2Warrior.id} vanished`).toBeDefined();
  });

  it('warriors survive multiple turns without combat', () => {
    let state = createHotSeatGame(config, 'issue-87-multi');
    const bus = new EventBus();

    const p1Warrior = Object.values(state.units).find(u => u.owner === 'p1' && u.type === 'warrior')!;
    const p2Warrior = Object.values(state.units).find(u => u.owner === 'p2' && u.type === 'warrior')!;

    // Strip barbarians for isolation
    state = {
      ...state,
      barbarianCamps: {},
      units: Object.fromEntries(
        Object.entries(state.units).filter(([, u]) => u.owner !== 'barbarian'),
      ),
    };

    for (let i = 0; i < 3; i++) {
      state = processTurn(state, bus);
      expect(state.units[p1Warrior.id], `p1 warrior vanished on turn ${i + 1}`).toBeDefined();
      expect(state.units[p2Warrior.id], `p2 warrior vanished on turn ${i + 1}`).toBeDefined();
    }
  });

  it('warriors survive when all barbarian units are beyond chase range', () => {
    let state = createHotSeatGame(config, 'issue-87-range');
    const bus = new EventBus();

    const p1Warrior = Object.values(state.units).find(u => u.owner === 'p1' && u.type === 'warrior')!;
    const p2Warrior = Object.values(state.units).find(u => u.owner === 'p2' && u.type === 'warrior')!;

    // Verify all barbarian units are beyond BARBARIAN_CHASE_RANGE from player warriors
    const barbarianUnits = Object.values(state.units).filter(u => u.owner === 'barbarian');
    for (const barb of barbarianUnits) {
      const distToP1 = hexDistance(barb.position, p1Warrior.position);
      const distToP2 = hexDistance(barb.position, p2Warrior.position);
      // If a barb IS within range, move it far away for this test
      if (distToP1 <= BARBARIAN_CHASE_RANGE || distToP2 <= BARBARIAN_CHASE_RANGE) {
        state = { ...state, units: { ...state.units } };
        delete state.units[barb.id];
      }
    }

    const next = processTurn(state, bus);
    expect(next.units[p1Warrior.id], 'p1 warrior survived out-of-range barbarians').toBeDefined();
    expect(next.units[p2Warrior.id], 'p2 warrior survived out-of-range barbarians').toBeDefined();
  });
});
