import { describe, it, expect } from 'vitest';
import { canUpgradeUnit, getUpgradeCost, applyUpgrade } from '@/systems/unit-upgrade-system';
import type { Unit } from '@/core/types';

function makeUnit(type: string, position = { q: 0, r: 0 }): Unit {
  return { id: 'u1', type: type as any, owner: 'player', position, health: 70, movementPointsLeft: 2, hasActed: false, hasMoved: false };
}

describe('canUpgradeUnit', () => {
  it('spy_scout upgrades to spy_informant when espionage-informants researched', () => {
    const unit = makeUnit('spy_scout', { q: 0, r: 0 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['espionage-scouting', 'espionage-informants']);
    expect(result.canUpgrade).toBe(true);
    expect(result.targetType).toBe('spy_informant');
  });

  it('spy_scout does not upgrade when espionage-informants not researched', () => {
    const unit = makeUnit('spy_scout', { q: 0, r: 0 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['espionage-scouting']);
    expect(result.canUpgrade).toBe(false);
  });

  it('cannot upgrade unit not standing on the city tile', () => {
    const unit = makeUnit('spy_scout', { q: 5, r: 5 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['espionage-scouting', 'espionage-informants']);
    expect(result.canUpgrade).toBe(false);
  });
});

describe('getUpgradeCost', () => {
  it('returns half of the target unit production cost', () => {
    const cost = getUpgradeCost('spy_informant');
    expect(cost).toBe(25); // spy_informant costs 50 in TRAINABLE_UNITS, half = 25
  });
});

describe('applyUpgrade', () => {
  it('changes unit type, heals to full health, and consumes action', () => {
    const unit = makeUnit('spy_scout');
    const upgraded = applyUpgrade(unit, 'spy_informant');
    expect(upgraded.type).toBe('spy_informant');
    expect(upgraded.health).toBe(100);
    expect(upgraded.hasActed).toBe(true);
    expect(upgraded.movementPointsLeft).toBe(0);
  });
});
