import { describe, it, expect } from 'vitest';
import { createEspionageCivState, createSpyFromUnit, attemptInfiltration, getInfiltrationSuccessChance } from '@/systems/espionage-system';

describe('getInfiltrationSuccessChance', () => {
  it('spy_scout with 0 XP against 0 CI: ~0.55', () => {
    expect(getInfiltrationSuccessChance('spy_scout', 0, 0)).toBeCloseTo(0.55);
  });

  it('high CI reduces success chance', () => {
    const low = getInfiltrationSuccessChance('spy_scout', 0, 0);
    const high = getInfiltrationSuccessChance('spy_scout', 0, 80);
    expect(high).toBeLessThan(low);
  });

  it('clamped to minimum 0.10', () => {
    expect(getInfiltrationSuccessChance('spy_scout', 0, 100)).toBeGreaterThanOrEqual(0.10);
  });

  it('clamped to maximum 0.90', () => {
    expect(getInfiltrationSuccessChance('spy_operative', 100, 0)).toBeLessThanOrEqual(0.90);
  });

  it('experience increases success chance', () => {
    const noXp = getInfiltrationSuccessChance('spy_scout', 0, 0);
    const withXp = getInfiltrationSuccessChance('spy_scout', 50, 0);
    expect(withXp).toBeGreaterThan(noXp);
  });
});

describe('attemptInfiltration', () => {
  function makeSpy() {
    const base = { ...createEspionageCivState(), maxSpies: 1 };
    return createSpyFromUnit(base, 'unit-1', 'player', 'spy_scout', 'seed').state;
  }

  it('on success: spy status becomes stationed (era2+), removeUnitFromMap true', () => {
    // spy_informant is era2+ — infiltrates cleanly
    const base = { ...createEspionageCivState(), maxSpies: 1 };
    const civEsp = createSpyFromUnit(base, 'unit-1', 'player', 'spy_informant', 'seed').state;
    // Use a seed that reliably succeeds (roll < 0.65 base chance)
    let result: ReturnType<typeof attemptInfiltration> | null = null;
    for (let i = 0; i < 50; i++) {
      result = attemptInfiltration(civEsp, 'unit-1', 'spy_informant', 'city-enemy-1', { q: 5, r: 3 }, 0, `success-seed-${i}`);
      if (result.removeUnitFromMap) break;
    }
    expect(result!.removeUnitFromMap).toBe(true);
    expect(result!.civEsp.spies['unit-1'].status).toBe('stationed');
    expect(result!.civEsp.spies['unit-1'].infiltrationCityId).toBe('city-enemy-1');
    expect(result!.civEsp.spies['unit-1'].cityVisionTurnsLeft).toBe(5);
  });

  it('era1 spy_scout: stays on map with cooldown on success, era1ScoutResult defined', () => {
    const civEsp = makeSpy();
    let result: ReturnType<typeof attemptInfiltration> | null = null;
    for (let i = 0; i < 50; i++) {
      result = attemptInfiltration(civEsp, 'unit-1', 'spy_scout', 'city-enemy-1', { q: 5, r: 3 }, 0, `era1-seed-${i}`);
      if (!result.caught && result.era1ScoutResult !== undefined) break;
    }
    expect(result!.removeUnitFromMap).toBe(false);
    expect(result!.era1ScoutResult).toBeDefined();
    expect(result!.civEsp.spies['unit-1'].status).toBe('cooldown');
  });

  it('on failure (not caught): spy status cooldown, unit stays on map', () => {
    const civEsp = makeSpy();
    let result: ReturnType<typeof attemptInfiltration> | null = null;
    for (let i = 0; i < 200; i++) {
      result = attemptInfiltration(civEsp, 'unit-1', 'spy_scout', 'city-enemy-1', { q: 5, r: 3 }, 0, `fail-seed-${i}`);
      if (!result.removeUnitFromMap && !result.caught && result.era1ScoutResult === undefined) break;
    }
    expect(result!.removeUnitFromMap).toBe(false);
    expect(result!.civEsp.spies['unit-1'].status).toBe('cooldown');
    expect(result!.civEsp.spies['unit-1'].cooldownTurns).toBeGreaterThan(0);
  });

  it('throws if spy is not idle', () => {
    let civEsp = makeSpy();
    civEsp = { ...civEsp, spies: { ...civEsp.spies, 'unit-1': { ...civEsp.spies['unit-1'], status: 'stationed' as any } } };
    expect(() => attemptInfiltration(civEsp, 'unit-1', 'spy_scout', 'city-1', { q: 0, r: 0 }, 0, 'seed')).toThrow();
  });
});
