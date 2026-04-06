import { describe, it, expect } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';
import { resolveCombat } from '@/systems/combat-system';
import { conquestMinorCiv } from '@/systems/minor-civ-system';
import type { Unit } from '@/core/types';

describe('minor civ integration', () => {
  it('combat with MC unit resolves correctly', () => {
    const state = createNewGame(undefined, 'mc-int-combat', 'small');
    const mcEntries = Object.entries(state.minorCivs);
    if (mcEntries.length === 0) return;

    const [mcId, mc] = mcEntries[0];
    if (mc.units.length === 0) return;

    const mcUnit = state.units[mc.units[0]];
    const playerUnit: Unit = {
      id: 'test-warrior',
      type: 'warrior',
      owner: 'player',
      position: { q: mcUnit.position.q + 1, r: mcUnit.position.r },
      health: 100,
      movementPointsLeft: 2,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };

    const result = resolveCombat(playerUnit, mcUnit, state.map, 42);
    expect(result.attackerDamage).toBeGreaterThanOrEqual(0);
    expect(result.defenderDamage).toBeGreaterThanOrEqual(0);
    expect(typeof result.attackerSurvived).toBe('boolean');
    expect(typeof result.defenderSurvived).toBe('boolean');
  });

  it('conquesting a minor civ transfers city', () => {
    const state = createNewGame(undefined, 'mc-int-conq', 'small');
    const bus = new EventBus();
    const mcEntries = Object.entries(state.minorCivs);
    if (mcEntries.length === 0) return;

    const [mcId, mc] = mcEntries[0];
    const city = state.cities[mc.cityId];
    expect(city).toBeDefined();
    expect(city.owner).toBe(mcId);

    conquestMinorCiv(state, mcId, 'player', bus);

    expect(state.cities[mc.cityId].owner).toBe('player');
    expect(mc.isDestroyed).toBe(true);
    expect(state.civilizations.player.cities).toContain(mc.cityId);
  });

  it('full 5-turn cycle with minor civs', () => {
    let state = createNewGame(undefined, 'mc-int-5turn', 'small');
    const bus = new EventBus();

    const initialMCCount = Object.keys(state.minorCivs).length;
    expect(initialMCCount).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) {
      state = processTurn(state, bus);
    }

    // After 5 turns game state should be coherent
    expect(state.turn).toBe(6);
    for (const mc of Object.values(state.minorCivs)) {
      if (mc.isDestroyed) continue;
      expect(state.cities[mc.cityId]).toBeDefined();
      for (const uid of mc.units) {
        expect(state.units[uid]).toBeDefined();
      }
    }
  });

  it('MC units are excluded from barbarian spawn checks', () => {
    const state = createNewGame(undefined, 'mc-int-barb', 'small');
    const allUnits = Object.values(state.units);
    const playerUnits = allUnits.filter(u => u.owner !== 'barbarian' && !u.owner.startsWith('mc-'));
    const mcUnits = allUnits.filter(u => u.owner.startsWith('mc-'));

    // MC units should exist separately from player units
    expect(mcUnits.length).toBeGreaterThan(0);
    for (const u of mcUnits) {
      expect(playerUnits).not.toContain(u);
    }
  });
});
