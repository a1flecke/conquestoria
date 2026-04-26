import { describe, it, expect } from 'vitest';
import { processCity, BUILDINGS } from '@/systems/city-system';
import { applyBuildingCI, createEspionageCivState } from '@/systems/espionage-system';

describe('espionage building definitions', () => {
  it('safehouse is defined with espionage category', () => {
    expect(BUILDINGS['safehouse']).toBeDefined();
    expect(BUILDINGS['safehouse'].category).toBe('espionage');
  });

  it('intelligence-agency is defined with espionage category', () => {
    expect(BUILDINGS['intelligence-agency']).toBeDefined();
    expect(BUILDINGS['intelligence-agency'].techRequired).toBe('espionage-informants');
  });

  it('security-bureau is defined with espionage category', () => {
    expect(BUILDINGS['security-bureau']).toBeDefined();
    expect(BUILDINGS['security-bureau'].techRequired).toBe('counter-intelligence');
  });
});

describe('applyBuildingCI', () => {
  it('intelligence-agency gives +20 CI per turn', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['intelligence-agency'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(20);
  });

  it('intelligence-agency CI halved (to +10) when digital-surveillance researched', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['intelligence-agency'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, ['digital-surveillance']);
    expect(result.counterIntelligence['c1']).toBe(10);
  });

  it('city without intelligence-agency gets no CI from that building', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: [] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBeUndefined();
  });

  it('security-bureau gives +30 CI per turn', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(30);
  });

  it('security-bureau CI halved (to +15) when cyber-warfare researched', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, ['cyber-warfare']);
    expect(result.counterIntelligence['c1']).toBe(15);
  });

  it('city without security-bureau gets no CI from that building', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: [] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBeUndefined();
  });

  it('both buildings stack CI', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['intelligence-agency', 'security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(50); // 20 + 30
  });

  it('CI is capped at 100', () => {
    const civEsp = { ...createEspionageCivState(), counterIntelligence: { c1: 90 } };
    const city = { id: 'c1', buildings: ['intelligence-agency', 'security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(100);
  });
});

describe('safehouse spy training cost reduction', () => {
  const baseCity = {
    id: 'c1',
    food: 0, foodNeeded: 10, population: 1,
    productionProgress: 0,
    productionQueue: ['spy_scout'],
    buildings: ['safehouse'],
    ownedTiles: [],
    buildingGrid: {},
  } as any;

  const baseMap = { tiles: {}, width: 10, height: 10, wrap: false } as any;

  it('safehouse reduces spy_scout training cost by 25% (30 → 23)', () => {
    // spy_scout costs 30; with safehouse 25% discount: ceil(30 * 0.75) = 23
    const city = { ...baseCity, productionProgress: 22 };
    const result = processCity(city, baseMap, 0, 0, undefined, ['espionage-scouting']);
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, productionProgress: 23 };
    const result2 = processCity(city2, baseMap, 0, 0, undefined, ['espionage-scouting']);
    expect(result2.completedUnit).toBe('spy_scout');
  });

  it('safehouse does NOT reduce training cost for non-spy units', () => {
    // warrior costs 8; safehouse discount should not apply
    const city = { ...baseCity, productionQueue: ['warrior'], productionProgress: 7 };
    const result = processCity(city, baseMap, 0, 0, undefined, []);
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, productionQueue: ['warrior'], productionProgress: 8 };
    const result2 = processCity(city2, baseMap, 0, 0, undefined, []);
    expect(result2.completedUnit).toBe('warrior');
  });

  it('without safehouse spy_scout requires full 30 production', () => {
    const city = { ...baseCity, buildings: [], productionProgress: 29 };
    const result = processCity(city, baseMap, 0, 0, undefined, ['espionage-scouting']);
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, buildings: [], productionProgress: 30 };
    const result2 = processCity(city2, baseMap, 0, 0, undefined, ['espionage-scouting']);
    expect(result2.completedUnit).toBe('spy_scout');
  });
});
